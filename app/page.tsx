"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, Bell, BookOpen, Check, ChevronDown,
  CircleHelp, Clock3, Copy, Ellipsis, Eye, FileText, Flame, GraduationCap,
  Home, LayoutGrid, Library, Lock, Mail, Menu, MessageSquareText,
  MoreHorizontal, Play, Plus, Search, Settings, Sparkles, Trophy, Users, X, Zap,
} from "lucide-react";

type View = "landing" | "login" | "dashboard" | "create" | "host" | "join" | "report";
type Question = { prompt: string; answers: string[]; correct: number; seconds: number };

const starterQuestions: Question[] = [
  { prompt: "Which data structure follows the LIFO principle?", answers: ["Queue", "Stack", "Linked list", "Binary tree"], correct: 1, seconds: 20 },
  { prompt: "What does CSS stand for?", answers: ["Computer Style Sheets", "Cascading Style Sheets", "Creative Style System", "Colorful Style Syntax"], correct: 1, seconds: 15 },
  { prompt: "Which HTTP status code means ‘Not Found’?", answers: ["200", "301", "404", "500"], correct: 2, seconds: 15 },
];

const nav = [
  ["dashboard", "Home", Home], ["sessions", "Sessions", Zap], ["library", "My library", Library],
  ["reports", "Reports", BarChart3], ["classes", "Classes", Users],
] as const;

