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
  updatedAt: number;
};

const root = globalThis as typeof globalThis & { __pulseClassSession?: SessionState };

function session() {
  if (!root.__pulseClassSession) root.__pulseClassSession = {
    lobbyOpen: false, live: false, title: "", className: "", questions: [],
    current: 0, participants: [], updatedAt: Date.now(),
  };
  return root.__pulseClassSession;
}

export async function GET() {
  return Response.json(session(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json();
  const state = session();
  if (body.action === "open") Object.assign(state, { lobbyOpen:true, live:false, title:body.title||"Live activity", className:body.className||"", questions:body.questions||[], current:0 });
  if (body.action === "start") state.live = true;
  if (body.action === "question") state.current = Number(body.current || 0);
  if (body.action === "connect") {
    const participant:Participant = { name:String(body.name||"Student"), roll:String(body.roll||"") };
    state.participants = [...state.participants.filter(item => participant.roll ? item.roll !== participant.roll : item.name.toLowerCase() !== participant.name.toLowerCase()), participant];
  }
  if (body.action === "close") Object.assign(state, { lobbyOpen:false, live:false, participants:[], current:0 });
  state.updatedAt = Date.now();
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
