type Participant = { name: string; roll: string };
type LiveQuestion = { prompt: string; answers: string[]; correct: number; seconds: number };
type SessionState = {
  lobbyOpen: boolean;
  live: boolean;
  title: string;
  className: string;
  questions: LiveQuestion[];
  current: number;
  participants: Participant[];
  responses: Record<string, number>;
  scores: Record<string, number>;
  results: Participant[];
  overallScores: Record<string, Record<string, { name:string; roll:string; points:number }>>;
  timerEnd: number;
  finished: boolean;
  updatedAt: number;
};

const root = globalThis as typeof globalThis & { __pulseClassSession?: SessionState };

function session() {
  if (!root.__pulseClassSession) root.__pulseClassSession = {
    lobbyOpen: false, live: false, title: "", className: "", questions: [],
    current: 0, participants: [], responses: {}, scores: {}, results: [], overallScores: {}, timerEnd: 0,
    finished: false, updatedAt: Date.now(),
  };
  root.__pulseClassSession.results ||= [];
  root.__pulseClassSession.overallScores ||= {};
  return root.__pulseClassSession;
}

function gradeCurrent(state:SessionState) {
  const correct = state.questions[state.current]?.correct;
  for (const participant of state.participants) {
    const key = String(participant.roll || participant.name).toLowerCase();
    state.scores[key] = (state.scores[key] || 0) + (state.responses[key] === correct ? 1000 : 0);
  }
}

export async function GET() {
  return Response.json(session(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json();
  const state = session();
  if (body.action === "open") Object.assign(state, { lobbyOpen:true, live:false, title:body.title||"Live activity", className:body.className||"", questions:body.questions||[], current:0, responses:{}, scores:{}, results:[], timerEnd:0, finished:false });
  if (body.action === "start") { state.live = true; state.finished = false; state.timerEnd = Date.now() + (state.questions[state.current]?.seconds || 20) * 1000; }
  if (body.action === "question") { gradeCurrent(state); state.current = Number(body.current || 0); state.responses = {}; state.timerEnd = Date.now() + (state.questions[state.current]?.seconds || 20) * 1000; }
  if (body.action === "connect") {
    const participant:Participant = { name:String(body.name||"Student"), roll:String(body.roll||"") };
    state.participants = [...state.participants.filter(item => participant.roll ? item.roll !== participant.roll : item.name.toLowerCase() !== participant.name.toLowerCase()), participant];
  }
  if (body.action === "answer") {
    const key = String(body.roll || body.name || "student").toLowerCase();
    state.responses[key] = Number(body.answer);
  }
  if (body.action === "extend") state.timerEnd = Math.max(Date.now(), state.timerEnd) + 10000;
  if (body.action === "finish") {
    gradeCurrent(state);
    state.results = [...state.participants];
    const classScores = state.overallScores[state.className] ||= {};
    for (const participant of state.participants) {
      const key = String(participant.roll || participant.name).toLowerCase();
      const prior = classScores[key]?.points || 0;
      classScores[key] = { ...participant, points:prior + (state.scores[key] || 0) };
    }
    state.live = false; state.finished = true; state.timerEnd = 0;
  }
  if (body.action === "close") Object.assign(state, { lobbyOpen:false, live:false, participants:[], current:0, responses:{}, timerEnd:0 });
  state.updatedAt = Date.now();
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