function Avatar({ name, tone = "blue" }: { name: string; tone?: string }) {
  return <span className={`avatar ${tone}`}>{name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <button className="logo" aria-label="PulseClass home"><span className="logo-mark"><i /><i /><i /></span>{!compact && <b>pulse<span>class</span></b>}</button>;
}

export default function PulseClass() {
  const [view, setView] = useState<View>("landing");
  const [mobileNav, setMobileNav] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(starterQuestions);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(""), 2200); return () => clearTimeout(id); }, [toast]);
  const go = (next: View) => { setView(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  if (view === "landing") return <Landing onTeacher={() => go("login")} onStudent={() => go("join")} />;
  if (view === "login") return <TeacherLogin onLogin={() => go("dashboard")} onBack={() => go("landing")} onStudent={() => go("join")} />;

  return <main className={`app view-${view}`}>
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
    {view === "join" ? <StudentView joined={joined} setJoined={setJoined} nickname={nickname} setNickname={setNickname} selected={selectedAnswer} setSelected={setSelectedAnswer} onExit={() => { setJoined(false); setSelectedAnswer(null); go("landing"); }} /> : <>
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="side-top"><Logo /><button className="close-mobile" onClick={() => setMobileNav(false)}><X /></button></div>
        <nav>
          {nav.map(([id, label, Icon]) => <button key={id} className={view === id || (id === "sessions" && view === "host") || (id === "reports" && view === "report") ? "active" : ""} onClick={() => id === "sessions" ? go("host") : id === "reports" ? go("report") : go("dashboard")}><Icon size={19} /><span>{label}</span>{id === "sessions" && <em>3</em>}</button>)}
        </nav>
        <div className="side-section"><small>WORKSPACE</small><button><span className="class-dot">WD</span><span>Web Development</span><ChevronDown size={15} /></button></div>
        <div className="side-tip"><span><Sparkles size={16} /> PRO TIP</span><p>Invite your class and see everyone’s pulse in real time.</p><button>Invite students <ArrowRight size={14} /></button></div>
        <div className="side-bottom"><button><CircleHelp size={19} /> Help & resources</button><button><Settings size={19} /> Settings</button><div className="profile"><Avatar name="Maya Chen" /><div><b>Maya Chen</b><span>maya@northstar.edu</span></div><MoreHorizontal size={18} /></div></div>
      </aside>
      <section className="workspace">
        <Header onMenu={() => setMobileNav(true)} onJoin={() => go("join")} />
        {view === "dashboard" && <Dashboard onCreate={() => go("create")} onHost={() => go("host")} onReport={() => go("report")} />}
        {view === "create" && <CreateQuiz questions={questions} setQuestions={setQuestions} onBack={() => go("dashboard")} onLaunch={() => go("host")} notify={setToast} />}
        {view === "host" && <HostView questions={questions} current={activeQuestion} setCurrent={setActiveQuestion} started={sessionStarted} setStarted={setSessionStarted} onExit={() => go("dashboard")} onJoin={() => go("join")} onReport={() => go("report")} notify={setToast} />}
        {view === "report" && <ReportView onBack={() => go("dashboard")} />}
      </section>
    </>}
  </main>;
}

function Landing({ onTeacher, onStudent }: { onTeacher: () => void; onStudent: () => void }) {
  return <main className="marketing">
    <nav className="marketing-nav"><Logo/><div className="marketing-links"><a href="#features">How it works</a><a href="#features">Features</a><a href="#results">For schools</a></div><div className="marketing-actions"><button className="text-button" onClick={onStudent}>Join a session</button><button className="nav-login" onClick={onTeacher}>Teacher login <ArrowRight size={16}/></button></div></nav>
    <section className="landing-hero">
      <div className="landing-copy"><span className="landing-kicker"><i/> BUILT FOR LEARNING THAT MOVES</span><h1>Every voice in<br/>the room. <em>Live.</em></h1><p>Create quizzes, polls, and classroom moments that turn passive listening into active learning—without adding more work to your day.</p><div className="landing-cta"><button className="primary teacher-cta" onClick={onTeacher}><GraduationCap size={19}/> I’m a teacher</button><button className="student-cta" onClick={onStudent}><Users size={19}/> I’m a student</button></div><small><Check size={14}/> Free for teachers <span>•</span> No student accounts needed</small></div>
      <div className="landing-demo"><div className="demo-glow"/><div className="demo-window"><header><div><i/><i/><i/></div><span>LIVE SESSION · 24 STUDENTS</span><b>18s</b></header><main><small>QUESTION 4 OF 8</small><h2>Which hook handles side effects?</h2><div><span><b>A</b> useState</span><span className="demo-correct"><b>B</b> useEffect <Check size={18}/></span><span><b>C</b> useMemo</span><span><b>D</b> useRef</span></div><footer><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><strong>24 answered</strong></footer></main></div><div className="demo-float float-left"><span>⚡</span><div><b>96%</b><small>participation</small></div></div><div className="demo-float float-right"><Trophy/><div><small>LEADER</small><b>Alex R. · 4,820</b></div></div></div>
    </section>
    <div className="trust-strip"><span>Trusted in classrooms at</span><b>NORTHSTAR</b><b>HORIZON</b><b>BRIGHTON</b><b>WESTFIELD</b><b>CODELAB</b></div>
    <section className="marketing-features" id="features"><span className="landing-kicker">ONE ROOM. EVERY VOICE.</span><h2>Teaching feels better when<br/>everyone is in it.</h2><div className="feature-cards"><article><span className="feature-icon coral"><Zap/></span><h3>Start in seconds</h3><p>Choose a question, share a code, and watch your room come alive. No downloads or student accounts.</p></article><article><span className="feature-icon blue"><MessageSquareText/></span><h3>Hear the whole room</h3><p>Give every student a safe way to respond—not just the fastest hands or loudest voices.</p></article><article><span className="feature-icon mint"><BarChart3/></span><h3>Know what to teach next</h3><p>See understanding as it happens and leave every session with clear, useful insights.</p></article></div></section>
    <section className="results-band" id="results"><div><span>THE PULSECLASS EFFECT</span><h2>More participation.<br/>More understanding.</h2></div><div><strong>3.2×</strong><p>more students participate in every class</p></div><div><strong>12 min</strong><p>saved per teacher on average each session</p></div><div><strong>91%</strong><p>of teachers feel more connected to their class</p></div></section>
    <section className="bottom-cta"><span>✦</span><h2>Ready to feel the difference?</h2><p>Bring your next class to life. It takes less than a minute.</p><button className="primary" onClick={onTeacher}>Start teaching for free <ArrowRight/></button></section>
    <footer className="marketing-footer"><Logo/><span>© 2026 PulseClass. Made for curious minds.</span><div><button>Privacy</button><button>Terms</button><button>Help center</button></div></footer>
  </main>;
}

function TeacherLogin({ onLogin, onBack, onStudent }: { onLogin: () => void; onBack: () => void; onStudent: () => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [show, setShow] = useState(false); const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!email.includes("@") || password.length < 4) { setError("Enter a valid email and at least 4 characters for your password."); return; } onLogin(); };
  return <main className="login-page"><button className="login-brand" onClick={onBack}><Logo/></button><section className="login-story"><div><span className="landing-kicker"><i/> TEACH WITH THE WHOLE ROOM</span><h1>Your classroom is<br/>waiting to <em>light up.</em></h1><p>Run live activities, involve every student, and see understanding take shape in real time.</p><div className="login-quote"><div className="quote-avatars"><Avatar name="AR" tone="coral"/><Avatar name="LK" tone="blue"/><Avatar name="SM" tone="mint"/></div><blockquote>“I finally hear from students who never used to raise their hands.”</blockquote><small>— Maya Chen, Computer Science</small></div></div><div className="story-orbit o1"/><div className="story-orbit o2"/></section><section className="login-form-wrap"><form className="login-form" onSubmit={submit}><span className="form-badge"><GraduationCap/></span><h2>Welcome back</h2><p>Sign in to your teacher workspace.</p><button type="button" className="google-button"><b>G</b> Continue with Google</button><div className="or"><span/>or continue with email<span/></div><label>Email address<div><Mail/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@school.edu"/></div></label><label>Password<div><Lock/><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" onClick={()=>setShow(!show)} aria-label="Show password"><Eye/></button></div></label><div className="form-options"><label><input type="checkbox"/> Keep me signed in</label><button type="button">Forgot password?</button></div>{error&&<p className="form-error">{error}</p>}<button className="primary login-submit" type="submit">Sign in to PulseClass <ArrowRight/></button><p className="signup-note">New to PulseClass? <button type="button" onClick={onLogin}>Create a free teacher account</button></p><div className="student-divider"/><button type="button" className="student-login-link" onClick={onStudent}><Users/> Joining a class? <b>Enter your session code</b><ArrowRight/></button></form></section></main>;
}

