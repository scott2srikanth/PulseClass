export type Participant = { name: string; roll: string };
export type LiveQuestion = { prompt: string; answers: string[]; correct: number; seconds: number; points?:number; difficulty?:"easy"|"medium"|"hard"; type?: "text"|"code"|"image"; language?:string; code?:string; imageUrl?:string; imagePrompt?:string; alt?:string };
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
  gradedQuestions: number[];
  answerVersions: Record<string, number>;
  imageReady: Record<string, number[]>;
  revision: number;
  updatedAt: number;
};

type SocketAttachment = { role: "student" | "host"; key?: string; windowStartedAt?: number; messageCount?: number };
type SessionAction = Record<string, unknown> & { action?: string };

const MAX_STUDENTS = 400;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_STUDENT_MESSAGES_PER_SECOND = 20;
const SLOW_CLIENT_BUFFER_BYTES = 512 * 1024;
const HOST_BATCH_MS = 100;
const HOST_BATCH_COUNT = 50;
const RESULT_RETENTION_MS = 60 * 60 * 1000;

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
  gradedQuestions: [],
  answerVersions: {},
  imageReady: {},
  revision: 0,
  updatedAt: Date.now(),
});

const participantKey = (participant: Partial<Participant>) =>
  String(participant.roll || participant.name || "student").trim().toLowerCase();

