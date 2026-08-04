/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ClassroomSession } from "./classroom-session";
import { WorkspaceCatalog } from "./workspace-catalog";

export { ClassroomSession, WorkspaceCatalog };

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  QUIZ_IMAGES: R2Bucket;
  CLASSROOM_SESSIONS: DurableObjectNamespace<ClassroomSession>;
  WORKSPACE_CATALOG: DurableObjectNamespace<WorkspaceCatalog>;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

async function fetchDurableObject(stub: DurableObjectStub, request: Request): Promise<Response> {
  try {
    return await stub.fetch(request);
  } catch (error) {
    const durableError = error as { overloaded?: boolean; retryable?: boolean };
    if (durableError.overloaded || durableError.retryable) {
      return Response.json(
        { error: "This room is busy. Reconnecting automatically.", retryAfter: 3 },
        { status: 503, headers: { "Retry-After": "3", "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/images" && request.method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      const size = Number(request.headers.get("content-length") || 0);
      if (!contentType.startsWith("image/") || contentType === "image/svg+xml") return Response.json({ error: "Upload a PNG, JPEG, WebP, or AVIF image." }, { status: 415 });
      if (size > 1024 * 1024) return Response.json({ error: "The optimized image must be smaller than 1 MB." }, { status: 413 });
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 1024 * 1024) return Response.json({ error: "The optimized image must be smaller than 1 MB." }, { status: 413 });
      const extension = contentType.includes("avif") ? "avif" : contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
      const key = `quiz/${crypto.randomUUID()}.${extension}`;
      await env.QUIZ_IMAGES.put(key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } });
      return Response.json({ url: `${url.origin}/api/images/${key}` });
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
      const key = url.pathname.slice("/api/images/".length);
      if (!/^quiz\/[a-z0-9-]+\.(webp|avif|png|jpg)$/.test(key)) return new Response("Not found", { status: 404 });
      const object = await env.QUIZ_IMAGES.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("ETag", object.httpEtag);
      return new Response(object.body, { headers });
    }

    if (url.pathname === "/api/catalog" || url.pathname === "/api/catalog/ws") {
      const workspace = (url.searchParams.get("workspace") || "srikanth-reddy").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
      const id = env.WORKSPACE_CATALOG.idFromName(`workspace:${workspace}`);
      return fetchDurableObject(env.WORKSPACE_CATALOG.get(id), request);
    }

    if (url.pathname === "/api/session" || url.pathname === "/api/session/ws") {
      let code = url.searchParams.get("code")?.replace(/\D/g, "") || "";
      if (!code && request.method === "POST") {
        const body = await request.clone().json<Record<string, unknown>>().catch(() => ({}));
        code = String(body.sessionCode || "").replace(/\D/g, "");
      }
      if (!/^\d{6}$/.test(code)) {
        return Response.json({ error: "A valid six-digit session code is required." }, { status: 400 });
      }
      const id = env.CLASSROOM_SESSIONS.idFromName(`session:${code}`);
      return fetchDurableObject(env.CLASSROOM_SESSIONS.get(id, { locationHint: "apac" }), request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
