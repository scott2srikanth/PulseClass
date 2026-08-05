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
  UPLOAD_AUTH_SECRET?: string;
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

const IMAGE_MAX_BYTES = 450 * 1024;
const TEACHER_USER = "teacher@pulseclass.test";
const TEACHER_PASSWORD = "Pulse@2026";
const uploadAuthSecret=(request:Request,env:Env)=>env.UPLOAD_AUTH_SECRET||`pulseclass:${new URL(request.url).hostname}:${TEACHER_PASSWORD}:upload-session-v1`;

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function signTeacherSession(expires:string, secret:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`teacher:${expires}`)));
}

async function isTeacherRequest(request:Request, env:Env) {
  const secret=uploadAuthSecret(request,env);
  const token=request.headers.get("cookie")?.match(/(?:^|;\s*)pc_teacher=([^;]+)/)?.[1];
  if(!token)return false;
  const [expires,signature]=token.split(".");
  if(!expires||!signature||Number(expires)<=Date.now())return false;
  return signature===await signTeacherSession(expires,secret);
}

async function withinUploadLimit(request:Request, ctx:ExecutionContext) {
  try {
    const identity=request.headers.get("cf-connecting-ip")||"unknown";
    const digest=bytesToHex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity))).slice(0,24);
    const key=new Request(`${new URL(request.url).origin}/__pulseclass-rate/image-upload/${digest}`);
    const cached=await caches.default.match(key);const count=Number(await cached?.text()||0);
    if(count>=30)return false;
    ctx.waitUntil(caches.default.put(key,new Response(String(count+1),{headers:{"Cache-Control":"public, max-age=3600"}})));
  } catch { /* Cache rate limiting is best-effort; teacher authentication still applies. */ }
  return true;
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

    if (url.pathname === "/api/auth/teacher" && request.method === "POST") {
      const secret=uploadAuthSecret(request,env);
      const body=await request.json<{username?:string;password?:string}>().catch(()=>({}));
      if(body.username?.trim().toLowerCase()!==TEACHER_USER||body.password!==TEACHER_PASSWORD)return Response.json({error:"The username or password is incorrect."},{status:401});
      const expires=String(Date.now()+12*60*60*1000);const signature=await signTeacherSession(expires,secret);const secure=url.protocol==="https:"?" Secure;":"";
      return Response.json({ok:true},{headers:{"Set-Cookie":`pc_teacher=${expires}.${signature}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=43200`,"Cache-Control":"no-store"}});
    }

    if (url.pathname === "/api/auth/teacher" && request.method === "DELETE") {
      return Response.json({ok:true},{headers:{"Set-Cookie":"pc_teacher=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0","Cache-Control":"no-store"}});
    }

    if (url.pathname === "/api/images" && request.method === "POST") {
      if(!await isTeacherRequest(request,env))return Response.json({error:"Your teacher session expired. Sign in again to upload images."},{status:401});
      if(!await withinUploadLimit(request,ctx))return Response.json({error:"Upload limit reached. Try again in one hour."},{status:429,headers:{"Retry-After":"3600"}});
      const contentType = request.headers.get("content-type") || "";
      const size = Number(request.headers.get("content-length") || 0);
      if (!contentType.startsWith("image/") || contentType === "image/svg+xml") return Response.json({ error: "Upload a PNG, JPEG, WebP, or AVIF image." }, { status: 415 });
      if (size > IMAGE_MAX_BYTES) return Response.json({ error: "The optimized image must be smaller than 450 KB." }, { status: 413 });
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > IMAGE_MAX_BYTES) return Response.json({ error: "The optimized image must be smaller than 450 KB." }, { status: 413 });
      const extension = contentType.includes("avif") ? "avif" : contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
      const hash=bytesToHex(await crypto.subtle.digest("SHA-256",bytes));const key=`quiz/${hash}.${extension}`;
      const existing=await env.QUIZ_IMAGES.head(key);
      if(!existing)await env.QUIZ_IMAGES.put(key,bytes,{httpMetadata:{contentType,cacheControl:"public, max-age=31536000, immutable"},customMetadata:{uploadedAt:new Date().toISOString()}});
      return Response.json({url:`${url.origin}/api/images/${key}`,deduplicated:Boolean(existing)});
    }

    if (url.pathname === "/api/images/cleanup" && request.method === "DELETE") {
      if(!await isTeacherRequest(request,env))return Response.json({error:"Your teacher session expired. Sign in again."},{status:401});
      const body=await request.json<{candidates?:string[];keep?:string[]}>().catch(()=>({}));
      const keep=new Set((body.keep||[]).map(value=>new URL(value,url.origin).pathname));let deleted=0;
      for(const value of (body.candidates||[]).slice(0,100)){
        let pathname="";try{pathname=new URL(value,url.origin).pathname}catch{continue}
        if(keep.has(pathname)||!pathname.startsWith("/api/images/quiz/"))continue;
        const key=pathname.slice("/api/images/".length);if(!/^quiz\/[a-z0-9-]+\.(webp|avif|png|jpg)$/.test(key))continue;
        await env.QUIZ_IMAGES.delete(key);deleted++;
        ctx.waitUntil(caches.default.delete(new Request(`${url.origin}/api/images/${key}`)));
      }
      return Response.json({deleted});
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
      const key = url.pathname.slice("/api/images/".length);
      if (!/^quiz\/[a-f0-9-]+\.(webp|avif|png|jpg)$/.test(key)) return new Response("Not found", { status: 404 });
      const cacheKey=new Request(request.url,request);const cached=await caches.default.match(cacheKey);if(cached)return cached;
      const object = await env.QUIZ_IMAGES.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("ETag", object.httpEtag);
      const response=new Response(object.body,{headers});ctx.waitUntil(caches.default.put(cacheKey,response.clone()));return response;
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
