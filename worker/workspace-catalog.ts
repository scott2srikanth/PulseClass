import type { SavedReport, SharedActivity, SharedClass } from "./classroom-session";

type CatalogState = {
  classes: SharedClass[];
  activities: SharedActivity[];
  reports: SavedReport[];
  overallScores: Record<string, Record<string, { name: string; roll: string; points: number }>>;
  updatedAt: number;
};

const emptyCatalog = (): CatalogState => ({
  classes: [], activities: [], reports: [], overallScores: {}, updatedAt: Date.now(),
});

export class WorkspaceCatalog {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private catalog: CatalogState = emptyCatalog();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      this.catalog = (await this.state.storage.get<CatalogState>("catalog")) || emptyCatalog();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "catalog:snapshot", state: this.catalog }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === "GET") return Response.json(this.catalog, { headers: { "Cache-Control": "no-store" } });
    if (request.method === "POST") {
      const body = await request.json<Record<string, unknown>>();
      if (body.action === "catalog") {
        this.catalog.classes = Array.isArray(body.classes) ? body.classes as SharedClass[] : [];
        this.catalog.activities = Array.isArray(body.activities) ? body.activities as SharedActivity[] : [];
      }
      if (body.action === "report" && body.report) {
        const report = body.report as SavedReport;
        if (!this.catalog.reports.some(item => item.id === report.id)) this.catalog.reports.unshift(report);
        if (body.overallScores) this.catalog.overallScores = {
          ...this.catalog.overallScores,
          ...body.overallScores as CatalogState["overallScores"],
        };
      }
      this.catalog.updatedAt = Date.now();
      await this.state.storage.put("catalog", this.catalog);
      await this.broadcast();
      return Response.json(this.catalog, { headers: { "Cache-Control": "no-store" } });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    try {
      const body = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      await this.fetch(new Request("https://catalog.internal/", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }));
    } catch {
      socket.send(JSON.stringify({ type: "catalog:error", message: "Invalid catalog message" }));
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) { socket.close(code, reason); }
  webSocketError(socket: WebSocket) { socket.close(1011, "Connection error"); }

  private async broadcast() {
    const message = JSON.stringify({ type: "catalog:snapshot", state: this.catalog });
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(message); } catch { /* socket closed during broadcast */ }
    }
  }
}
