export type Participant = { name: string; roll: string };
export type LiveQuestion = { prompt: string; answers: string[]; correct: number; seconds: number };
export type SharedClass = { id: string; name: string };
export type SharedActivity = {
  id: string;
  title: string;
  classId: string;
  questions: LiveQuestion[];
  points?: number;
  presenterEnabled?: boolean;
  sessionCode?: string;
};
export type SavedReport = {
  id: string;
  title: string;
  className: string;
  createdAt: number;
  participants: Participant[];
  scores: Record<string, number>;
  classScores: Record<string, { name: string; roll: string; points: number }>;
};

export type SessionState = {
  lobbyOpen: boolean;
  live: boolean;
  title: string;
  sessionCode: string;
  className: string;
  questions: LiveQuestion[];
  activityPoints: number;
  current: number;
  participants: Participant[];
  responses: Record<string, number>;
  scores: Record<string, number>;
  results: Participant[];
  timerEnd: number;
  finished: boolean;
  updatedAt: number;
};

type SocketAttachment = { role: "student" | "host"; key?: string };
type SessionAction = Record<string, unknown> & { action?: string };

const emptyState = (sessionCode = "") : SessionState => ({
  lobbyOpen: false,
  live: false,
  title: "",
  sessionCode,
  className: "",
  questions: [],
  activityPoints: 1000,
  current: 0,
  participants: [],
  responses: {},
  scores: {},
  results: [],
  timerEnd: 0,
  finished: false,
  updatedAt: Date.now(),
});

const participantKey = (participant: Partial<Participant>) =>
  String(participant.roll || participant.name || "student").trim().toLowerCase();

export class ClassroomSession {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private session: SessionState = emptyState();

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      this.session = (await this.state.storage.get<SessionState>("session")) || emptyState();
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      const role = url.searchParams.get("role") === "student" ? "student" : "host";
      const name = url.searchParams.get("name")?.trim() || "";
      const roll = url.searchParams.get("roll")?.trim() || "";
      const attachment: SocketAttachment = { role };

      if (role === "student" && name) {
        const participant = { name, roll };
        attachment.key = participantKey(participant);
        await this.connectParticipant(participant);
      }

      this.state.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      server.send(JSON.stringify({ type: "session:snapshot", state: this.publicState(role) }));
      await this.broadcast(true);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "GET") {
      return Response.json(this.publicState("host"), { headers: { "Cache-Control": "no-store" } });
    }

    if (request.method === "POST") {
      const body = await request.json<SessionAction>();
      await this.applyAction(body);
      return Response.json(this.publicState("host"), { headers: { "Cache-Control": "no-store" } });
    }

    return new Response("Method not allowed", { status: 405 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const action = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role === "student") {
        action.name ||= this.session.participants.find(item => participantKey(item) === attachment.key)?.name;
        action.roll ||= this.session.participants.find(item => participantKey(item) === attachment.key)?.roll;
      }
      await this.applyAction(action);
    } catch {
      socket.send(JSON.stringify({ type: "session:error", message: "Invalid session message" }));
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    socket.close(code, reason);
    // Participants remain members of the room so a refresh or temporary network
    // failure never removes them from the teacher's roster.
    await this.broadcast(true);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, "Connection error");
  }

  private publicState(role: "student" | "host") {
    if (role === "host") return this.session;
    return {
      ...this.session,
      responses: {},
      scores: this.session.finished ? this.session.scores : {},
      participants: [],
      results: this.session.finished ? this.session.results : [],
    };
  }

  private async connectParticipant(participant: Participant) {
    const key = participantKey(participant);
    this.session.participants = [
      ...this.session.participants.filter(item => participantKey(item) !== key),
      participant,
    ];
    await this.persist();
  }

  private gradeCurrent() {
    const correct = this.session.questions[this.session.current]?.correct;
    const questionPoints = Math.round(
      this.session.activityPoints / Math.max(1, this.session.questions.length),
    );
    for (const participant of this.session.participants) {
      const key = participantKey(participant);
      this.session.scores[key] =
        (this.session.scores[key] || 0) + (this.session.responses[key] === correct ? questionPoints : 0);
    }
  }

  private async applyAction(body: SessionAction) {
    const action = body.action;
    if (action === "open") {
      this.session = {
        ...emptyState(String(body.sessionCode || "")),
        lobbyOpen: true,
        title: String(body.title || "Live activity"),
        className: String(body.className || ""),
        questions: Array.isArray(body.questions) ? body.questions as LiveQuestion[] : [],
        activityPoints: Number(body.activityPoints || 1000),
      };
    }
    if (action === "start" && this.session.lobbyOpen) {
      this.session.live = true;
      this.session.finished = false;
      this.session.timerEnd = Date.now() + (this.session.questions[this.session.current]?.seconds || 20) * 1000;
    }
    if (action === "question" && this.session.live) {
      this.gradeCurrent();
      this.session.current = Math.max(0, Math.min(Number(body.current || 0), this.session.questions.length - 1));
      this.session.responses = {};
      this.session.timerEnd = Date.now() + (this.session.questions[this.session.current]?.seconds || 20) * 1000;
    }
    if (action === "connect") {
      await this.connectParticipant({ name: String(body.name || "Student"), roll: String(body.roll || "") });
    }
    if (action === "answer" && this.session.live && Date.now() <= this.session.timerEnd) {
      this.session.responses[participantKey({ name: String(body.name || ""), roll: String(body.roll || "") })] = Number(body.answer);
    }
    if (action === "extend" && this.session.live) {
      this.session.timerEnd = Math.max(Date.now(), this.session.timerEnd) + 10_000;
    }
    if (action === "finish" && !this.session.finished) {
      this.gradeCurrent();
      this.session.results = [...this.session.participants];
      this.session.live = false;
      this.session.finished = true;
      this.session.timerEnd = 0;
    }
    if (action === "close") {
      this.session.lobbyOpen = false;
      this.session.live = false;
      this.session.timerEnd = 0;
    }
    this.session.updatedAt = Date.now();
    await this.persist();
    await this.broadcast(action === "connect" || action === "answer");
  }

  private async persist() {
    await this.state.storage.put("session", this.session);
  }

  private async broadcast(hostsOnly = false) {
    const hostMessage = JSON.stringify({ type: "session:snapshot", state: this.publicState("host") });
    const studentMessage = hostsOnly ? "" : JSON.stringify({ type: "session:snapshot", state: this.publicState("student") });
    for (const socket of this.state.getWebSockets()) {
      try {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (attachment?.role === "student") {
          if (!hostsOnly) socket.send(studentMessage);
        } else socket.send(hostMessage);
      } catch {
        // A socket can close between getWebSockets() and send().
      }
    }
  }
}