function Header({ onMenu, onJoin }: { onMenu: () => void; onJoin: () => void }) {
  return <header className="topbar"><button className="menu" onClick={onMenu}><Menu /></button><div className="mobile-logo"><Logo /></div><div className="top-search"><Search size={18} /><input placeholder="Search sessions, quizzes, reports..." /><kbd>⌘ K</kbd></div><button className="join-link" onClick={onJoin}>Join as student</button><button className="icon-btn"><Bell size={20} /><i /></button><Avatar name="Maya Chen" /></header>;
}

function Dashboard({ onCreate, onHost, onReport }: { onCreate: () => void; onHost: () => void; onReport: () => void }) {
  return <div className="page dashboard-page">
    <div className="welcome"><div><p>MONDAY, AUGUST 3</p><h1>Good morning, Maya <span>👋</span></h1><h2>Ready to get the room buzzing?</h2></div><button className="primary" onClick={onCreate}><Plus size={19} /> Create activity</button></div>
    <section className="hero-card">
      <div className="hero-copy"><span className="eyebrow"><i /> LIVE CLASSROOM</span><h3>Turn quiet rooms into<br/><em>active learning.</em></h3><p>Launch a question, hear every voice, and know exactly what to teach next.</p><div><button className="light-button" onClick={onHost}><Play size={18} fill="currentColor" /> Start live session</button><button className="ghost-button" onClick={onCreate}>Build a quiz <ArrowRight size={17} /></button></div></div>
      <div className="hero-visual"><div className="pulse-orbit one"/><div className="pulse-orbit two"/><div className="question-float"><small>LIVE • Q4 OF 8</small><b>Which hook handles side effects?</b><div><span>useState</span><span className="answer-green">useEffect <Check size={15}/></span></div><footer><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><b>24 answered</b></footer></div><div className="score-float"><Trophy size={18}/><div><small>LEADER</small><b>Alex R.</b></div><strong>4,820</strong></div></div>
    </section>
    <div className="section-title"><div><h3>At a glance</h3><p>Your classroom activity this week</p></div><button>This week <ChevronDown size={15}/></button></div>
    <div className="stats-grid">
      <Stat icon={<Zap/>} tone="coral" value="8" label="Sessions run" trend="+24%" />
      <Stat icon={<Users/>} tone="blue" value="186" label="Students reached" trend="+18%" />
      <Stat icon={<MessageSquareText/>} tone="mint" value="1,248" label="Responses" trend="+31%" />
      <Stat icon={<Flame/>} tone="gold" value="82%" label="Avg. engagement" trend="+6%" />
    </div>
    <div className="content-grid">
      <section className="panel recent"><div className="panel-head"><div><h3>Recent sessions</h3><p>Pick up where you left off</p></div><button>View all <ArrowRight size={15}/></button></div>
        <SessionRow icon="JS" tone="yellow" title="JavaScript Fundamentals" meta="Today, 10:30 AM · 28 students" score="86%" onClick={onReport}/>
        <SessionRow icon="UX" tone="purple" title="UX Research Methods" meta="Aug 1, 2:00 PM · 22 students" score="78%" onClick={onReport}/>
        <SessionRow icon="DB" tone="blue" title="Database Design Check-in" meta="Jul 30, 9:00 AM · 31 students" score="91%" onClick={onReport}/>
      </section>
      <section className="panel insight"><div className="panel-head"><div><h3>Class pulse</h3><p>Web Development · Last 5 sessions</p></div><button><Ellipsis/></button></div><div className="donut"><div><strong>82%</strong><span>engaged</span></div></div><div className="pulse-legend"><span><i className="mint"/>Answered <b>82%</b></span><span><i className="blue"/>Correct <b>74%</b></span><span><i className="cream"/>No response <b>6%</b></span></div><div className="insight-note"><Sparkles size={17}/><p><b>Nice momentum!</b> Engagement is up 12% since last week.</p></div></section>
    </div>
    <div className="section-title library-title"><div><h3>From your library</h3><p>Ready when you are</p></div><button>Explore library <ArrowRight size={15}/></button></div>
    <div className="quiz-grid"><QuizCard tone="coral" label="QUIZ" title="Intro to React Hooks" details="10 questions · 8 min" plays="Played 6 times" onClick={onHost}/><QuizCard tone="blue" label="POLL" title="Sprint Retrospective" details="6 questions · Anonymous" plays="Played 3 times" onClick={onHost}/><QuizCard tone="mint" label="EXIT TICKET" title="Today’s Learning Check" details="4 questions · 3 min" plays="Played yesterday" onClick={onHost}/><button className="new-quiz" onClick={onCreate}><span><Plus/></span><b>Create something new</b><p>Quiz, poll, word cloud & more</p></button></div>
  </div>;
}

