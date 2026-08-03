type Participant = { name: string; roll: string };
type LiveQuestion = { prompt: string; answers: string[]; correct: number; seconds: number };
type SharedClass = { id:string; name:string };
type SharedActivity = { id:string; title:string; classId:string; questions:LiveQuestion[]; points?:number; presenterEnabled?:boolean };
type SavedReport = { id:string; title:string; className:string; createdAt:number; participants:Participant[]; scores:Record<string,number>; classScores:Record<string,{name:string;roll:string;points:number}> };
type SessionState = {
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
  overallScores: Record<string, Record<string, { name:string; roll:string; points:number }>>;
  timerEnd: number;
  finished: boolean;
  reports: SavedReport[];
  catalogClasses: SharedClass[];
  catalogActivities: SharedActivity[];
  catalogUpdatedAt: number;
  updatedAt: number;
};

const root = globalThis as typeof globalThis & { __pulseClassSession?: SessionState };

function session() {
  if (!root.__pulseClassSession) root.__pulseClassSession = {
    lobbyOpen: false, live: false, title: "", sessionCode:"482938", className: "", questions: [], activityPoints:1000,
    current: 0, participants: [], responses: {}, scores: {}, results: [], overallScores: {}, timerEnd: 0,
    finished: false, reports:[], catalogClasses:[], catalogActivities:[], catalogUpdatedAt:0, updatedAt: Date.now(),
  };
  root.__pulseClassSession.results ||= [];
  root.__pulseClassSession.overallScores ||= {};
  root.__pulseClassSession.reports ||= [];
  root.__pulseClassSession.catalogClasses ||= [];
  root.__pulseClassSession.catalogActivities ||= [];
  root.__pulseClassSession.catalogUpdatedAt ||= 0;
  root.__pulseClassSession.sessionCode ||= "482938";
  return root.__pulseClassSession;
}

function gradeCurrent(state:SessionState) {
  const correct = state.questions[state.current]?.correct;
  for (const participant of state.participants) {
    const key = String(participant.roll || participant.name).toLowerCase();
    const questionPoints = Math.round(state.activityPoints / Math.max(1,state.questions.length));
    state.scores[key] = (state.scores[key] || 0) + (state.responses[key] === correct ? questionPoints : 0);
  }
}

export async function GET() {
  return Response.json(session(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json();
  const state = session();
  if (body.action === "catalog") { state.catalogClasses = Array.isArray(body.classes)?body.classes:[]; state.catalogActivities = Array.isArray(body.activities)?body.activities:[]; state.catalogUpdatedAt = Date.now(); }
  if (body.action === "open") Object.assign(state, { lobbyOpen:true, live:false, title:body.title||"Live activity", sessionCode:String(body.sessionCode||"482938"), className:body.className||"", questions:body.questions||[], activityPoints:Number(body.activityPoints||1000), current:0, responses:{}, scores:{}, results:[], timerEnd:0, finished:false });
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
    state.reports.unshift({id:`report-${Date.now()}`,title:state.title,className:state.className,createdAt:Date.now(),participants:[...state.participants],scores:{...state.scores},classScores:{...classScores}});
    state.live = false; state.finished = true; state.timerEnd = 0;
  }
  if (body.action === "close") Object.assign(state, { lobbyOpen:false, live:false, participants:[], current:0, responses:{}, timerEnd:0 });
  state.updatedAt = Date.now();
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