export class ClassroomSession {
  private state: DurableObjectState;
  private ready: Promise<void>;
  private session: SessionState = emptyState();
  private answerFlushScheduled = false;
  private hostPendingEvents = 0;
  private hostFlushTimer?: ReturnType<typeof setTimeout>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.ready = this.state.blockConcurrencyWhile(async () => {
      this.session = (await this.state.storage.get<SessionState>("session")) || emptyState();
      this.session.gradedQuestions ||= [];
      this.session.answerVersions ||= {};
      this.session.imageReady ||= {};
      this.session.revision ||= 0;
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
        const isReturning = this.session.participants.some(item => participantKey(item) === attachment.key);
        if (!isReturning && this.session.participants.length >= MAX_STUDENTS) {
          return Response.json({ error: "This session has reached its student limit." }, { status: 429 });
        }
        await this.connectParticipant(participant);
      }

      this.state.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      server.send(JSON.stringify({ type: "session:snapshot", state: this.publicState(role) }));
      this.scheduleHostFlush();
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
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      if (raw.length > MAX_MESSAGE_BYTES) throw new Error("Message too large");
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) throw new Error("Missing connection identity");
      const now = Date.now();
      if (!attachment.windowStartedAt || now - attachment.windowStartedAt >= 1000) {
        attachment.windowStartedAt = now;
        attachment.messageCount = 0;
      }
      attachment.messageCount = (attachment.messageCount || 0) + 1;
      if (attachment.role === "student" && attachment.messageCount > MAX_STUDENT_MESSAGES_PER_SECOND) {
        socket.send(JSON.stringify({ type: "session:error", message: "Too many updates. Please slow down." }));
        return;
      }
      socket.serializeAttachment(attachment);
      const action = JSON.parse(raw);
      const allowed = attachment.role === "student" ? ["answer", "connect", "ready", "sync"] : ["open", "start", "question", "extend", "finish", "close", "sync"];
      if (!allowed.includes(String(action.action || ""))) throw new Error("Action not allowed for this role");
      if (action.action === "sync") {
        socket.send(JSON.stringify({ type: "session:snapshot", state: this.publicState(attachment.role) }));
        return;
      }
      if (attachment?.role === "student") {
        action.name ||= this.session.participants.find(item => participantKey(item) === attachment.key)?.name;
        action.roll ||= this.session.participants.find(item => participantKey(item) === attachment.key)?.roll;
      }
      const accepted = await this.applyAction(action);
      if (attachment.role === "student" && action.action === "answer") {
        socket.send(JSON.stringify({
          type: accepted ? "answer:accepted" : "answer:rejected",
          question: this.session.current,
          answer: Number(action.answer),
          eventId: action.eventId,
        }));
      }
    } catch {
      socket.send(JSON.stringify({ type: "session:error", message: "Invalid session message" }));
    }
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    socket.close(code, reason);
    // Participants remain members of the room so a refresh or temporary network
    // failure never removes them from the teacher's roster.
    this.scheduleHostFlush();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    socket.close(1011, "Connection error");
  }

  async alarm(): Promise<void> {
    await this.ready;
    if (!this.session.finished || Date.now() - this.session.updatedAt < RESULT_RETENTION_MS) {
      if (this.session.finished) await this.state.storage.setAlarm(this.session.updatedAt + RESULT_RETENTION_MS);
      return;
    }
    this.session = emptyState(this.session.sessionCode);
    await this.persist();
  }

  private publicState(role: "student" | "host") {
    if (role === "host") return this.session;
    return {
      ...this.session,
      responses: {},
      imageReady: {},
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
  }

  private gradeCurrent() {
    if (this.session.gradedQuestions.includes(this.session.current)) return;
    const correct = this.session.questions[this.session.current]?.correct;
    const questionPoints = Math.max(0, Number(this.session.questions[this.session.current]?.points) || Math.round(
      this.session.activityPoints / Math.max(1, this.session.questions.length),
    ));
    for (const participant of this.session.participants) {
      const key = participantKey(participant);
      this.session.scores[key] =
        (this.session.scores[key] || 0) + (this.session.responses[key] === correct ? questionPoints : 0);
    }
    this.session.gradedQuestions.push(this.session.current);
  }

  private async applyAction(body: SessionAction) {
    const action = body.action;
    if (action === "open") {
      await this.state.storage.deleteAlarm();
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
      const target = Math.max(0, Math.min(Number(body.current || 0), this.session.questions.length - 1));
      if (target === this.session.current) return true;
      if (target !== this.session.current + 1) return false;
      this.gradeCurrent();
      this.session.current = target;
      this.session.responses = {};
      this.session.timerEnd = Date.now() + (this.session.questions[this.session.current]?.seconds || 20) * 1000;
    }
    if (action === "connect") {
      const participant = { name: String(body.name || "Student").trim().slice(0, 80), roll: String(body.roll || "").trim().slice(0, 40) };
      const key = participantKey(participant);
      const isReturning = this.session.participants.some(item => participantKey(item) === key);
      if (!isReturning && this.session.participants.length >= MAX_STUDENTS) return false;
      await this.connectParticipant(participant);
    }
    if (action === "ready") {
      const key = participantKey({ name: String(body.name || ""), roll: String(body.roll || "") });
      const question = Math.max(0, Number(body.current || 0));
      const ready = this.session.imageReady[key] || [];
      if (!ready.includes(question)) this.session.imageReady[key] = [...ready, question];
    }
    if (action === "answer" && this.session.live && Date.now() <= this.session.timerEnd) {
      const question = Number(body.question ?? this.session.current);
      if (question !== this.session.current || this.session.gradedQuestions.includes(question)) return false;
      const answer = Number(body.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= (this.session.questions[question]?.answers.length || 0)) return false;
      const key = participantKey({ name: String(body.name || ""), roll: String(body.roll || "") });
      if (!this.session.participants.some(item => participantKey(item) === key)) return false;
      const version = Number(body.version || 0);
      if (version && version <= (this.session.answerVersions[key] || 0)) return false;
      this.session.responses[key] = answer;
      if (version) this.session.answerVersions[key] = version;
      this.session.updatedAt = Date.now();
      this.scheduleHostFlush();
      return true;
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
      await this.state.storage.setAlarm(Date.now() + RESULT_RETENTION_MS);
    }
    if (action === "close") {
      this.session.lobbyOpen = false;
      this.session.live = false;
      this.session.timerEnd = 0;
    }
    if (["open", "start", "question", "extend", "finish", "close"].includes(String(action))) this.session.revision += 1;
    this.session.updatedAt = Date.now();
    await this.persist();
    if (action === "connect" || action === "ready") this.scheduleHostFlush();
    if (action === "open") await this.broadcastAll("session:snapshot");
    if (action === "start") await this.broadcastPatch({ live: true, finished: false, timerEnd: this.session.timerEnd, current: this.session.current });
    if (action === "question") await this.broadcastPatch({ current: this.session.current, responses: {}, timerEnd: this.session.timerEnd });
    if (action === "extend") await this.broadcastPatch({ timerEnd: this.session.timerEnd });
    if (action === "finish") await this.broadcastFinished();
    if (action === "close") await this.broadcastPatch({ lobbyOpen: false, live: false, timerEnd: 0 });
    return true;
  }

  private async persist() {
    await this.state.storage.put("session", this.session);
  }

  private hostRealtimePatch() {
    return {
      participants: this.session.participants,
      responses: this.session.responses,
      responseCount: Object.keys(this.session.responses).length,
      health: this.roomHealth(),
      imageReadyCounts: this.session.questions.map((_, index) => Object.values(this.session.imageReady).filter(items => items.includes(index)).length),
      revision: this.session.revision,
      updatedAt: this.session.updatedAt,
    };
  }

  private roomHealth() {
    let studentsOnline = 0;
    let hostsOnline = 0;
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role === "student") studentsOnline += 1;
      else hostsOnline += 1;
    }
    return { studentsOnline, hostsOnline, registeredStudents: this.session.participants.length };
  }

  private scheduleHostFlush() {
    this.hostPendingEvents += 1;
    if (this.hostPendingEvents >= HOST_BATCH_COUNT) {
      if (this.hostFlushTimer) clearTimeout(this.hostFlushTimer);
      this.hostFlushTimer = undefined;
      this.answerFlushScheduled = false;
      void this.flushHosts();
      return;
    }
    if (this.answerFlushScheduled) return;
    this.answerFlushScheduled = true;
    this.hostFlushTimer = setTimeout(() => void this.flushHosts(), HOST_BATCH_MS);
  }

  private async flushHosts() {
    this.answerFlushScheduled = false;
    this.hostFlushTimer = undefined;
    this.hostPendingEvents = 0;
    await this.persist();
    await this.broadcastHosts("responses:update", this.hostRealtimePatch());
  }

  private safeSend(socket: WebSocket, message: string, critical = false) {
    try {
      if (!critical && "bufferedAmount" in socket && Number(socket.bufferedAmount) > SLOW_CLIENT_BUFFER_BYTES) return;
      socket.send(message);
    } catch { /* socket closed during send */ }
  }

  private async broadcastHosts(type: string, patch: Record<string, unknown>) {
    const message = JSON.stringify({ type, patch });
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role !== "student") this.safeSend(socket, message);
    }
  }

  private async broadcastPatch(patch: Record<string, unknown>) {
    const message = JSON.stringify({ type: "session:update", revision: this.session.revision, patch });
    for (const socket of this.state.getWebSockets()) this.safeSend(socket, message, true);
  }

  private async broadcastAll(type: string) {
    const hostMessage = JSON.stringify({ type, state: this.publicState("host") });
    const studentMessage = JSON.stringify({ type, state: this.publicState("student") });
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      this.safeSend(socket, attachment?.role === "student" ? studentMessage : hostMessage, true);
    }
  }

  private async broadcastFinished() {
    const hostMessage = JSON.stringify({ type: "activity:finished", revision: this.session.revision, patch: {
      live: false, finished: true, timerEnd: 0, scores: this.session.scores, results: this.session.results,
    } });
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role === "student") {
        const points = this.session.scores[attachment.key || ""] || 0;
        this.safeSend(socket, JSON.stringify({ type: "activity:finished", revision: this.session.revision, patch: { live: false, finished: true, timerEnd: 0, points } }), true);
      } else this.safeSend(socket, hostMessage, true);
    }
  }
}