function Stat({ icon, tone, value, label, trend }: { icon: React.ReactNode; tone: string; value: string; label: string; trend: string }) { return <div className="stat"><span className={`stat-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><p>{label}</p></div><em>{trend}</em></div>; }
function SessionRow({ icon, tone, title, meta, score, onClick }: { icon:string; tone:string; title:string; meta:string; score:string; onClick:()=>void }) { return <button className="session-row" onClick={onClick}><span className={`session-icon ${tone}`}>{icon}</span><span><b>{title}</b><small>{meta}</small></span><span className="engage"><b>{score}</b><small>engagement</small></span><MoreHorizontal size={19}/></button>; }
function QuizCard({ tone, label, title, details, plays, onClick }: {tone:string;label:string;title:string;details:string;plays:string;onClick:()=>void}) { return <button className="quiz-card" onClick={onClick}><div className={`quiz-art ${tone}`}><span>{label}</span><div className="mini-bars"><i/><i/><i/><i/></div></div><div className="quiz-info"><h4>{title}</h4><p>{details}</p><footer><span>{plays}</span><MoreHorizontal size={18}/></footer></div></button>; }

function CreateQuiz({ questions, setQuestions, onBack, onLaunch, notify }: { questions:Question[];setQuestions:(q:Question[])=>void;onBack:()=>void;onLaunch:()=>void;notify:(s:string)=>void }) {
  const [selected, setSelected] = useState(0); const q = questions[selected];
  const update = (patch: Partial<Question>) => setQuestions(questions.map((item, i) => i === selected ? {...item, ...patch} : item));
  const add = () => { setQuestions([...questions, {prompt:"Type your question here...",answers:["Option A","Option B","Option C","Option D"],correct:0,seconds:20}]); setSelected(questions.length); };
  return <div className="builder"><div className="builder-bar"><button onClick={onBack}><ArrowLeft/> <span>Exit</span></button><input defaultValue="JavaScript Fundamentals"/><div><button className="secondary" onClick={()=>notify("Quiz saved")}>Save</button><button className="primary" onClick={onLaunch}><Play size={17}/> Present</button></div></div><div className="builder-body"><aside className="slides"><div><b>Questions</b><span>{questions.length}</span></div>{questions.map((item,i)=><button key={i} className={i===selected?"selected":""} onClick={()=>setSelected(i)}><em>{i+1}</em><span><small>{item.seconds}s</small><b>{item.prompt}</b><i/><i/></span></button>)}<button className="add-question" onClick={add}><Plus/> Add question</button></aside><section className="canvas"><div className="question-type"><span><LayoutGrid size={17}/> Multiple choice</span><span><Clock3 size={17}/> {q.seconds} sec</span><span><Trophy size={17}/> Standard points</span></div><textarea value={q.prompt} onChange={e=>update({prompt:e.target.value})}/><div className="answer-editor">{q.answers.map((answer,i)=><div className={`edit-answer a${i}`} key={i}><button onClick={()=>update({correct:i})} className={q.correct===i?"correct":""}>{q.correct===i?<Check/>:String.fromCharCode(65+i)}</button><input value={answer} onChange={e=>update({answers:q.answers.map((a,j)=>j===i?e.target.value:a)})}/></div>)}</div><p className="canvas-hint"><Check size={15}/> Click an answer letter to mark it correct</p></section><aside className="properties"><h3>Question settings</h3><label>Time limit<select value={q.seconds} onChange={e=>update({seconds:Number(e.target.value)})}><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option></select></label><label>Points<select><option>Standard — 1,000</option><option>Double — 2,000</option><option>No points</option></select></label><label className="toggle-line">Randomize answers <input type="checkbox" defaultChecked/></label><hr/><h3>Enhance</h3><button className="enhance"><Sparkles/> Generate with AI</button><button className="enhance"><BookOpen/> Add explanation</button></aside></div></div>;
}

function HostView({questions,current,setCurrent,started,setStarted,onExit,onJoin,onReport,notify}:{questions:Question[];current:number;setCurrent:(n:number)=>void;started:boolean;setStarted:(b:boolean)=>void;onExit:()=>void;onJoin:()=>void;onReport:()=>void;notify:(s:string)=>void}) {
  const q=questions[current]; const last=current===questions.length-1;
  if(!started) return <div className="lobby"><div className="host-top"><Logo/><button onClick={onExit}><X/> End session</button></div><div className="lobby-content"><span className="live-pill"><i/> LOBBY OPEN</span><h1>Join the session</h1><p>Go to <b>pulseclass.live</b> and enter</p><div className="join-code"><strong>482 938</strong><button onClick={()=>{navigator.clipboard?.writeText("482938");notify("Join code copied")}}><Copy/></button></div><div className="lobby-actions"><button className="secondary" onClick={onJoin}>Preview as student</button><button className="primary" onClick={()=>setStarted(true)}><Play fill="currentColor"/> Start session</button></div><div className="participants"><div><Avatar name="AR" tone="coral"/><Avatar name="LK" tone="blue"/><Avatar name="SM" tone="mint"/><Avatar name="+21" tone="dark"/></div><b>24 students are ready</b><span>Waiting for everyone to join...</span></div></div></div>;
  return <div className="host-screen"><header><button onClick={onExit}><X/></button><span>JAVASCRIPT FUNDAMENTALS</span><div><Users size={17}/> 24 <span>·</span> <b>{current+1} / {questions.length}</b></div></header><section><div className="host-question-head"><span>QUESTION {current+1}</span><div className="timer">{q.seconds}</div><span>1,000 PTS</span></div><h1>{q.prompt}</h1><div className="host-answers">{q.answers.map((a,i)=><div className={`host-answer c${i}`} key={a}><b>{String.fromCharCode(65+i)}</b><span>{a}</span><em>{[18,42,26,14][i]}%</em></div>)}</div><div className="response-count"><div>{Array.from({length:18}).map((_,i)=><i key={i}/>)}</div><b>18 / 24 answered</b></div></section><footer><button><BarChart3/> Show responses</button><div><i/> Answers are coming in live</div><button className="primary" onClick={()=>{if(last){setStarted(false);onReport()}else setCurrent(current+1)}}>{last?"Finish":"Next"} <ArrowRight/></button></footer></div>;
}

function StudentView({joined,setJoined,nickname,setNickname,selected,setSelected,onExit}:{joined:boolean;setJoined:(b:boolean)=>void;nickname:string;setNickname:(s:string)=>void;selected:number|null;setSelected:(n:number|null)=>void;onExit:()=>void}) {
  if(!joined) return <div className="student-join"><div className="student-brand"><Logo/></div><button className="exit-join" onClick={onExit}><X/></button><div className="join-panel"><span className="spark">✦</span><h1>Join the room.</h1><p>Enter the session code your teacher shared.</p><label>SESSION CODE<input defaultValue="482 938" inputMode="numeric"/></label><label>YOUR NAME<input value={nickname} placeholder="How should we call you?" onChange={e=>setNickname(e.target.value)}/></label><button className="primary" onClick={()=>setJoined(true)}>Let’s go <ArrowRight/></button><small>No account needed. Just bring your curiosity.</small></div><div className="join-decor d1"/><div className="join-decor d2"/><div className="join-decor d3"/></div>;
  return <div className="student-play"><header><Logo/><span><i/> LIVE</span><b>{nickname||"Student"} · 1,280 pts</b></header><main><p>QUESTION 1 OF 3</p><div className="student-timer"><span style={{width:"68%"}}/></div><h1>Which data structure follows the LIFO principle?</h1><div className="student-answers">{["Queue","Stack","Linked list","Binary tree"].map((a,i)=><button className={`s${i} ${selected===i?"picked":""}`} onClick={()=>setSelected(i)} key={a}><b>{String.fromCharCode(65+i)}</b>{a}{selected===i&&<Check/>}</button>)}</div>{selected!==null?<div className="submitted"><Check/><div><b>Answer locked in!</b><span>Waiting for everyone else...</span></div></div>:<p className="tap-hint">Tap an answer to submit</p>}</main></div>;
}

function ReportView({onBack}:{onBack:()=>void}) { const students=[['1','Alex Rivera','AR','9,420','92%','8.2s'],['2','Leah Kim','LK','8,980','89%','9.1s'],['3','Sam Malik','SM','8,640','86%','10.4s'],['4','Nora James','NJ','8,120','84%','11.8s'],['5','Owen Patel','OP','7,890','81%','12.1s']]; return <div className="page report-page"><div className="report-head"><button onClick={onBack}><ArrowLeft/></button><div><p>SESSION REPORT</p><h1>JavaScript Fundamentals</h1><span>August 3, 2026 · 10:30 AM · 24 participants</span></div><button className="secondary"><FileText/> Export report</button></div><div className="report-summary"><div><span className="stat-icon mint"><Users/></span><strong>24</strong><p>Participants</p></div><div><span className="stat-icon coral"><Check/></span><strong>84%</strong><p>Average accuracy</p></div><div><span className="stat-icon blue"><MessageSquareText/></span><strong>96%</strong><p>Completion rate</p></div><div><span className="stat-icon gold"><Clock3/></span><strong>9.8s</strong><p>Average response</p></div></div><div className="report-grid"><section className="panel"><div className="panel-head"><div><h3>Question performance</h3><p>Accuracy across the session</p></div></div>{[92,88,67,84,73,96,79,91].map((n,i)=><div className="question-result" key={i}><b>Q{i+1}</b><div><span style={{width:`${n}%`}}/></div><strong className={n<75?'low':''}>{n}%</strong></div>)}<div className="attention"><Sparkles/><div><b>Worth revisiting</b><p>Students found question 3 on HTTP status codes most challenging.</p></div></div></section><section className="panel leaderboard"><div className="panel-head"><div><h3>Leaderboard</h3><p>Final results</p></div><button>View all</button></div>{students.map(([rank,name,initials,pts,accuracy,time],i)=><div className="leader-row" key={name}><b className={i<3?`rank r${i}`:"rank"}>{rank}</b><Avatar name={initials} tone={i===0?"coral":i===1?"blue":"mint"}/><span><b>{name}</b><small>{accuracy} correct · {time} avg.</small></span><strong>{pts}</strong></div>)}</section></div></div>; }
