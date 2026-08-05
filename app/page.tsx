"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  Ellipsis,
  Eye,
  FileText,
  Flame,
  GraduationCap,
  Home,
  LayoutGrid,
  Library,
  Lock,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trophy,
  Trash2,
  Users,
  X,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Printer,
} from "lucide-react";

type View =
  | "landing"
  | "login"
  | "presenterlogin"
  | "dashboard"
  | "presenter"
  | "sessions"
  | "library"
  | "classdetail"
  | "reports"
  | "classes"
  | "students"
  | "settings"
  | "help"
  | "createchoice"
  | "aigenerate"
  | "create"
  | "host"
  | "join"
  | "report";
type Question = {
  prompt: string;
  answers: string[];
  correct: number;
  seconds: number;
  points?: number;
  difficulty?: "easy" | "medium" | "hard";
  type?: "text" | "code" | "image";
  language?: string;
  code?: string;
  imageUrl?: string;
  imagePrompt?: string;
  alt?: string;
};
type ClassRecord = { id: string; name: string };
type ActivityRecord = {
  id: string;
  title: string;
  classId: string;
  questions: Question[];
  points?: number;
  presenterEnabled?: boolean;
  sessionCode?: string;
};
type SavedReport = {
  id: string;
  title: string;
  className: string;
  createdAt: number;
  participants: Array<{ name: string; roll: string }>;
  scores: Record<string, number>;
  classScores: Record<string, { name: string; roll: string; points: number }>;
};
type RoomHealth = {
  studentsOnline: number;
  hostsOnline: number;
  registeredStudents: number;
};

const starterQuestions: Question[] = [
  {
    prompt: "Type your first question here...",
    answers: ["Option A", "Option B", "Option C", "Option D"],
    correct: 0,
    seconds: 20,
    points: 50,
    difficulty: "medium",
    type: "text",
  },
];
const activitySessionCode = (
  activity: Pick<ActivityRecord, "id" | "sessionCode">,
) => {
  if (activity.sessionCode) return activity.sessionCode;
  let hash = 0;
  for (const char of activity.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return String(100000 + (hash % 900000));
};
const formatSessionCode = (code: string) =>
  `${code.slice(0, 3)} ${code.slice(3)}`;
const questionPresentationReady = (question: Question) =>
  Boolean(
    question.prompt.trim() &&
      !question.prompt.startsWith("Type your") &&
      (question.type !== "image" || question.imageUrl?.trim()),
  );
const activityImageUrls = (items: ActivityRecord[]) =>
  items.flatMap((activity) =>
    activity.questions
      .map((question) => question.imageUrl)
      .filter((url): url is string => Boolean(url)),
  );
const cleanupStoredImages = (candidates: string[], keep: string[]) => {
  if (!candidates.length) return;
  void fetch("/api/images/cleanup", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidates: [...new Set(candidates)],
      keep: [...new Set(keep)],
    }),
  }).catch(() => {});
};

const nav = [
  ["dashboard", "Home", Home],
  ["presenter", "Presentation Portal", Play],
  ["sessions", "Sessions", Zap],
  ["library", "My Classes", GraduationCap],
  ["reports", "Reports", BarChart3],
  ["students", "Students", Users],
] as const;

function Avatar({ name, tone = "blue" }: { name: string; tone?: string }) {
  return (
    <span className={`avatar ${tone}`}>
      {name
        .split(" ")
        .map((x) => x[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <button className="logo" aria-label="PulseClass home">
      <span className="logo-mark">
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <b>
          pulse<span>class</span>
        </b>
      )}
    </button>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <Icon />
    </button>
  );
}

export default function PulseClass() {
  const [view, setView] = useState<View>("landing");
  const [role, setRole] = useState<"teacher" | "presenter" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(starterQuestions);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [nickname, setNickname] = useState("");
  const [toast, setToast] = useState("");
  const [activitySaved, setActivitySaved] = useState(false);
  const [activityTitle, setActivityTitle] = useState("Untitled activity");
  const [activityPoints, setActivityPoints] = useState(100);
  const [studentConnected, setStudentConnected] = useState(false);
  const [studentResponse, setStudentResponse] = useState<number | null>(null);
  const [liveResponses, setLiveResponses] = useState<number[]>([]);
  const [liveResponseMap, setLiveResponseMap] = useState<
    Record<string, number>
  >({});
  const [liveStudentCount, setLiveStudentCount] = useState(0);
  const [timerEnd, setTimerEnd] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [sessionScores, setSessionScores] = useState<Record<string, number>>(
    {},
  );
  const [sessionResults, setSessionResults] = useState<
    Array<{ name: string; roll: string }>
  >([]);
  const [classScores, setClassScores] = useState<
    Record<string, { name: string; roll: string; points: number }>
  >({});
  const [liveParticipants, setLiveParticipants] = useState<
    Array<{ name: string; roll: string }>
  >([]);
  const [roomHealth, setRoomHealth] = useState<RoomHealth>({
    studentsOnline: 0,
    hostsOnline: 0,
    registeredStudents: 0,
  });
  const [imageReadyCounts, setImageReadyCounts] = useState<number[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(
    null,
  );
  const [studentFromHost, setStudentFromHost] = useState(false);
  const [rollNumber, setRollNumber] = useState("");
  const [requireRoll, setRequireRoll] = useState(true);
  const [className, setClassName] = useState("");
  const [students, setStudents] = useState<
    Array<{ name: string; roll: string }>
  >([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [activeClassId, setActiveClassId] = useState("");
  const [editingActivityId, setEditingActivityId] = useState("");
  const [backTarget, setBackTarget] = useState<View>("dashboard");
  const [tipVisible, setTipVisible] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [liveSessionCode, setLiveSessionCode] = useState("482938");
  const [entrySessionCode, setEntrySessionCode] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sessionSynced, setSessionSynced] = useState(false);
  const viewRef = useRef<View>(view);
  const studentRestoreRef = useRef(false);
  const sessionSocketRef = useRef<WebSocket | null>(null);
  const catalogSocketRef = useRef<WebSocket | null>(null);
  const sessionReconnectRef = useRef<number | undefined>(undefined);
  const catalogOverallRef = useRef<
    Record<
      string,
      Record<string, { name: string; roll: string; points: number }>
    >
  >({});
  const answerVersionRef = useRef(0);
  const revisionRef = useRef(0);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    setClassScores(catalogOverallRef.current[className] || {});
  }, [className]);
  useEffect(() => {
    const saved = window.localStorage.getItem("pulseclass-theme");
    const initial =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("pulseclass-auth") || "null",
      ) as { role?: "teacher" | "presenter"; expiresAt?: number } | null;
      if (saved?.role && Number(saved.expiresAt) > Date.now()) {
        setRole(saved.role);
        setPresenterMode(saved.role === "presenter");
        setView(saved.role === "presenter" ? "presenter" : "dashboard");
      } else if (saved) {
        window.localStorage.removeItem("pulseclass-auth");
      }
    } catch {
      window.localStorage.removeItem("pulseclass-auth");
    } finally {
      setAuthReady(true);
    }
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("pulseclass-student-session") || "null",
      ) as { code?: string; name?: string; roll?: string } | null;
      if (saved?.code && saved.name) {
        setEntrySessionCode(saved.code);
        setLiveSessionCode(saved.code);
        setNickname(saved.name);
        setRollNumber(saved.roll || "");
        setJoined(true);
        setView("join");
      }
    } catch {
      window.localStorage.removeItem("pulseclass-student-session");
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    try {
      let savedClasses: ClassRecord[] = JSON.parse(
        window.localStorage.getItem("pulseclass-classes") || "[]",
      );
      const legacyClass = window.localStorage.getItem("pulseclass-class");
      if (!savedClasses.length && legacyClass)
        savedClasses = [{ id: "class-1", name: legacyClass }];
      setClasses(savedClasses);
      if (savedClasses[0]) {
        setActiveClassId(savedClasses[0].id);
        setClassName(savedClasses[0].name);
      }
      let savedActivities: ActivityRecord[] = JSON.parse(
        window.localStorage.getItem("pulseclass-activities") || "[]",
      );
      const legacyActivity = window.localStorage.getItem("pulseclass-activity");
      if (!savedActivities.length && legacyActivity && savedClasses[0]) {
        const data = JSON.parse(legacyActivity);
        savedActivities = [
          {
            id: "activity-1",
            title: data.title || "Untitled activity",
            classId: savedClasses[0].id,
            questions: data.questions || starterQuestions,
          },
        ];
      }
      setActivities(savedActivities);
      if (savedActivities[0]) {
        setQuestions(savedActivities[0].questions);
        setActivityTitle(savedActivities[0].title);
        setEditingActivityId(savedActivities[0].id);
        setActivitySaved(true);
      }
      window.localStorage.setItem(
        "pulseclass-classes",
        JSON.stringify(savedClasses),
      );
      window.localStorage.setItem(
        "pulseclass-activities",
        JSON.stringify(savedActivities),
      );
      const roster = window.localStorage.getItem("pulseclass-students");
      if (roster) setStudents(JSON.parse(roster));
    } catch {}
  }, []);
  useEffect(() => {
    if (!authReady || !role) return;
    let disposed = false;
    let retry: number | undefined;
    let attempt = 0;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/catalog/ws`,
      );
      catalogSocketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type !== "catalog:snapshot") return;
          const state = message.state || {};
          const localClasses: ClassRecord[] = JSON.parse(
            window.localStorage.getItem("pulseclass-classes") || "[]",
          );
          const localActivities: ActivityRecord[] = JSON.parse(
            window.localStorage.getItem("pulseclass-activities") || "[]",
          );
          if (
            role === "teacher" &&
            !state.classes?.length &&
            localClasses.length
          ) {
            socket.send(
              JSON.stringify({
                action: "catalog",
                classes: localClasses,
                activities: localActivities,
              }),
            );
            return;
          }
          const sharedClasses: ClassRecord[] = state.classes || [];
          const sharedActivities: ActivityRecord[] = state.activities || [];
          catalogOverallRef.current = state.overallScores || {};
          setClasses(sharedClasses);
          setActivities(sharedActivities);
          setSavedReports(state.reports || []);
          setClassScores(catalogOverallRef.current[className] || {});
          window.localStorage.setItem(
            "pulseclass-classes",
            JSON.stringify(sharedClasses),
          );
          window.localStorage.setItem(
            "pulseclass-activities",
            JSON.stringify(sharedActivities),
          );
        } catch {}
      };
      socket.onclose = () => {
        if (!disposed) {
          const delay =
            Math.min(15000, 500 * 2 ** Math.min(attempt++, 5)) +
            Math.random() * 500;
          retry = window.setTimeout(connect, delay);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) window.clearTimeout(retry);
      catalogSocketRef.current?.close();
    };
  }, [authReady, role]);
  useEffect(() => {
    if (!/^\d{6}$/.test(liveSessionCode) || !["host", "join"].includes(view))
      return;
    let disposed = false;
    let lastQuestion = -1;
    let attempt = 0;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const student = viewRef.current === "join" && !studentFromHost;
      const params = new URLSearchParams({
        code: liveSessionCode,
        role: student ? "student" : "host",
      });
      params.set("lastRevision", String(revisionRef.current));
      if (student && joined) {
        params.set("name", nickname.trim());
        params.set("roll", rollNumber.trim());
      }
      const socket = new WebSocket(
        `${protocol}//${window.location.host}/api/session/ws?${params}`,
      );
      sessionSocketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "answer:rejected") {
            setToast(
              "That answer could not be accepted. Check the timer and try again.",
            );
            return;
          }
          if (
            ![
              "session:snapshot",
              "session:update",
              "roster:update",
              "responses:update",
              "activity:finished",
              "room:health",
            ].includes(message.type)
          )
            return;
          if (message.state)
            revisionRef.current = Number(message.state.revision || 0);
          else if (message.revision) {
            const incoming = Number(message.revision);
            if (incoming > revisionRef.current + 1) {
              socket.send(
                JSON.stringify({
                  action: "sync",
                  lastRevision: revisionRef.current,
                }),
              );
              return;
            }
            if (incoming <= revisionRef.current) return;
            revisionRef.current = incoming;
          }
          const data = message.state || message.patch || {};
          if (data.health) setRoomHealth(data.health);
          if (data.imageReadyCounts) setImageReadyCounts(data.imageReadyCounts);
          if ("lobbyOpen" in data) setLobbyOpen(Boolean(data.lobbyOpen));
          if ("live" in data) setSessionStarted(Boolean(data.live));
          if ("finished" in data) setSessionFinished(Boolean(data.finished));
          if ("scores" in data) setSessionScores(data.scores || {});
          if ("points" in data) {
            const key = (rollNumber.trim() || nickname.trim()).toLowerCase();
            setSessionScores((current) => ({
              ...current,
              [key]: Number(data.points || 0),
            }));
          }
          if ("results" in data) setSessionResults(data.results || []);
          if ("timerEnd" in data) setTimerEnd(Number(data.timerEnd || 0));
          if ("responses" in data) {
            setLiveResponseMap(data.responses || {});
            setLiveResponses(Object.values(data.responses || {}).map(Number));
          }
          if ("participants" in data) {
            setLiveParticipants(data.participants || []);
            setLiveStudentCount(data.participants?.length || 0);
            setStudentConnected(data.participants?.length > 0);
          }
          if (data.title) setActivityTitle(data.title);
          if (data.className) setClassName(data.className);
          if (data.activityPoints) setActivityPoints(data.activityPoints);
          if (data.questions?.length) setQuestions(data.questions);
          if ("current" in data) {
            const nextQuestion = Number(data.current || 0);
            if (lastQuestion !== -1 && lastQuestion !== nextQuestion) {
              setSelectedAnswer(null);
              answerVersionRef.current = 0;
            }
            lastQuestion = nextQuestion;
            setActiveQuestion(nextQuestion);
          }
          setSessionSynced(true);
          if (data.participants?.length)
            setStudents((current) => {
              const next = [...current];
              for (const participant of data.participants) {
                const index = next.findIndex((item) =>
                  participant.roll
                    ? item.roll === participant.roll
                    : item.name.toLowerCase() ===
                      participant.name.toLowerCase(),
                );
                if (index >= 0) next[index] = participant;
                else next.push(participant);
              }
              window.localStorage.setItem(
                "pulseclass-students",
                JSON.stringify(next),
              );
              return next;
            });
        } catch {}
      };
      socket.onclose = () => {
        if (!disposed) {
          const delay =
            Math.min(15000, 500 * 2 ** Math.min(attempt++, 5)) +
            Math.random() * 500;
          sessionReconnectRef.current = window.setTimeout(connect, delay);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      if (sessionReconnectRef.current)
        window.clearTimeout(sessionReconnectRef.current);
      sessionSocketRef.current?.close();
    };
  }, [liveSessionCode, view, joined, studentFromHost]);
  useEffect(() => {
    if (!sessionSynced || studentRestoreRef.current) return;
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("pulseclass-student-session") || "null",
      ) as { code?: string; name?: string; roll?: string } | null;
      if (!saved?.code) return;
      if (
        saved.code !== liveSessionCode ||
        (!lobbyOpen && !sessionStarted && !sessionFinished)
      ) {
        window.localStorage.removeItem("pulseclass-student-session");
        setJoined(false);
        if (viewRef.current === "join") go("landing");
        return;
      }
      studentRestoreRef.current = true;
      setEntrySessionCode(saved.code);
      setNickname(saved.name || "");
      setRollNumber(saved.roll || "");
      setJoined(true);
      go("join");
      if (!sessionFinished)
        publishSession({
          action: "connect",
          name: saved.name || "Student",
          roll: saved.roll || "",
        });
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      window.localStorage.removeItem("pulseclass-student-session");
    }
  }, [
    sessionSynced,
    liveSessionCode,
    lobbyOpen,
    sessionStarted,
    sessionFinished,
  ]);
  const go = (next: View) => {
    setView(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const completeLogin = (nextRole: "teacher" | "presenter") => {
    window.localStorage.setItem(
      "pulseclass-auth",
      JSON.stringify({
        role: nextRole,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      }),
    );
    setRole(nextRole);
    setPresenterMode(nextRole === "presenter");
    go(nextRole === "presenter" ? "presenter" : "dashboard");
  };
  const signOut = () => {
    void fetch("/api/auth/teacher", { method: "DELETE" });
    window.localStorage.removeItem("pulseclass-auth");
    setRole(null);
    setPresenterMode(false);
    go("landing");
  };
  const toggleTheme = () =>
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("pulseclass-theme", next);
      document.documentElement.dataset.theme = next;
      return next;
    });
  const publishCatalog = (payload: Record<string, unknown>) => {
    const socket = catalogSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return;
    }
    void fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };
  const publishSession = (payload: Record<string, unknown>) => {
    const code = String(payload.sessionCode || liveSessionCode);
    const socket = sessionSocketRef.current;
    if (socket?.readyState === WebSocket.OPEN && !payload.sessionCode) {
      socket.send(JSON.stringify(payload));
      return;
    }
    void fetch(`/api/session?code=${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, sessionCode: code }),
    }).catch(() => {});
  };
  const saveActivity = () => {
    const input =
      document.querySelector<HTMLInputElement>(".builder-bar input");
    const title = input?.value.trim() || activityTitle || "Untitled activity";
    const id = editingActivityId || `activity-${Date.now()}`;
    const existing = activities.find((a) => a.id === id);
    const record = {
      id,
      title,
      classId: activeClassId,
      questions,
      points: activityPoints,
      presenterEnabled: existing?.presenterEnabled || false,
      sessionCode: activitySessionCode(existing || { id }),
    };
    const next = editingActivityId
      ? activities.map((a) => (a.id === id ? record : a))
      : [...activities, record];
    if (existing)
      cleanupStoredImages(
        activityImageUrls([existing]),
        activityImageUrls(next),
      );
    setActivities(next);
    setEditingActivityId(id);
    setActivityTitle(title);
    window.localStorage.setItem("pulseclass-activities", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes, activities: next });
    setActivitySaved(true);
    setToast(`“${title}” saved in ${className}`);
  };
  const setLiveState = (live: boolean) => {
    setSessionStarted(live);
    window.localStorage.setItem("pulseclass-live", String(live));
    if (live) publishSession({ action: "start" });
  };
  const setLobbyState = (open: boolean) => {
    setLobbyOpen(open);
    window.localStorage.setItem("pulseclass-lobby-open", String(open));
    if (!open) {
      setSessionStarted(false);
      window.localStorage.setItem("pulseclass-live", "false");
      setStudentConnected(false);
      window.localStorage.removeItem("pulseclass-connected-student");
      publishSession({ action: "close" });
    }
  };
  const setLiveQuestion = (question: number) => {
    setActiveQuestion(question);
    setSelectedAnswer(null);
    window.localStorage.setItem("pulseclass-live-question", String(question));
    publishSession({ action: "question", current: question });
  };
  const presentActivity = (activity?: ActivityRecord, asPresenter = false) => {
    const liveClass = activity
      ? classes.find((c) => c.id === activity.classId)?.name || className
      : className;
    const liveTitle = activity?.title || activityTitle;
    const liveQuestions = activity?.questions || questions;
    const missingImages = liveQuestions
      .map((question, index) =>
        question.type === "image" && !question.imageUrl?.trim() ? index + 1 : 0,
      )
      .filter(Boolean);
    if (missingImages.length) {
      setToast(
        `Add and save an image for question${missingImages.length === 1 ? "" : "s"} ${missingImages.join(", ")} before presenting.`,
      );
      if (!asPresenter && activity) {
        setBackTarget(view);
        setActiveClassId(activity.classId);
        setClassName(liveClass);
        setEditingActivityId(activity.id);
        setActivityTitle(activity.title);
        setActivityPoints(activity.points || 100);
        setQuestions(activity.questions);
        go("create");
      }
      return;
    }
    const livePoints = activity?.points || activityPoints;
    const code = activity
      ? activitySessionCode(activity)
      : activitySessionCode({ id: editingActivityId || liveTitle });
    setLiveSessionCode(code);
    setPresenterMode(asPresenter);
    window.localStorage.setItem(
      "pulseclass-live-activity",
      JSON.stringify({
        title: liveTitle,
        className: liveClass,
        questions: liveQuestions,
        sessionCode: code,
      }),
    );
    window.localStorage.setItem("pulseclass-live-question", "0");
    setLiveState(false);
    setLobbyState(true);
    publishSession({
      action: "open",
      title: liveTitle,
      className: liveClass,
      questions: liveQuestions,
      activityPoints: livePoints,
      sessionCode: code,
    });
    setStudentResponse(null);
    setSelectedAnswer(null);
    setJoined(false);
    setActiveQuestion(0);
    go("host");
  };
  const saveClass = (name: string) => {
    const record = { id: `class-${Date.now()}`, name };
    const next = [...classes, record];
    setClasses(next);
    setActiveClassId(record.id);
    setClassName(name);
    window.localStorage.setItem("pulseclass-classes", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes: next, activities });
    setToast("Class created");
  };
  const openCreate = (classId?: string) => {
    const target = classId || activeClassId || classes[0]?.id;
    if (!target) {
      setToast("Create a class before adding an activity");
      go("library");
      return;
    }
    const cls = classes.find((c) => c.id === target);
    setBackTarget(view);
    setActiveClassId(target);
    setClassName(cls?.name || "");
    setEditingActivityId("");
    setActivityTitle("Untitled activity");
    setActivityPoints(100);
    setQuestions(starterQuestions);
    go("createchoice");
  };
  const createAIActivity = (data: {
    title: string;
    points: number;
    questions: Question[];
  }) => {
    const id = `activity-${Date.now()}`;
    const record: ActivityRecord = {
      id,
      title: data.title,
      classId: activeClassId,
      questions: data.questions,
      points: data.points,
      presenterEnabled: false,
      sessionCode: activitySessionCode({ id }),
    };
    const next = [...activities, record];
    setActivities(next);
    setActivityTitle(record.title);
    setActivityPoints(record.points || 100);
    setQuestions(record.questions);
    setEditingActivityId(record.id);
    setActivitySaved(true);
    window.localStorage.setItem("pulseclass-activities", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes, activities: next });
    setToast(`“${record.title}” created with AI`);
    go("classdetail");
  };
  const editActivity = (activity: ActivityRecord) => {
    const cls = classes.find((c) => c.id === activity.classId);
    setBackTarget(view);
    setActiveClassId(activity.classId);
    setClassName(cls?.name || "");
    setEditingActivityId(activity.id);
    setActivityTitle(activity.title);
    setActivityPoints(activity.points || 100);
    setQuestions(activity.questions);
    go("create");
  };
  const openClass = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    setBackTarget(view);
    setActiveClassId(cls.id);
    setClassName(cls.name);
    go("classdetail");
  };
  const deleteActivity = (activity: ActivityRecord) => {
    if (!window.confirm(`Delete “${activity.title}”? This cannot be undone.`))
      return;
    const next = activities.filter((a) => a.id !== activity.id);
    cleanupStoredImages(activityImageUrls([activity]), activityImageUrls(next));
    setActivities(next);
    window.localStorage.setItem("pulseclass-activities", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes, activities: next });
    if (editingActivityId === activity.id) setEditingActivityId("");
    setToast("Activity deleted");
  };
  const renameActivity = (activity: ActivityRecord, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setToast("Activity name cannot be empty");
      return;
    }
    const next = activities.map((item) =>
      item.id === activity.id ? { ...item, title: cleanTitle } : item,
    );
    setActivities(next);
    if (editingActivityId === activity.id) setActivityTitle(cleanTitle);
    window.localStorage.setItem("pulseclass-activities", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes, activities: next });
    setToast("Activity renamed");
  };
  const renameClass = (cls: ClassRecord, name: string) => {
    const cleanName = name.trim();
    if (!cleanName) {
      setToast("Class name cannot be empty");
      return;
    }
    if (
      classes.some(
        (item) =>
          item.id !== cls.id &&
          item.name.toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      setToast("A class with this name already exists");
      return;
    }
    const next = classes.map((item) =>
      item.id === cls.id ? { ...item, name: cleanName } : item,
    );
    setClasses(next);
    if (activeClassId === cls.id) setClassName(cleanName);
    window.localStorage.setItem("pulseclass-classes", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes: next, activities });
    setToast("Class renamed");
  };
  const deleteClass = (cls: ClassRecord) => {
    const removed = activities.filter((a) => a.classId === cls.id);
    const count = removed.length;
    if (
      !window.confirm(
        `Delete “${cls.name}”${count ? ` and its ${count} ${count === 1 ? "activity" : "activities"}` : ""}? This cannot be undone.`,
      )
    )
      return;
    const nextClasses = classes.filter((c) => c.id !== cls.id);
    const nextActivities = activities.filter((a) => a.classId !== cls.id);
    cleanupStoredImages(
      activityImageUrls(removed),
      activityImageUrls(nextActivities),
    );
    setClasses(nextClasses);
    setActivities(nextActivities);
    window.localStorage.setItem(
      "pulseclass-classes",
      JSON.stringify(nextClasses),
    );
    window.localStorage.setItem(
      "pulseclass-activities",
      JSON.stringify(nextActivities),
    );
    publishCatalog({
      action: "catalog",
      classes: nextClasses,
      activities: nextActivities,
    });
    const next = nextClasses[nextClasses.length - 1];
    setActiveClassId(next?.id || "");
    setClassName(next?.name || "");
    go("library");
    setToast("Class deleted");
  };
  const togglePresenterActivity = (activity: ActivityRecord) => {
    if (
      !activity.presenterEnabled &&
      !activity.questions.every(questionPresentationReady)
    ) {
      setToast(
        "Complete every question and upload all required images before enabling this activity.",
      );
      return;
    }
    const next = activities.map((a) =>
      a.id === activity.id
        ? { ...a, presenterEnabled: !a.presenterEnabled }
        : a,
    );
    setActivities(next);
    window.localStorage.setItem("pulseclass-activities", JSON.stringify(next));
    publishCatalog({ action: "catalog", classes, activities: next });
    setToast(
      activity.presenterEnabled
        ? "Removed from Presentation Portal"
        : "Activity enabled for presenters",
    );
  };
  const presentSaved = (activity?: ActivityRecord) => {
    if (activity) {
      const cls = classes.find((c) => c.id === activity.classId);
      setActiveClassId(activity.classId);
      setClassName(cls?.name || "");
      setActivityTitle(activity.title);
      setActivityPoints(activity.points || 100);
      setQuestions(activity.questions);
    }
    presentActivity(activity);
  };
  const presentFromPortal = (activity: ActivityRecord) => {
    const cls = classes.find((c) => c.id === activity.classId);
    setActiveClassId(activity.classId);
    setClassName(cls?.name || "");
    setActivityTitle(activity.title);
    setActivityPoints(activity.points || 100);
    setQuestions(activity.questions);
    presentActivity(activity, true);
  };
  const connectStudent = () => {
    setStudentConnected(true);
    const next = { name: nickname.trim(), roll: rollNumber.trim() };
    window.localStorage.setItem(
      "pulseclass-connected-student",
      JSON.stringify(next),
    );
    if (!studentFromHost)
      window.localStorage.setItem(
        "pulseclass-student-session",
        JSON.stringify({ ...next, code: liveSessionCode }),
      );
    publishSession({ action: "connect", ...next });
    setStudents((current) => {
      const filtered = current.filter((s) =>
        next.roll
          ? s.roll !== next.roll
          : s.name.toLowerCase() !== next.name.toLowerCase(),
      );
      const updated = [...filtered, next];
      window.localStorage.setItem(
        "pulseclass-students",
        JSON.stringify(updated),
      );
      return updated;
    });
  };
  const leaveStudentSession = () => {
    window.localStorage.removeItem("pulseclass-student-session");
    studentRestoreRef.current = false;
    setJoined(false);
    setSelectedAnswer(null);
    setNickname("");
    setRollNumber("");
    setEntrySessionCode("");
    if (document.fullscreenElement)
      void document.exitFullscreen?.().catch(() => {});
    go("landing");
  };
  const enterStudentSession = async (code: string) => {
    const openedFullscreen = !document.fullscreenElement;
    await document.documentElement.requestFullscreen?.().catch(() => {});
    const reject = async (message: string) => {
      if (openedFullscreen && document.fullscreenElement)
        await document.exitFullscreen?.().catch(() => {});
      return message;
    };
    try {
      const response = await fetch(
        `/api/session?code=${encodeURIComponent(code)}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        return reject(
          response.status === 400
            ? "This session ID is not valid."
            : "Unable to validate the session right now.",
        );
      const data = await response.json();
      if (String(data.sessionCode) !== code)
        return reject("This session ID is not valid.");
      if (!data.lobbyOpen && !data.live)
        return reject(
          data.finished
            ? "This activity has already finished."
            : "This session lobby is not open yet.",
        );
      setLiveSessionCode(code);
      setEntrySessionCode(code);
      setStudentFromHost(false);
      go("join");
      return null;
    } catch {
      return reject("Unable to connect. Check your network and try again.");
    }
  };
  const submitStudentResponse = (answer: number) => {
    setStudentResponse(answer);
    const version = Math.max(Date.now(), answerVersionRef.current + 1);
    answerVersionRef.current = version;
    publishSession({
      action: "answer",
      answer,
      question: activeQuestion,
      version,
      eventId: `${liveSessionCode}-${activeQuestion}-${version}`,
      name: nickname.trim(),
      roll: rollNumber.trim(),
    });
  };
  const finishLiveSession = async () => {
    try {
      const response = await fetch(
        `/api/session?code=${encodeURIComponent(liveSessionCode)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "finish",
            sessionCode: liveSessionCode,
          }),
        },
      );
      if (!response.ok) throw new Error("finish failed");
      const data = await response.json();
      const participants: Array<{ name: string; roll: string }> =
        data.results || data.participants || [];
      const scores: Record<string, number> = data.scores || {};
      const nextClassScores = { ...classScores };
      for (const participant of participants) {
        const key = (participant.roll || participant.name).toLowerCase();
        nextClassScores[key] = {
          ...participant,
          points: (nextClassScores[key]?.points || 0) + (scores[key] || 0),
        };
      }
      const report: SavedReport = {
        id: `report-${liveSessionCode}-${Date.now()}`,
        title: data.title || activityTitle,
        className: data.className || className,
        createdAt: Date.now(),
        participants,
        scores,
        classScores: nextClassScores,
      };
      setSessionScores(scores);
      setSessionResults(participants);
      setClassScores(nextClassScores);
      setSavedReports((current) => [
        report,
        ...current.filter((item) => item.id !== report.id),
      ]);
      publishCatalog({
        action: "report",
        report,
        overallScores: { [report.className]: nextClassScores },
      });
      setSessionFinished(true);
      setSessionStarted(false);
      go("report");
    } catch {
      setToast("Could not finish the activity. Please try again.");
    }
  };
  const activeClass = classes.find((c) => c.id === activeClassId) || classes[0];
  const activeClassActivities = activities.filter(
    (a) => a.classId === activeClass?.id,
  );
  const readyActivities = activities.filter(
    (a) =>
      a.questions.length > 0 && a.questions.every(questionPresentationReady),
  );
  const workspaceTip = !classes.length
    ? {
        label: "WORKSPACE SETUP",
        text: "Create your first class to organise activities and student participation.",
        action: "Create a class",
        run: () => go("library"),
      }
    : !activities.length
      ? {
          label: "BUILD YOUR CLASS",
          text: `Add the first learning activity to ${activeClass?.name}.`,
          action: "Add an activity",
          run: () => openCreate(activeClass?.id),
        }
      : !readyActivities.length
        ? {
            label: "FINISH YOUR DRAFT",
            text: "Complete every question prompt so your activity is ready to present.",
            action: "Open My Classes",
            run: () => go("library"),
          }
        : {
            label: "READY WHEN YOU ARE",
            text: `Choose “${readyActivities[0].title}” to open its lobby for students.`,
            action: "Open lobby",
            run: () => presentSaved(readyActivities[0]),
          };

  if (!authReady)
    return (
      <main className="auth-loading">
        <Logo />
        <span />
        <p>Restoring your workspace…</p>
      </main>
    );
  if (view === "landing")
    return (
      <>
        <div className="public-theme-control">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <Landing
          theme={theme}
          onTheme={toggleTheme}
          onTeacher={() => go("login")}
          onPresenter={() => go("presenterlogin")}
          onStudent={enterStudentSession}
        />
      </>
    );
  if (view === "login")
    return (
      <>
        <div className="public-theme-control">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <TeacherLogin
          theme={theme}
          onTheme={toggleTheme}
          onLogin={() => completeLogin("teacher")}
          onBack={() => go("landing")}
          onStudent={() => {
            setStudentFromHost(false);
            go("join");
          }}
        />
      </>
    );
  if (view === "presenterlogin")
    return (
      <>
        <div className="public-theme-control">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <PresenterLogin
          theme={theme}
          onTheme={toggleTheme}
          onLogin={() => completeLogin("presenter")}
          onBack={() => go("landing")}
        />
      </>
    );

  return (
    <main className={`app view-${view}`}>
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {view === "join" ? (
        <StudentView
          initialSessionCode={entrySessionCode}
          expectedSessionCode={liveSessionCode}
          joined={joined}
          setJoined={setJoined}
          nickname={nickname}
          setNickname={setNickname}
          rollNumber={rollNumber}
          setRollNumber={setRollNumber}
          requireRoll={requireRoll}
          selected={selectedAnswer}
          setSelected={setSelectedAnswer}
          questions={questions}
          current={activeQuestion}
          timerEnd={timerEnd}
          sessionStarted={sessionStarted}
          sessionFinished={sessionFinished}
          points={
            sessionFinished
              ? sessionScores[
                  (rollNumber.trim() || nickname.trim()).toLowerCase()
                ] || 0
              : 0
          }
          lobbyOpen={lobbyOpen}
          activityTitle={activityTitle}
          className={className}
          onConnect={connectStudent}
          onResponse={submitStudentResponse}
          onImageReady={(current) =>
            publishSession({
              action: "ready",
              current,
              name: nickname,
              roll: rollNumber,
            })
          }
          teacherPreview={studentFromHost}
          onExit={() => {
            if (studentFromHost) {
              go("host");
            } else leaveStudentSession();
          }}
        />
      ) : (
        <>
          <aside
            className={`${mobileNav ? "sidebar open" : "sidebar"}${sidebarCollapsed ? " collapsed" : ""}`}
          >
            <div className="side-top">
              <Logo compact={sidebarCollapsed} />
              <button
                className="close-mobile"
                onClick={() => setMobileNav(false)}
              >
                <X />
              </button>
            </div>
            <nav>
              {nav
                .filter(([id]) => role !== "presenter" || id === "presenter")
                .map(([id, label, Icon]) => (
                  <button
                    key={id}
                    title={sidebarCollapsed ? label : undefined}
                    className={
                      view === id ||
                      (id === "library" && view === "classdetail") ||
                      (id === (presenterMode ? "presenter" : "sessions") &&
                        view === "host") ||
                      (id === (presenterMode ? "presenter" : "reports") &&
                        view === "report")
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setPresenterMode(id === "presenter");
                      go(id as View);
                    }}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                  </button>
                ))}
            </nav>
            {role !== "presenter" && (
              <div className="side-workspace">
                <div className="workspace-label">
                  <small>WORKSPACE</small>
                  <button onClick={() => go("library")}>Manage</button>
                </div>
                {activeClass ? (
                  <div className="workspace-card">
                    <div className="workspace-class">
                      <span className="class-dot">
                        {activeClass.name.slice(0, 2).toUpperCase()}
                      </span>
                      <label>
                        <small>ACTIVE CLASS</small>
                        <select
                          aria-label="Active class"
                          value={activeClass.id}
                          onChange={(e) => {
                            const cls = classes.find(
                              (c) => c.id === e.target.value,
                            );
                            if (cls) {
                              setActiveClassId(cls.id);
                              setClassName(cls.name);
                            }
                          }}
                        >
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ChevronDown size={14} />
                    </div>
                    <div className="workspace-metrics">
                      <button onClick={() => go("library")}>
                        <b>{activeClassActivities.length}</b>
                        <span>Activities</span>
                      </button>
                      <button onClick={() => go("students")}>
                        <b>{students.length}</b>
                        <span>Students</span>
                      </button>
                      <button onClick={() => go("library")}>
                        <b>{classes.length}</b>
                        <span>Classes</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="workspace-empty"
                    onClick={() => go("library")}
                  >
                    <span className="class-dot">+</span>
                    <span>
                      <b>Set up workspace</b>
                      <small>Create your first class</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
            <div className="side-bottom">
              {role !== "presenter" && (
                <>
                  <button
                    className={view === "help" ? "active" : ""}
                    onClick={() => go("help")}
                  >
                    <CircleHelp size={19} /> Help & resources
                  </button>
                  <button
                    className={view === "settings" ? "active" : ""}
                    onClick={() => go("settings")}
                  >
                    <Settings size={19} /> Settings
                  </button>
                </>
              )}
              <div className="profile">
                <span className="profile-avatar">
                  <Avatar
                    name={
                      role === "presenter"
                        ? "Presentation User"
                        : "Srikanth Reddy"
                    }
                    tone="dark"
                  />
                  <i />
                </span>
                <div>
                  <b>
                    {role === "presenter"
                      ? "Presentation User"
                      : "Srikanth Reddy"}
                  </b>
                  <span>
                    {role === "presenter"
                      ? "Presenter · Live delivery"
                      : "Teacher · Workspace owner"}
                  </span>
                </div>
                <button
                  className="profile-logout"
                  onClick={signOut}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={17} />
                </button>
              </div>
            </div>
          </aside>
          <section className="workspace">
            <Header
              theme={theme}
              onTheme={toggleTheme}
              presenter={role === "presenter"}
              collapsed={sidebarCollapsed}
              onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
              onMenu={() => setMobileNav(true)}
              onJoin={() => {
                setStudentFromHost(false);
                go("join");
              }}
              notify={setToast}
            />
            {role !== "presenter" &&
              tipVisible &&
              !["create", "host"].includes(view) && (
                <div
                  className={`main-tip ${readyActivities.length ? "tip-ready" : ""}`}
                >
                  <span className="main-tip-icon">
                    <Sparkles />
                  </span>
                  <div>
                    <small>{workspaceTip.label}</small>
                    <p>{workspaceTip.text}</p>
                  </div>
                  <button className="tip-action" onClick={workspaceTip.run}>
                    {workspaceTip.action}
                    <ArrowRight />
                  </button>
                  <button
                    className="tip-close"
                    onClick={() => setTipVisible(false)}
                    aria-label="Dismiss tip"
                  >
                    <X />
                  </button>
                </div>
              )}
            {view === "dashboard" && (
              <SmartDashboard
                classes={classes}
                activities={activities}
                students={students.length}
                onCreate={openCreate}
                onPresent={presentSaved}
                onClasses={() => go("library")}
                onLibrary={() => go("library")}
              />
            )}
            {view === "presenter" && (
              <PresentationPortal
                classes={classes}
                activities={activities}
                reports={savedReports}
                onPresent={presentFromPortal}
                onOpenReport={(report) => {
                  setPresenterMode(true);
                  setSelectedReport(report);
                  go("report");
                }}
              />
            )}
            {view === "sessions" && (
              <SessionsPage
                sessionCode={liveSessionCode}
                hasActivity={activitySaved}
                title={activityTitle}
                className={className}
                live={sessionStarted || studentConnected}
                onLibrary={() => go("library")}
                onPresent={presentActivity}
              />
            )}
            {view === "library" && (
              <MultiLibraryPage
                classes={classes}
                activities={activities}
                onSaveClass={saveClass}
                onOpenClass={openClass}
              />
            )}
            {view === "classdetail" && activeClass && (
              <ClassDetailPage
                cls={activeClass}
                activities={activeClassActivities}
                onBack={() => go(backTarget)}
                onCreate={() => openCreate(activeClass.id)}
                onEdit={editActivity}
                onPresent={presentSaved}
                onTogglePresenter={togglePresenterActivity}
                onDeleteActivity={deleteActivity}
                onDeleteClass={() => deleteClass(activeClass)}
                onRenameClass={(name) => renameClass(activeClass, name)}
                onRenameActivity={renameActivity}
              />
            )}
            {view === "reports" && (
              <ReportsArchive
                reports={savedReports}
                onOpen={(report) => {
                  setPresenterMode(false);
                  setSelectedReport(report);
                  go("report");
                }}
                onSessions={() => go("sessions")}
              />
            )}
            {view === "classes" && (
              <MultiLibraryPage
                classes={classes}
                activities={activities}
                onSaveClass={saveClass}
                onOpenClass={openClass}
              />
            )}
            {view === "students" && <StudentsPage students={students} />}
            {view === "settings" && (
              <SettingsPage
                requireRoll={requireRoll}
                setRequireRoll={setRequireRoll}
                notify={setToast}
              />
            )}
            {view === "help" && <HelpPage notify={setToast} />}
            {view === "createchoice" && (
              <ActivityCreationChoice
                className={className}
                onBack={() => go(backTarget)}
                onManual={() => go("create")}
                onAI={() => go("aigenerate")}
              />
            )}
            {view === "aigenerate" && (
              <AIActivityBuilder
                className={className}
                onBack={() => go("createchoice")}
                onCreate={createAIActivity}
              />
            )}
            {view === "create" && (
              <>
                <label className="floating-points">
                  <Trophy />
                  Fallback points
                  <select
                    value={activityPoints}
                    onChange={(e) => setActivityPoints(Number(e.target.value))}
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="75">75</option>
                    <option value="100">100</option>
                  </select>
                </label>
                <CreateQuiz
                  title={activityTitle}
                  points={activityPoints}
                  setPoints={setActivityPoints}
                  questions={questions}
                  setQuestions={setQuestions}
                  onBack={() =>
                    go(editingActivityId ? backTarget : "createchoice")
                  }
                  onSave={saveActivity}
                  onLaunch={() => {
                    saveActivity();
                    presentActivity();
                  }}
                  notify={(message) =>
                    message === "Quiz saved"
                      ? saveActivity()
                      : setToast(message)
                  }
                />
              </>
            )}
            {view === "host" && (
              <HostView
                sessionCode={liveSessionCode}
                theme={theme}
                onTheme={toggleTheme}
                title={activityTitle}
                className={className}
                questions={questions}
                current={activeQuestion}
                setCurrent={setLiveQuestion}
                started={sessionStarted}
                setStarted={setLiveState}
                participants={liveParticipants}
                studentCount={liveStudentCount}
                roomHealth={roomHealth}
                imageReadyCounts={imageReadyCounts}
                responses={liveResponses}
                responseMap={liveResponseMap}
                timerEnd={timerEnd}
                onExtend={() => publishSession({ action: "extend" })}
                onExit={() => {
                  setLobbyState(false);
                  go(presenterMode ? "presenter" : "dashboard");
                }}
                onJoin={() => {
                  setStudentFromHost(true);
                  go("join");
                }}
                allowPreview={!presenterMode}
                onFinish={finishLiveSession}
                notify={setToast}
              />
            )}
            {view === "report" && (
              <LeaderboardReport
                title={selectedReport?.title || activityTitle}
                className={selectedReport?.className || className}
                participants={selectedReport?.participants || sessionResults}
                scores={selectedReport?.scores || sessionScores}
                classScores={selectedReport?.classScores || classScores}
                backLabel={
                  presenterMode
                    ? "Back to Presentation Portal"
                    : "Back to reports"
                }
                onBack={() => {
                  setSelectedReport(null);
                  go(presenterMode ? "presenter" : "reports");
                }}
              />
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Landing({
  onTeacher,
  onPresenter,
  onStudent,
}: {
  theme: "light" | "dark";
  onTheme: () => void;
  onTeacher: () => void;
  onPresenter: () => void;
  onStudent: (code: string) => Promise<string | null>;
}) {
  const [code, setCode] = useState("");
  const [validationError, setValidationError] = useState("");
  const [validating, setValidating] = useState(false);
  const teacherPortalUnlocked = code === "930350";
  const presenterPortalUnlocked = code === "portal";
  const validStudentCode = /^\d{6}$/.test(code) && !teacherPortalUnlocked;
  return (
    <main className="student-index">
      <header>
        <Logo />
      </header>
      <section>
        <div className="student-index-copy">
          <span>
            <i /> LIVE CLASSROOM
          </span>
          <h1>
            Your class is
            <br />
            ready when <em>you are.</em>
          </h1>
          <p>
            Enter the six-digit code shown by your teacher to join the activity.
            No account or password needed.
          </p>
        </div>
        <div className="quick-join">
          <span>
            <Zap />
          </span>
          <h2>Join your class</h2>
          <p>Enter the session code from your teacher.</p>
          <label>
            SESSION CODE
            <input
              value={code}
              onChange={(e) => {
                setCode(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "")
                    .slice(0, 6),
                );
                setValidationError("");
              }}
              placeholder="000 000"
              autoCapitalize="none"
              autoComplete="off"
            />
          </label>
          {validationError && (
            <p className="session-validation-error">{validationError}</p>
          )}
          <button
            className="primary"
            disabled={
              validating || (!validStudentCode && !presenterPortalUnlocked)
            }
            onClick={
              presenterPortalUnlocked
                ? onPresenter
                : async () => {
                    setValidating(true);
                    const error = await onStudent(code);
                    setValidationError(error || "");
                    setValidating(false);
                  }
            }
          >
            {presenterPortalUnlocked
              ? "Open presenter sign in"
              : validating
                ? "Validating session…"
                : "Continue"}{" "}
            <ArrowRight />
          </button>
          <small>
            <Lock /> Valid sessions open in fullscreen and reconnect
            automatically.
          </small>
        </div>
      </section>
      <footer>
        <span>© 2026 PulseClass</span>
        {teacherPortalUnlocked && (
          <button onClick={onTeacher}>
            <Lock /> Teacher portal
          </button>
        )}
      </footer>
    </main>
  );
}

function TeacherLogin({
  onLogin,
  onBack,
  onStudent,
}: {
  theme: "light" | "dark";
  onTheme: () => void;
  onLogin: () => void;
  onBack: () => void;
  onStudent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    setError("");
    try {
      const response = await fetch("/api/auth/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      onLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setSigningIn(false);
    }
  };
  return (
    <main className="login-page">
      <button className="login-brand" onClick={onBack}>
        <Logo />
      </button>
      <section className="login-story">
        <div>
          <span className="landing-kicker">
            <i /> TEACH WITH THE WHOLE ROOM
          </span>
          <h1>
            Your classroom is
            <br />
            waiting to <em>light up.</em>
          </h1>
          <p>
            Run live activities, involve every student, and see understanding
            take shape in real time.
          </p>
          <div className="login-quote">
            <div className="quote-avatars">
              <Avatar name="AR" tone="coral" />
              <Avatar name="LK" tone="blue" />
              <Avatar name="SM" tone="mint" />
            </div>
            <blockquote>
              “I finally hear from students who never used to raise their
              hands.”
            </blockquote>
            <small>— Maya Chen, Computer Science</small>
          </div>
        </div>
        <div className="story-orbit o1" />
        <div className="story-orbit o2" />
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="form-badge">
            <GraduationCap />
          </span>
          <h2>Teacher sign in</h2>
          <p>Use the test teacher account to enter the workspace.</p>
          <div className="test-account">
            <Sparkles />
            <div>
              <b>TEST ACCOUNT</b>
              <span>teacher@pulseclass.test</span>
              <span>Pulse@2026</span>
            </div>
          </div>
          <label>
            Username
            <div>
              <Mail />
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@pulseclass.test"
              />
            </div>
          </label>
          <label>
            Password
            <div>
              <Lock />
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Show password"
              >
                <Eye />
              </button>
            </div>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button
            className="primary login-submit"
            type="submit"
            disabled={signingIn}
          >
            {signingIn ? (
              "Signing in securely…"
            ) : (
              <>
                Sign in to PulseClass <ArrowRight />
              </>
            )}
          </button>
          <div className="student-divider" />
          <button
            type="button"
            className="student-login-link"
            onClick={onStudent}
          >
            <Users /> Joining a class? <b>Enter your session code</b>
            <ArrowRight />
          </button>
        </form>
      </section>
    </main>
  );
}

function PresenterLogin({
  onLogin,
  onBack,
}: {
  theme: "light" | "dark";
  onTheme: () => void;
  onLogin: () => void;
  onBack: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      username.trim().toLowerCase() !== "presenter@pulseclass.test" ||
      password !== "Present@2026"
    ) {
      setError("The presenter ID or password is incorrect.");
      return;
    }
    setError("");
    onLogin();
  };
  return (
    <main className="login-page presenter-login">
      <button className="login-brand" onClick={onBack}>
        <Logo />
      </button>
      <section className="login-story">
        <div>
          <span className="landing-kicker">
            <i /> LIVE DELIVERY MODE
          </span>
          <h1>
            Ready for the
            <br />
            <em>big screen.</em>
          </h1>
          <p>
            Open teacher-approved activities, manage the student lobby, and
            present with confidence.
          </p>
          <div className="presenter-login-points">
            <span>
              <Play />
              Projector-friendly controls
            </span>
            <span>
              <Users />
              Live participation
            </span>
            <span>
              <BarChart3 />
              Instant results
            </span>
          </div>
        </div>
        <div className="story-orbit o1" />
        <div className="story-orbit o2" />
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="form-badge">
            <Play />
          </span>
          <small className="role-badge">PRESENTER ROLE</small>
          <h2>Presenter sign in</h2>
          <p>Use your presenter credentials to access approved activities.</p>
          <label>
            Presenter ID
            <div>
              <Mail />
              <input
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Presenter ID"
              />
            </div>
          </label>
          <label>
            Password
            <div>
              <Lock />
              <input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Show password"
              >
                <Eye />
              </button>
            </div>
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary login-submit" type="submit">
            Open Presentation Portal <ArrowRight />
          </button>
          <button type="button" className="presenter-back" onClick={onBack}>
            <ArrowLeft />
            Back to session entry
          </button>
        </form>
      </section>
    </main>
  );
}

function Header({
  theme,
  onTheme,
  presenter = false,
  collapsed,
  onToggleSidebar,
  onMenu,
  onJoin,
  notify,
}: {
  theme: "light" | "dark";
  onTheme: () => void;
  presenter?: boolean;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onMenu: () => void;
  onJoin: () => void;
  notify: (s: string) => void;
}) {
  return (
    <header className="topbar">
      <button className="menu" onClick={onMenu}>
        <Menu />
      </button>
      <button
        className="topbar-collapse"
        onClick={onToggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </button>
      <div className="mobile-logo">
        <Logo />
      </div>
      <div className="top-search">
        <Search size={18} />
        <input
          placeholder={
            presenter
              ? "Search approved activities..."
              : "Search your workspace..."
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") notify("No matching activities");
          }}
        />
        <kbd>⌘ K</kbd>
      </div>
      {!presenter && (
        <button className="join-link" onClick={onJoin}>
          Join as student
        </button>
      )}
      <ThemeToggle theme={theme} onToggle={onTheme} />
      <button
        className="icon-btn"
        onClick={() => notify("You’re all caught up")}
        aria-label="Notifications"
      >
        <Bell size={20} />
      </button>
    </header>
  );
}

const emptyContent = {
  sessions: {
    eyebrow: "LIVE & ASSIGNED",
    title: "Sessions",
    description:
      "Run activities live or assign them for students to complete at their own pace.",
    icon: Zap,
    empty: "No sessions yet",
    detail: "Choose an activity from your library to start your first session.",
    action: "Choose an activity",
  },
  library: {
    eyebrow: "CLASS WORKSPACES",
    title: "My Classes",
    description:
      "Organize classes, activities, and student learning in one place.",
    icon: GraduationCap,
    empty: "No classes yet",
    detail: "Create your first class, then add its learning activities.",
    action: "Create class",
  },
  reports: {
    eyebrow: "LEARNING INSIGHTS",
    title: "Reports",
    description:
      "Review participation, accuracy, and question-level understanding after every session.",
    icon: BarChart3,
    empty: "No reports yet",
    detail: "Reports are created automatically when you complete a session.",
    action: "View sessions",
  },
  classes: {
    eyebrow: "PEOPLE & GROUPS",
    title: "Classes",
    description:
      "Organize students into classes and make recurring sessions easier to manage.",
    icon: Users,
    empty: "Create your first class",
    detail: "Add a class name and invite students using a secure join code.",
    action: "Create class",
  },
} as const;

function WorkspaceEmpty({
  type,
  onAction,
}: {
  type: keyof typeof emptyContent;
  onAction: () => void;
}) {
  const item = emptyContent[type];
  const Icon = item.icon;
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>{item.eyebrow}</p>
          <h1>{item.title}</h1>
          <span>{item.description}</span>
        </div>
        <button className="primary" onClick={onAction}>
          <Plus />
          {item.action}
        </button>
      </div>
      <div className="module-tools">
        <div>
          <Search />
          <input placeholder={`Search ${item.title.toLowerCase()}...`} />
        </div>
        <button>
          All <ChevronDown />
        </button>
        <button>
          Recently updated <ChevronDown />
        </button>
      </div>
      <section className="module-empty">
        <span>
          <Icon />
        </span>
        <h2>{item.empty}</h2>
        <p>{item.detail}</p>
        <button className="primary" onClick={onAction}>
          <Plus />
          {item.action}
        </button>
      </section>
    </div>
  );
}

function SavedActivityPage({
  mode,
  title,
  className,
  onCreate,
  onPresent,
}: {
  mode: "library" | "sessions";
  title: string;
  className: string;
  onCreate: () => void;
  onPresent: () => void;
}) {
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>{mode === "library" ? "YOUR CONTENT" : "LIVE & ASSIGNED"}</p>
          <h1>{mode === "library" ? "My library" : "Sessions"}</h1>
          <span>
            {mode === "library"
              ? "Your saved activities are grouped by their parent class."
              : "Choose a saved activity and start a live classroom session."}
          </span>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus />
          Create activity
        </button>
      </div>
      <div className="library-class-group">
        <header>
          <span className="class-dot">
            {className.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <b>{className}</b>
            <small>1 activity</small>
          </div>
        </header>
        <section className="saved-activity-list">
          <div className="saved-activity-thumb">
            <span>QUIZ</span>
            <div>
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="saved-activity-info">
            <span>{className.toUpperCase()} · DRAFT</span>
            <h2>{title}</h2>
            <p>Saved just now · Linked to {className}</p>
          </div>
          <button className="secondary" onClick={onCreate}>
            Edit
          </button>
          <button className="primary" onClick={onPresent}>
            <Play />
            Present
          </button>
        </section>
      </div>
    </div>
  );
}

function MultiLibraryPage({
  classes,
  activities,
  onSaveClass,
  onOpenClass,
}: {
  classes: ClassRecord[];
  activities: ActivityRecord[];
  onSaveClass: (name: string) => void;
  onOpenClass: (id: string) => void;
}) {
  const [adding, setAdding] = useState(classes.length === 0);
  const [name, setName] = useState("");
  const sorted = [...classes].sort(
    (a, b) =>
      Number(b.id.split("-").pop() || 0) - Number(a.id.split("-").pop() || 0),
  );
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>CLASS WORKSPACES</p>
          <h1>My Classes</h1>
          <span>
            {classes.length
              ? `${activities.length} ${activities.length === 1 ? "activity" : "activities"} organized across ${classes.length} ${classes.length === 1 ? "class" : "classes"}.`
              : "Create a class to begin organizing activities and students."}
          </span>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus />
          Create class
        </button>
      </div>
      {adding && (
        <section className="panel inline-class-form">
          <label>
            New class name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. B.Tech CSE — Section B"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  onSaveClass(name.trim());
                  setName("");
                  setAdding(false);
                }
              }}
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              setAdding(false);
              setName("");
            }}
          >
            Cancel
          </button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              onSaveClass(name.trim());
              setName("");
              setAdding(false);
            }}
          >
            Save class
          </button>
        </section>
      )}
      <div className="class-directory">
        {sorted.map((cls) => {
          const items = activities.filter((a) => a.classId === cls.id);
          const latest = items[items.length - 1];
          return (
            <button
              className="class-directory-card"
              key={cls.id}
              onClick={() => onOpenClass(cls.id)}
            >
              <span className="class-dot">
                {cls.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <small>CLASS WORKSPACE</small>
                <h2>{cls.name}</h2>
                <p>
                  {items.length}{" "}
                  {items.length === 1 ? "activity" : "activities"}
                  {latest
                    ? ` · Latest: ${latest.title}`
                    : " · Ready for its first activity"}
                </p>
              </div>
              <span className="class-card-arrow">
                <ArrowRight />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClassDetailPage({
  cls,
  activities,
  onBack,
  onCreate,
  onEdit,
  onPresent,
  onTogglePresenter,
  onDeleteActivity,
  onDeleteClass,
  onRenameClass,
  onRenameActivity,
}: {
  cls: ClassRecord;
  activities: ActivityRecord[];
  onBack: () => void;
  onCreate: () => void;
  onEdit: (a: ActivityRecord) => void;
  onPresent: (a?: ActivityRecord) => void;
  onTogglePresenter: (a: ActivityRecord) => void;
  onDeleteActivity: (a: ActivityRecord) => void;
  onDeleteClass: () => void;
  onRenameClass: (name: string) => void;
  onRenameActivity: (activity: ActivityRecord, title: string) => void;
}) {
  const [renameTarget, setRenameTarget] = useState<
    { type: "class"; name: string } | { type: "activity"; activity: ActivityRecord; name: string } | null
  >(null);
  const sorted = [...activities].sort(
    (a, b) =>
      Number(b.id.split("-").pop() || 0) - Number(a.id.split("-").pop() || 0),
  );
  return (
    <div className="page module-page class-detail-page">
      <button className="context-back" onClick={onBack}>
        <ArrowLeft />
        Back
      </button>
      <div className="module-head">
        <div>
          <p>CLASS WORKSPACE</p>
          <h1>{cls.name}</h1>
          <span>
            {activities.length}{" "}
            {activities.length === 1 ? "activity" : "activities"} in this class.
          </span>
        </div>
        <div className="class-head-actions">
          <button
            className="secondary"
            onClick={() => setRenameTarget({ type: "class", name: cls.name })}
          >
            <FileText />
            Rename class
          </button>
          <button className="danger-button" onClick={onDeleteClass}>
            <Trash2 />
            Delete class
          </button>
          <button className="primary" onClick={onCreate}>
            <Plus />
            Add activity
          </button>
        </div>
      </div>
      {sorted.length ? (
        <section className="library-class-group multi">
          <header>
            <span className="class-dot">
              {cls.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>Class activities</b>
              <small>
                Enable finished activities for the Presentation Portal
              </small>
            </div>
          </header>
          {sorted.map((activity) => (
            <div className="saved-activity-list" key={activity.id}>
              <div className="saved-activity-thumb">
                <span>QUIZ</span>
                <div>
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="saved-activity-info">
                <span>
                  {cls.name.toUpperCase()} ·{" "}
                  {activity.presenterEnabled
                    ? "PRESENTATION ENABLED"
                    : "TEACHER ONLY"}
                </span>
                <h2>{activity.title}</h2>
                <p>
                  {activity.questions.length} questions · Linked to {cls.name}
                </p>
              </div>
              <button
                className={`presenter-toggle ${activity.presenterEnabled ? "enabled" : ""}`}
                onClick={() => onTogglePresenter(activity)}
              >
                <Eye />
                {activity.presenterEnabled ? "Enabled" : "Enable"}
              </button>
              <button
                className="delete-icon"
                onClick={() => onDeleteActivity(activity)}
                aria-label={`Delete ${activity.title}`}
                title="Delete activity"
              >
                <Trash2 />
              </button>
              <button
                className="secondary"
                onClick={() =>
                  setRenameTarget({ type: "activity", activity, name: activity.title })
                }
              >
                Rename
              </button>
              <button className="secondary" onClick={() => onEdit(activity)}>
                Edit
              </button>
              <button className="primary" onClick={() => onPresent(activity)}>
                <Users />
                Test lobby
              </button>
            </div>
          ))}
        </section>
      ) : (
        <section className="module-empty standalone">
          <span>
            <Library />
          </span>
          <h2>No activities yet</h2>
          <p>Add the first quiz or poll to this class workspace.</p>
          <div className="empty-actions">
            <button className="danger-button" onClick={onDeleteClass}>
              <Trash2 />
              Delete class
            </button>
            <button className="primary" onClick={onCreate}>
              <Plus />
              Add activity
            </button>
          </div>
        </section>
      )}
      {renameTarget && (
        <div className="rename-modal" role="dialog" aria-modal="true" aria-label={`Rename ${renameTarget.type}`}>
          <button className="rename-backdrop" aria-label="Cancel rename" onClick={() => setRenameTarget(null)} />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renameTarget.name.trim()) return;
              if (renameTarget.type === "class") onRenameClass(renameTarget.name);
              else onRenameActivity(renameTarget.activity, renameTarget.name);
              setRenameTarget(null);
            }}
          >
            <header><div><small>{renameTarget.type === "class" ? "CLASS SETTINGS" : "ACTIVITY SETTINGS"}</small><h2>Rename {renameTarget.type}</h2></div><button type="button" onClick={() => setRenameTarget(null)} aria-label="Close"><X /></button></header>
            <label>{renameTarget.type === "class" ? "CLASS NAME" : "ACTIVITY TITLE"}<input autoFocus maxLength={80} value={renameTarget.name} onChange={(event) => setRenameTarget({ ...renameTarget, name: event.target.value })} /></label>
            <p>The updated name will appear everywhere this {renameTarget.type} is used.</p>
            <footer><button type="button" className="secondary" onClick={() => setRenameTarget(null)}>Cancel</button><button className="primary" disabled={!renameTarget.name.trim()}>Save name</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}

function MultiClassPage({
  classes,
  activities,
  onSave,
  onAddActivity,
}: {
  classes: ClassRecord[];
  activities: ActivityRecord[];
  onSave: (name: string) => void;
  onAddActivity: (classId?: string) => void;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(classes.length === 0);
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>CLASS WORKSPACES</p>
          <h1>Classes</h1>
          <span>
            Create separate spaces for each course, section, or learning group.
          </span>
        </div>
        <button className="primary" onClick={() => setAdding(true)}>
          <Plus />
          Create class
        </button>
      </div>
      {adding && (
        <section className="panel inline-class-form">
          <label>
            New class name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. B.Tech CSE — Section B"
            />
          </label>
          <button
            className="secondary"
            onClick={() => {
              setAdding(false);
              setName("");
            }}
          >
            Cancel
          </button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              setName("");
              setAdding(false);
            }}
          >
            Save class
          </button>
        </section>
      )}
      <div className="classes-grid">
        {classes.map((cls) => {
          const count = activities.filter((a) => a.classId === cls.id).length;
          return (
            <article className="panel class-card" key={cls.id}>
              <span className="class-dot">
                {cls.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h2>{cls.name}</h2>
                <p>
                  {count} {count === 1 ? "activity" : "activities"} · 0
                  completed sessions
                </p>
              </div>
              <button className="primary" onClick={() => onAddActivity(cls.id)}>
                <Plus />
                Add activity
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PresentationPortal({
  classes,
  activities,
  reports,
  onPresent,
  onOpenReport,
}: {
  classes: ClassRecord[];
  activities: ActivityRecord[];
  reports: SavedReport[];
  onPresent: (a: ActivityRecord) => void;
  onOpenReport: (r: SavedReport) => void;
}) {
  const enabled = activities.filter(
    (activity) =>
      activity.presenterEnabled &&
      activity.questions.length > 0 &&
      activity.questions.every(questionPresentationReady),
  );
  return (
    <div className="page module-page presentation-portal">
      <section className="presenter-hero">
        <div>
          <span>
            <i /> PROJECTOR READY
          </span>
          <h1>Presentation Portal</h1>
          <p>
            Open an approved activity, welcome students into the lobby, and run
            the room from one focused screen.
          </p>
        </div>
        <div className="presenter-status">
          <Play />
          <strong>{enabled.length}</strong>
          <span>activities ready</span>
        </div>
      </section>
      <div className="presenter-metrics">
        <div>
          <GraduationCap />
          <span>
            <b>{classes.length}</b>
            <small>Classes</small>
          </span>
        </div>
        <div>
          <Eye />
          <span>
            <b>{enabled.length}</b>
            <small>Enabled activities</small>
          </span>
        </div>
        <div>
          <BarChart3 />
          <span>
            <b>{reports.length}</b>
            <small>Completed reports</small>
          </span>
        </div>
      </div>
      <section className="presenter-section">
        <header>
          <div>
            <small>READY TO PRESENT</small>
            <h2>Choose an activity</h2>
          </div>
          <span>Only activities enabled by the teacher appear here.</span>
        </header>
        {enabled.length ? (
          <div className="presenter-activity-grid">
            {enabled.map((activity) => {
              const cls = classes.find((c) => c.id === activity.classId);
              return (
                <article key={activity.id}>
                  <span className="presenter-activity-icon">
                    <Play />
                  </span>
                  <div>
                    <small>{cls?.name || "Class activity"}</small>
                    <h3>{activity.title}</h3>
                    <p>
                      {activity.questions.length}{" "}
                      {activity.questions.length === 1
                        ? "question"
                        : "questions"}{" "}
                      · {(activity.points || 100).toLocaleString()} points
                    </p>
                  </div>
                  <button onClick={() => onPresent(activity)}>
                    Open lobby <ArrowRight />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="presenter-empty">
            <Eye />
            <h3>No activities enabled</h3>
            <p>A teacher can enable an activity from its class workspace.</p>
          </div>
        )}
      </section>
      {reports.length > 0 && (
        <section className="presenter-section presenter-recent">
          <header>
            <div>
              <small>RECENT RESULTS</small>
              <h2>Completed presentations</h2>
            </div>
          </header>
          <div>
            {reports.slice(0, 3).map((report) => (
              <button key={report.id} onClick={() => onOpenReport(report)}>
                <Trophy />
                <span>
                  <b>{report.title}</b>
                  <small>
                    {report.className} · {report.participants.length} students
                  </small>
                </span>
                <ArrowRight />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SessionsPage({
  sessionCode,
  hasActivity,
  title,
  className,
  live,
  onLibrary,
  onPresent,
}: {
  sessionCode: string;
  hasActivity: boolean;
  title: string;
  className: string;
  live: boolean;
  onLibrary: () => void;
  onPresent: () => void;
}) {
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>LIVE DELIVERY</p>
          <h1>Sessions</h1>
          <span>
            Open and monitor live activity runs. Activity authoring remains
            inside My Classes; completed analytics are saved in Reports.
          </span>
        </div>
        {hasActivity && (
          <button className="primary" onClick={onPresent}>
            <Play />
            Start live session
          </button>
        )}
      </div>
      <div className="session-tabs">
        <button className="active">Live & scheduled</button>
        <button>Completed</button>
      </div>
      {live ? (
        <section className="session-run-card">
          <span className="live-pill">
            <i /> LIVE
          </span>
          <div>
            <h2>{title}</h2>
            <p>
              {className} · Join code {formatSessionCode(sessionCode)}
            </p>
          </div>
          <strong>Active now</strong>
          <button className="primary" onClick={onPresent}>
            Open host view
          </button>
        </section>
      ) : (
        <section className="module-empty standalone">
          <span>
            <Zap />
          </span>
          <h2>No sessions running</h2>
          <p>
            {hasActivity
              ? `${title} in ${className} is ready to present.`
              : "Create a class and add an activity before starting a session."}
          </p>
          <button
            className="primary"
            onClick={hasActivity ? onPresent : onLibrary}
          >
            {hasActivity ? <Play /> : <GraduationCap />}
            {hasActivity ? "Start session" : "Open My Classes"}
          </button>
        </section>
      )}
    </div>
  );
}

function ClassPage({
  className,
  onSave,
  onAddActivity,
}: {
  className: string;
  onSave: (name: string) => void;
  onAddActivity: () => void;
}) {
  const [name, setName] = useState(className);
  if (className)
    return (
      <div className="page module-page">
        <div className="module-head">
          <div>
            <p>CLASS WORKSPACE</p>
            <h1>{className}</h1>
            <span>
              Activities, students, and sessions are organized inside this
              class.
            </span>
          </div>
          <button className="primary" onClick={onAddActivity}>
            <Plus />
            Add activity
          </button>
        </div>
        <section className="class-summary">
          <div>
            <GraduationCap />
          </div>
          <span>
            <b>{className}</b>
            <small>0 saved activities · 0 completed sessions</small>
          </span>
          <em>ACTIVE</em>
        </section>
      </div>
    );
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>CLASS SETUP</p>
          <h1>Create your first class</h1>
          <span>
            An activity must belong to a class. Configure the class before
            creating content.
          </span>
        </div>
      </div>
      <section className="panel class-form">
        <span>
          <GraduationCap />
        </span>
        <h2>Class details</h2>
        <p>
          Give this learning group a clear name. You can invite students after
          saving.
        </p>
        <label>
          Class name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. B.Tech CSE — Section A"
          />
        </label>
        <button
          className="primary"
          disabled={!name.trim()}
          onClick={() => onSave(name.trim())}
        >
          Create class <ArrowRight />
        </button>
      </section>
    </div>
  );
}

function StudentsPage({
  students,
}: {
  students: Array<{ name: string; roll: string }>;
}) {
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>UNIQUE PARTICIPANTS</p>
          <h1>Students</h1>
          <span>
            Each roll number is counted once, even if the student reconnects.
          </span>
        </div>
        <div className="student-total">
          <Users />
          <span>
            <b>{students.length}</b>
            <small>unique students</small>
          </span>
        </div>
      </div>
      {students.length ? (
        <section className="panel roster">
          <header>
            <span>Student</span>
            <span>Roll number</span>
            <span>Status</span>
          </header>
          {students.map((student) => (
            <div key={student.roll || student.name}>
              <span>
                <Avatar name={student.name} />
                <b>{student.name}</b>
              </span>
              <code>{student.roll || "Not required"}</code>
              <em>
                <i /> Connected
              </em>
            </div>
          ))}
        </section>
      ) : (
        <section className="module-empty standalone">
          <span>
            <Users />
          </span>
          <h2>No students have connected</h2>
          <p>
            Students appear here after joining a session with the required
            identity fields.
          </p>
        </section>
      )}
    </div>
  );
}

function SettingsPage({
  requireRoll,
  setRequireRoll,
  notify,
}: {
  requireRoll: boolean;
  setRequireRoll: (v: boolean) => void;
  notify: (s: string) => void;
}) {
  const [sounds, setSounds] = useState(true);
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>ACCOUNT & PARTICIPATION</p>
          <h1>Settings</h1>
          <span>Control how students identify themselves when joining.</span>
        </div>
        <button className="primary" onClick={() => notify("Settings saved")}>
          Save changes
        </button>
      </div>
      <div className="settings-layout">
        <nav>
          <button>Profile</button>
          <button className="active">Student identity</button>
          <button>Notifications</button>
          <button>Accessibility</button>
        </nav>
        <section className="panel settings-panel">
          <h2>Student join requirements</h2>
          <p>
            Choose the information every student must provide before entering a
            session.
          </p>
          <label className="professional-toggle">
            <span>
              <b>Student name</b>
              <small>
                Always required so the teacher can recognize participants.
              </small>
            </span>
            <input type="checkbox" checked disabled />
          </label>
          <label className="professional-toggle">
            <span>
              <b>Roll number</b>
              <small>
                Require a unique institutional roll number and use it for
                deduplication.
              </small>
            </span>
            <input
              type="checkbox"
              checked={requireRoll}
              onChange={(e) => setRequireRoll(e.target.checked)}
            />
          </label>
          <hr />
          <h3>Session preferences</h3>
          <label className="professional-toggle">
            <span>
              <b>Classroom sounds</b>
              <small>Play subtle sounds for joins and responses.</small>
            </span>
            <input
              type="checkbox"
              checked={sounds}
              onChange={(e) => setSounds(e.target.checked)}
            />
          </label>
        </section>
      </div>
    </div>
  );
}

function HelpPage({ notify }: { notify: (s: string) => void }) {
  return (
    <div className="page module-page">
      <div className="help-hero">
        <span>
          <CircleHelp />
        </span>
        <p>HELP CENTER</p>
        <h1>How can we help, Srikanth?</h1>
        <div>
          <Search />
          <input
            placeholder="Search guides and answers..."
            onKeyDown={(e) => {
              if (e.key === "Enter") notify("Search ready — type a help topic");
            }}
          />
        </div>
      </div>
      <div className="help-grid">
        <button onClick={() => notify("Getting started guide opened")}>
          <Zap />
          <span>
            <b>Getting started</b>
            <small>Create and run your first activity.</small>
          </span>
          <ArrowRight />
        </button>
        <button onClick={() => notify("Live sessions guide opened")}>
          <Play />
          <span>
            <b>Running live sessions</b>
            <small>Host, present, and manage responses.</small>
          </span>
          <ArrowRight />
        </button>
        <button onClick={() => notify("Student guide opened")}>
          <Users />
          <span>
            <b>Student participation</b>
            <small>Joining, accessibility, and privacy.</small>
          </span>
          <ArrowRight />
        </button>
        <button onClick={() => notify("Reports guide opened")}>
          <BarChart3 />
          <span>
            <b>Reports & insights</b>
            <small>Understand results and export data.</small>
          </span>
          <ArrowRight />
        </button>
      </div>
      <section className="panel support-card">
        <div>
          <MessageSquareText />
          <span>
            <b>Still need help?</b>
            <small>
              Our classroom support team typically replies within one business
              day.
            </small>
          </span>
        </div>
        <button
          className="secondary"
          onClick={() => notify("Support request started")}
        >
          Contact support
        </button>
      </section>
    </div>
  );
}

function SmartDashboard({
  classes,
  activities,
  students,
  onCreate,
  onPresent,
  onClasses,
  onLibrary,
}: {
  classes: ClassRecord[];
  activities: ActivityRecord[];
  students: number;
  onCreate: (classId?: string) => void;
  onPresent: (a?: ActivityRecord) => void;
  onClasses: () => void;
  onLibrary: () => void;
}) {
  const ready = activities.filter(
    (a) =>
      a.questions.length > 0 && a.questions.every(questionPresentationReady),
  );
  const next = ready[0] || activities[0];
  const nextClass = classes.find((c) => c.id === next?.classId);
  return (
    <div className="page dashboard-page smart-home">
      <div className="welcome">
        <div>
          <p>TEACHER WORKSPACE</p>
          <h1>
            Good morning, Srikanth <span>👋</span>
          </h1>
          <h2>
            {!classes.length
              ? "Start by creating your first class."
              : !activities.length
                ? "Your classes are ready for their first activity."
                : `${ready.length} ${ready.length === 1 ? "activity is" : "activities are"} ready to present.`}
          </h2>
        </div>
        <button className="primary" onClick={() => onCreate()}>
          <Plus />
          Create activity
        </button>
      </div>
      {!classes.length ? (
        <section className="smart-next">
          <div className="smart-next-icon">
            <GraduationCap />
          </div>
          <div>
            <span>RECOMMENDED NEXT STEP</span>
            <h2>Create your first class</h2>
            <p>
              Classes keep activities, student rosters, and sessions organized.
            </p>
          </div>
          <button className="primary" onClick={onClasses}>
            Create class <ArrowRight />
          </button>
        </section>
      ) : !activities.length ? (
        <section className="smart-next">
          <div className="smart-next-icon">
            <Library />
          </div>
          <div>
            <span>RECOMMENDED NEXT STEP</span>
            <h2>Add an activity to {classes[0].name}</h2>
            <p>
              Your class is configured. Build a quiz or poll to start engaging
              students.
            </p>
          </div>
          <button className="primary" onClick={() => onCreate(classes[0].id)}>
            Add activity <ArrowRight />
          </button>
        </section>
      ) : (
        <section className="smart-ready">
          <div>
            <span>
              <i />{" "}
              {ready.length ? "READY TO PRESENT" : "DRAFT NEEDS ATTENTION"}
            </span>
            <h2>{next.title}</h2>
            <p>
              {nextClass?.name} · {next.questions.length} questions
            </p>
            <div>
              <button className="light-button" onClick={() => onPresent(next)}>
                <Play />
                Present now
              </button>
              <button className="ghost-button" onClick={onLibrary}>
                View library <ArrowRight />
              </button>
            </div>
          </div>
          <div className="readiness-ring">
            <strong>{ready.length ? 100 : 60}%</strong>
            <span>readiness</span>
          </div>
        </section>
      )}
      <div className="section-title">
        <div>
          <h3>Workspace overview</h3>
          <p>Live totals from your teacher account</p>
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          icon={<GraduationCap />}
          tone="coral"
          value={String(classes.length)}
          label="Classes"
          trend={classes.length ? "Active" : "Start"}
        />
        <Stat
          icon={<Library />}
          tone="blue"
          value={String(activities.length)}
          label="Activities"
          trend={activities.length ? "Saved" : "Empty"}
        />
        <Stat
          icon={<Check />}
          tone="mint"
          value={String(ready.length)}
          label="Ready to present"
          trend={ready.length ? "Ready" : "Draft"}
        />
        <Stat
          icon={<Users />}
          tone="gold"
          value={String(students)}
          label="Unique students"
          trend={students ? "Joined" : "None"}
        />
      </div>
      <div className="smart-home-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Your classes</h3>
              <p>Activity distribution by class</p>
            </div>
            <button onClick={onClasses}>
              Manage <ArrowRight />
            </button>
          </div>
          <div className="home-class-list">
            {classes.map((cls) => {
              const count = activities.filter(
                (a) => a.classId === cls.id,
              ).length;
              return (
                <button key={cls.id} onClick={() => onCreate(cls.id)}>
                  <span className="class-dot">
                    {cls.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <b>{cls.name}</b>
                    <small>
                      {count} {count === 1 ? "activity" : "activities"}
                    </small>
                  </div>
                  <Plus />
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Ready to present</h3>
              <p>Activities with complete questions and images</p>
            </div>
            <button onClick={onLibrary}>
              View all <ArrowRight />
            </button>
          </div>
          <div className="home-ready-list">
            {ready.length ? (
              ready.slice(0, 3).map((item) => {
                const cls = classes.find((c) => c.id === item.classId);
                return (
                  <button key={item.id} onClick={() => onPresent(item)}>
                    <span>
                      <Play />
                    </span>
                    <div>
                      <b>{item.title}</b>
                      <small>
                        {cls?.name} · {item.questions.length} questions
                      </small>
                    </div>
                    <ArrowRight />
                  </button>
                );
              })
            ) : (
              <div className="home-mini-empty">
                <Sparkles />
                <b>No activities fully ready</b>
                <p>Complete each question and upload every required image.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Dashboard({
  saved,
  title,
  className,
  onCreate,
  onHost,
  onReport,
}: {
  saved: boolean;
  title: string;
  className: string;
  onCreate: () => void;
  onHost: () => void;
  onReport: () => void;
}) {
  return (
    <div className="page dashboard-page">
      <div className="welcome">
        <div>
          <p>MONDAY, AUGUST 3</p>
          <h1>
            Welcome to PulseClass, Srikanth <span>👋</span>
          </h1>
          <h2>
            {saved
              ? "Your classroom content is ready to use."
              : "Your new teacher workspace is ready."}
          </h2>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={19} />{" "}
          {saved ? "Create activity" : "Create first activity"}
        </button>
      </div>
      {saved ? (
        <section className="active-home-hero">
          <div>
            <span>
              <i /> READY TO PRESENT
            </span>
            <h2>{title}</h2>
            <p>{className} · Saved activity</p>
            <button className="light-button" onClick={onHost}>
              <Play />
              Start live session
            </button>
          </div>
          <div className="active-home-metric">
            <b>1</b>
            <span>activity ready</span>
          </div>
        </section>
      ) : (
        <section className="empty-welcome">
          <div className="empty-spark">
            <Sparkles />
          </div>
          <span>YOUR FIRST CLASS STARTS HERE</span>
          <h2>
            Let’s create something
            <br />
            your students will love.
          </h2>
          <p>
            Build a quick quiz, poll, or exit ticket. When you’re ready, share a
            code and bring everyone into the conversation.
          </p>
          <button className="primary" onClick={onCreate}>
            <Plus /> Create your first activity
          </button>
          <div className="first-steps">
            <div>
              <b>1</b>
              <span>
                <strong>Create</strong>
                <small>Build an activity</small>
              </span>
            </div>
            <i />
            <div>
              <b>2</b>
              <span>
                <strong>Share</strong>
                <small>Give students a code</small>
              </span>
            </div>
            <i />
            <div>
              <b>3</b>
              <span>
                <strong>Learn</strong>
                <small>See live understanding</small>
              </span>
            </div>
          </div>
        </section>
      )}
      <div className="section-title">
        <div>
          <h3>At a glance</h3>
          <p>Your classroom activity this week</p>
        </div>
        <button>
          This week <ChevronDown size={15} />
        </button>
      </div>
      <div className="stats-grid">
        <Stat
          icon={<Zap />}
          tone="coral"
          value="0"
          label="Sessions run"
          trend="New"
        />
        <Stat
          icon={<Users />}
          tone="blue"
          value="0"
          label="Students reached"
          trend="New"
        />
        <Stat
          icon={<MessageSquareText />}
          tone="mint"
          value="0"
          label="Responses"
          trend="New"
        />
        <Stat
          icon={<Flame />}
          tone="gold"
          value="—"
          label="Avg. engagement"
          trend="New"
        />
      </div>
      <div className="fresh-grid">
        <section className="panel fresh-panel">
          <div className="panel-head">
            <div>
              <h3>Recent sessions</h3>
              <p>Your completed sessions will appear here</p>
            </div>
          </div>
          <div className="small-empty">
            <span>
              <Clock3 />
            </span>
            <b>No completed sessions</b>
            <p>Present your saved activity to begin.</p>
          </div>
        </section>
        <section className="panel fresh-panel">
          <div className="panel-head">
            <div>
              <h3>My library</h3>
              <p>{className || "Your saved activities"}</p>
            </div>
          </div>
          {saved ? (
            <button className="dashboard-saved" onClick={onHost}>
              <span>QUIZ</span>
              <div>
                <b>{title}</b>
                <small>{className} · Saved just now</small>
              </div>
              <Play />
            </button>
          ) : (
            <button className="small-empty clickable" onClick={onCreate}>
              <span>
                <Plus />
              </span>
              <b>Create an activity</b>
              <p>Quiz, poll, word cloud & more</p>
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon,
  tone,
  value,
  label,
  trend,
}: {
  icon: React.ReactNode;
  tone: string;
  value: string;
  label: string;
  trend: string;
}) {
  return (
    <div className="stat">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
      </div>
      <em>{trend}</em>
    </div>
  );
}
function SessionRow({
  icon,
  tone,
  title,
  meta,
  score,
  onClick,
}: {
  icon: string;
  tone: string;
  title: string;
  meta: string;
  score: string;
  onClick: () => void;
}) {
  return (
    <button className="session-row" onClick={onClick}>
      <span className={`session-icon ${tone}`}>{icon}</span>
      <span>
        <b>{title}</b>
        <small>{meta}</small>
      </span>
      <span className="engage">
        <b>{score}</b>
        <small>engagement</small>
      </span>
      <MoreHorizontal size={19} />
    </button>
  );
}
function QuizCard({
  tone,
  label,
  title,
  details,
  plays,
  onClick,
}: {
  tone: string;
  label: string;
  title: string;
  details: string;
  plays: string;
  onClick: () => void;
}) {
  return (
    <button className="quiz-card" onClick={onClick}>
      <div className={`quiz-art ${tone}`}>
        <span>{label}</span>
        <div className="mini-bars">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="quiz-info">
        <h4>{title}</h4>
        <p>{details}</p>
        <footer>
          <span>{plays}</span>
          <MoreHorizontal size={18} />
        </footer>
      </div>
    </button>
  );
}

function ActivityCreationChoice({
  className,
  onBack,
  onManual,
  onAI,
}: {
  className: string;
  onBack: () => void;
  onManual: () => void;
  onAI: () => void;
}) {
  return (
    <div className="page module-page creation-choice">
      <button className="context-back" onClick={onBack}>
        <ArrowLeft />
        Back
      </button>
      <div className="module-head">
        <div>
          <p>NEW ACTIVITY · {className.toUpperCase()}</p>
          <h1>How would you like to create?</h1>
          <span>
            Build every question yourself or use ChatGPT to prepare a structured
            activity.
          </span>
        </div>
      </div>
      <div className="creation-options">
        <button onClick={onManual}>
          <span className="manual">
            <FileText />
          </span>
          <small>FULL CONTROL</small>
          <h2>Create manually</h2>
          <p>
            Write questions, answers, timing, and correct responses in the
            visual activity editor.
          </p>
          <em>
            Open activity editor <ArrowRight />
          </em>
        </button>
        <button onClick={onAI}>
          <span className="ai">
            <Sparkles />
          </span>
          <small>GUIDED AI WORKFLOW</small>
          <h2>Generate with AI</h2>
          <p>
            Create a precise ChatGPT prompt, paste its JSON response, validate
            it, and build the activity automatically.
          </p>
          <em>
            Start AI generation <ArrowRight />
          </em>
        </button>
      </div>
    </div>
  );
}

function AIActivityBuilder({
  className,
  onBack,
  onCreate,
}: {
  className: string;
  onBack: () => void;
  onCreate: (data: {
    title: string;
    points: number;
    questions: Question[];
  }) => void;
}) {
  const [description, setDescription] = useState("");
  const [count, setCount] = useState(5);
  const [difficultyPlan, setDifficultyPlan] = useState<
    "easy" | "easy-medium" | "mixed"
  >("mixed");
  const [json, setJson] = useState("");
  const [error, setError] = useState("");
  const [validated, setValidated] = useState<{
    title: string;
    points: number;
    questions: Question[];
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const difficultyInstruction =
    difficultyPlan === "easy"
      ? "Make every question easy."
      : difficultyPlan === "easy-medium"
        ? "Use only easy and medium questions, progressing from recall to application; do not include hard questions."
        : "Use a balanced mix of easy, medium, and hard questions, progressing from recall to deeper reasoning.";
  const prompt = `Create a classroom multiple-choice activity for the class "${className}".\n\nActivity description:\n${description.trim() || "[Describe the topic, learning objective, and student level here]"}\n\nDifficulty distribution:\n${difficultyInstruction}\n\nRequirements:\n- Return exactly ${count} questions.\n- Return ONLY valid JSON. Do not use Markdown or code fences.\n- Each question must have a clear prompt, exactly 4 answer choices, one zero-based correct answer index, and a time limit in seconds.\n- Use an appropriate activity title and set fallback points to 50.\n- Keep language accurate, classroom-ready, and suitable for projection.\n- Use a balanced mix of text, code, and image questions when the topic supports them.\n- Assign difficulty as easy, medium, or hard based on reasoning complexity—not question type alone, and strictly follow the selected difficulty distribution above.\n- Assign more time and points to complex questions: easy 10-20 seconds and 10-25 points; medium 20-40 seconds and 30-60 points; hard 45-90 seconds and 75-100 points. Never assign more than 100 points to any question.\n- Code is display-only; never require execution.\n- For every image question, write a detailed imagePrompt that the teacher can paste into an image generator, leave imageUrl empty until the generated image is uploaded to a public URL, and include concise alt text.\n\nUse exactly this JSON structure:\n{\n  "title": "Activity title",\n  "points": 50,\n  "questions": [\n    {\n      "type": "text | code | image",\n      "difficulty": "easy | medium | hard",\n      "points": 50,\n      "prompt": "Question text",\n      "language": "Required for code questions; otherwise empty",\n      "code": "Required for code questions; otherwise empty",\n      "imagePrompt": "Required for image questions; otherwise empty",\n      "imageUrl": "",\n      "alt": "Accessible image description",\n      "answers": ["Option A", "Option B", "Option C", "Option D"],\n      "correct": 0,\n      "seconds": 20\n    }\n  ]\n}`;
  const validate = () => {
    setValidated(null);
    setError("");
    try {
      if (!json.trim())
        throw new Error("Paste the JSON response before validating.");
      if (json.includes("```"))
        throw new Error(
          "Remove the Markdown code fences (```) and paste only the JSON object.",
        );
      const data = JSON.parse(json);
      if (!data || Array.isArray(data) || typeof data !== "object")
        throw new Error("The response must be one JSON object.");
      if (typeof data.title !== "string" || !data.title.trim())
        throw new Error('The "title" field is required and must be text.');
      if (
        typeof data.points !== "number" ||
        !Number.isFinite(data.points) ||
        data.points <= 0 ||
        data.points > 100
      )
        throw new Error('The "points" field must be a positive number.');
      if (!Array.isArray(data.questions))
        throw new Error('The "questions" field must be an array.');
      if (data.questions.length !== count)
        throw new Error(
          `Expected exactly ${count} questions, but received ${data.questions.length}.`,
        );
      const questions: Question[] = data.questions.map(
        (question: unknown, index: number) => {
          if (!question || typeof question !== "object")
            throw new Error(`Question ${index + 1} must be an object.`);
          const q = question as Record<string, unknown>;
          if (typeof q.prompt !== "string" || !q.prompt.trim())
            throw new Error(`Question ${index + 1} needs a prompt.`);
          if (
            !Array.isArray(q.answers) ||
            q.answers.length < 2 ||
            q.answers.some(
              (answer) => typeof answer !== "string" || !answer.trim(),
            )
          )
            throw new Error(
              `Question ${index + 1} needs at least two non-empty text answers.`,
            );
          if (
            !Number.isInteger(q.correct) ||
            Number(q.correct) < 0 ||
            Number(q.correct) >= q.answers.length
          )
            throw new Error(
              `Question ${index + 1} has an invalid correct answer index.`,
            );
          if (
            !Number.isFinite(q.seconds) ||
            Number(q.seconds) < 5 ||
            Number(q.seconds) > 300
          )
            throw new Error(
              `Question ${index + 1} time must be between 5 and 300 seconds.`,
            );
          if (
            !Number.isFinite(q.points) ||
            Number(q.points) < 0 ||
            Number(q.points) > 100
          )
            throw new Error(
              "Every question must have between 0 and 100 points.",
            );
          const type = (
            ["code", "image"].includes(String(q.type)) ? String(q.type) : "text"
          ) as Question["type"];
          if (type === "code" && typeof q.code !== "string")
            throw new Error("A code question needs a code block.");
          if (type === "image" && typeof q.imagePrompt !== "string")
            throw new Error("An image question needs an imagePrompt.");
          return {
            prompt: q.prompt.trim(),
            answers: (q.answers as string[]).map((answer) => answer.trim()),
            correct: Number(q.correct),
            seconds: Number(q.seconds),
            points: Math.min(100, Math.max(0, Number(q.points) || 50)),
            difficulty: (["easy", "hard"].includes(String(q.difficulty))
              ? String(q.difficulty)
              : "medium") as Question["difficulty"],
            type,
            language: String(q.language || ""),
            code: String(q.code || ""),
            imagePrompt: String(q.imagePrompt || ""),
            imageUrl: String(q.imageUrl || ""),
            alt: String(q.alt || ""),
          };
        },
      );
      setValidated({
        title: data.title.trim(),
        points: data.points,
        questions,
      });
    } catch (reason) {
      setError(
        reason instanceof SyntaxError
          ? `Invalid JSON: ${reason.message}`
          : reason instanceof Error
            ? reason.message
            : "The JSON response is invalid.",
      );
    }
  };
  return (
    <div className="page module-page ai-builder">
      <button className="context-back" onClick={onBack}>
        <ArrowLeft />
        Creation options
      </button>
      <div className="module-head">
        <div>
          <p>AI ACTIVITY BUILDER · {className.toUpperCase()}</p>
          <h1>Generate with ChatGPT</h1>
          <span>
            Describe the activity, copy the generated prompt, then validate
            ChatGPT’s JSON response.
          </span>
        </div>
      </div>
      <div className="ai-builder-grid">
        <section className="panel ai-step">
          <header>
            <b>1</b>
            <div>
              <h2>Describe the activity</h2>
              <p>
                Include the topic, learning goals, difficulty, and student
                level.
              </p>
            </div>
          </header>
          <label>
            ACTIVITY DESCRIPTION
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Example: A beginner-level quiz on supervised and unsupervised machine learning for second-year engineering students. Focus on core definitions and practical examples."
            />
          </label>
          <label>
            NUMBER OF QUESTIONS
            <select
              value={count}
              onChange={(e) => {
                setCount(Number(e.target.value));
                setValidated(null);
              }}
            >
              {[3, 5, 10, 15, 20].map((value) => (
                <option key={value} value={value}>
                  {value} questions
                </option>
              ))}
            </select>
          </label>
          <label>
            DIFFICULTY DISTRIBUTION
            <select
              value={difficultyPlan}
              onChange={(e) => {
                setDifficultyPlan(e.target.value as typeof difficultyPlan);
                setValidated(null);
              }}
            >
              <option value="easy">All easy</option>
              <option value="easy-medium">Easy and medium</option>
              <option value="mixed">Mixed: easy, medium and hard</option>
            </select>
          </label>
          <div className="generated-prompt">
            <header>
              <span>
                <Sparkles />
                ChatGPT prompt
              </span>
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(prompt);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                <Copy />
                {copied ? "Copied" : "Copy prompt"}
              </button>
            </header>
            <pre>{prompt}</pre>
          </div>
        </section>
        <section className="panel ai-step">
          <header>
            <b>2</b>
            <div>
              <h2>Paste and validate JSON</h2>
              <p>Paste only the JSON object returned by ChatGPT.</p>
            </div>
          </header>
          <label>
            CHATGPT JSON RESPONSE
            <textarea
              className="json-input"
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setValidated(null);
                setError("");
              }}
              placeholder={'{"title":"...","points":50,"questions":[...]}'}
            />
          </label>
          {error && (
            <div className="json-status error">
              <X />
              <span>
                <b>Validation failed</b>
                {error}
              </span>
            </div>
          )}
          {validated && (
            <div className="json-status success">
              <Check />
              <span>
                <b>JSON is valid</b>
                {validated.title} · {validated.questions.length} questions ·{" "}
                {validated.points.toLocaleString()} points
              </span>
            </div>
          )}
          <div className="ai-actions">
            <button className="secondary" onClick={validate}>
              <Check />
              Validate JSON
            </button>
            <button
              className="primary"
              disabled={!validated}
              onClick={() => validated && onCreate(validated)}
            >
              <Sparkles />
              Create activity
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

type ImageCompressionMode = "balanced" | "maximum";

async function optimizeQuizImage(
  file: File,
  mode: ImageCompressionMode,
): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("Choose a PNG, JPEG, WebP, or AVIF image.");
  const bitmap = await createImageBitmap(file);
  const profile =
    mode === "maximum"
      ? { width: 800, height: 600, targetBytes: 48 * 1024 }
      : { width: 1000, height: 700, targetBytes: 96 * 1024 };
  const initialScale = Math.min(
    1,
    profile.width / bitmap.width,
    profile.height / bitmap.height,
  );
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not optimize the image.");
  }
  const targetBytes = profile.targetBytes;
  let blob: Blob | null = null;
  let dimensionScale = initialScale;
  for (let pass = 0; pass < 8; pass += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * dimensionScale));
    canvas.height = Math.max(1, Math.round(bitmap.height * dimensionScale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const qualities =
      mode === "maximum"
        ? [0.68, 0.58, 0.48, 0.4, 0.32]
        : [0.78, 0.7, 0.62, 0.54, 0.46];
    for (const quality of qualities) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (blob && blob.size <= targetBytes) {
        bitmap.close();
        return blob;
      }
    }
    dimensionScale *= 0.82;
  }
  bitmap.close();
  if (!blob) throw new Error("This image could not be optimized.");
  throw new Error(
    "This image contains too much detail to compress safely. Try a cropped version.",
  );
}

function CreateQuiz({
  title,
  points,
  setPoints,
  questions,
  setQuestions,
  onBack,
  onSave,
  onLaunch,
  notify,
}: {
  title: string;
  points: number;
  setPoints: (n: number) => void;
  questions: Question[];
  setQuestions: (q: Question[]) => void;
  onBack: () => void;
  onSave: () => void;
  onLaunch: () => void;
  notify: (s: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const q = questions[selected];
  const [imageUpload, setImageUpload] = useState<
    "" | "optimizing" | "uploading"
  >("");
  const [compressionMode, setCompressionMode] =
    useState<ImageCompressionMode>("balanced");
  useEffect(() => {
    const input =
      document.querySelector<HTMLInputElement>(".builder-bar input");
    if (input) input.value = title;
  }, [title]);
  const update = (patch: Partial<Question>) =>
    setQuestions(
      questions.map((item, i) =>
        i === selected ? { ...item, ...patch } : item,
      ),
    );
  const uploadImage = async (file?: File) => {
    if (!file) return;
    try {
      setImageUpload("optimizing");
      const blob = await optimizeQuizImage(file, compressionMode);
      setImageUpload("uploading");
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Upload failed.");
      update({ imageUrl: data.url });
      notify(
        `Image optimized to ${Math.round(blob.size / 1024)} KB with ${compressionMode === "maximum" ? "maximum" : "balanced"} compression and uploaded`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setImageUpload("");
    }
  };
  const add = () => {
    setQuestions([
      ...questions,
      {
        prompt: "Type your question here...",
        answers: ["Option A", "Option B", "Option C", "Option D"],
        correct: 0,
        seconds: 20,
        points: 50,
        difficulty: "medium",
        type: "text",
      },
    ]);
    setSelected(questions.length);
  };
  return (
    <div className="builder">
      <div className="builder-bar">
        <button onClick={onBack}>
          <ArrowLeft /> <span>Exit</span>
        </button>
        <input defaultValue="JavaScript Fundamentals" />
        <div>
          <button className="secondary" onClick={onSave}>
            Save
          </button>
          <button className="primary" onClick={onLaunch}>
            <Play size={17} /> Present
          </button>
        </div>
      </div>
      <div className="builder-body">
        <aside className="slides">
          <div>
            <b>Questions</b>
            <span>{questions.length}</span>
          </div>
          {questions.map((item, i) => (
            <button
              key={i}
              className={i === selected ? "selected" : ""}
              onClick={() => setSelected(i)}
            >
              <em>{i + 1}</em>
              <span>
                <small>{item.seconds}s</small>
                <b>{item.prompt}</b>
                <i />
                <i />
              </span>
            </button>
          ))}
          <button className="add-question" onClick={add}>
            <Plus /> Add question
          </button>
        </aside>
        <section className="canvas">
          <div className="question-type">
            <label className="type-picker">
              <LayoutGrid size={17} />
              <select
                value={q.type || "text"}
                onChange={(e) =>
                  update({ type: e.target.value as Question["type"] })
                }
              >
                <option value="text">Standard question</option>
                <option value="code">Code reading</option>
                <option value="image">Image identification</option>
              </select>
            </label>
            <span>
              <Clock3 size={17} /> {q.seconds} sec
            </span>
            <span>
              <Trophy size={17} /> {(q.points || 50).toLocaleString()} points ·{" "}
              {q.difficulty || "medium"}
            </span>
          </div>
          <textarea
            value={q.prompt}
            onChange={(e) => update({ prompt: e.target.value })}
          />
          {q.type === "code" && (
            <div className="media-editor code-editor">
              <label>
                PROGRAMMING LANGUAGE
                <input
                  value={q.language || ""}
                  onChange={(e) => update({ language: e.target.value })}
                  placeholder="JavaScript, Python, Java..."
                />
              </label>
              <label>
                CODE BLOCK
                <textarea
                  value={q.code || ""}
                  onChange={(e) => update({ code: e.target.value })}
                  spellCheck={false}
                  placeholder="Paste the code students should read..."
                />
              </label>
            </div>
          )}
          {q.type === "image" && (
            <div className="media-editor image-editor">
              {!q.imageUrl && (
                <div className="image-required-notice">
                  <FileText />
                  <span>
                    <b>Upload required before presenting</b>
                    <small>
                      The AI prompt describes an image but does not create one.
                      Generate or choose the image, upload it here, then save
                      the activity.
                    </small>
                  </span>
                </div>
              )}
              <fieldset className="compression-mode">
                <legend>IMAGE COMPRESSION</legend>
                <button
                  type="button"
                  className={compressionMode === "balanced" ? "selected" : ""}
                  onClick={() => setCompressionMode("balanced")}
                >
                  <span><b>Balanced</b><small>Default · clear image · under 100 KB</small></span>
                  {compressionMode === "balanced" && <Check />}
                </button>
                <button
                  type="button"
                  className={compressionMode === "maximum" ? "selected" : ""}
                  onClick={() => setCompressionMode("maximum")}
                >
                  <span><b>Maximum compression</b><small>Large classes or slow networks · under 50 KB</small></span>
                  {compressionMode === "maximum" && <Check />}
                </button>
              </fieldset>
              <label className="image-upload">
                UPLOAD IMAGE
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  disabled={Boolean(imageUpload)}
                  onChange={(e) => {
                    void uploadImage(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
                <span>
                  {imageUpload === "optimizing"
                    ? "Optimizing image…"
                    : imageUpload === "uploading"
                      ? "Uploading to secure storage…"
                      : `Choose image · ${compressionMode === "maximum" ? "under 50 KB" : "under 100 KB"} WebP`}
                </span>
              </label>
              <label>
                IMAGE URL
                <input
                  type="url"
                  value={q.imageUrl || ""}
                  onChange={(e) => update({ imageUrl: e.target.value })}
                  placeholder="https://... (use an optimized public image URL)"
                />
              </label>
              <label>
                IMAGE DESCRIPTION / GENERATION PROMPT
                <textarea
                  value={q.imagePrompt || ""}
                  onChange={(e) => update({ imagePrompt: e.target.value })}
                  placeholder="Describe the exact educational image to generate and upload..."
                />
              </label>
              <label>
                ACCESSIBLE ALT TEXT
                <input
                  value={q.alt || ""}
                  onChange={(e) => update({ alt: e.target.value })}
                  placeholder="Briefly describe what the image shows"
                />
              </label>
              {q.imageUrl && <QuestionMedia question={q} compact />}
            </div>
          )}
          <div className="answer-editor">
            {q.answers.map((answer, i) => (
              <div className={`edit-answer a${i}`} key={i}>
                <button
                  onClick={() => update({ correct: i })}
                  className={q.correct === i ? "correct" : ""}
                >
                  {q.correct === i ? <Check /> : String.fromCharCode(65 + i)}
                </button>
                <input
                  value={answer}
                  onChange={(e) =>
                    update({
                      answers: q.answers.map((a, j) =>
                        j === i ? e.target.value : a,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <p className="canvas-hint">
            <Check size={15} /> Click an answer letter to mark it correct
          </p>
        </section>
        <aside className="properties">
          <h3>Question settings</h3>
          <label>
            Time limit
            <select
              value={q.seconds}
              onChange={(e) => update({ seconds: Number(e.target.value) })}
            >
              <option value="10">10 seconds</option>
              <option value="15">15 seconds</option>
              <option value="20">20 seconds</option>
              <option value="30">30 seconds</option>
              <option value="45">45 seconds</option>
              <option value="60">60 seconds</option>
              <option value="90">90 seconds</option>
            </select>
          </label>
          <label>
            Difficulty
            <select
              value={q.difficulty || "medium"}
              onChange={(e) => {
                const difficulty = e.target.value as Question["difficulty"];
                const defaults =
                  difficulty === "easy"
                    ? { seconds: 15, points: 25 }
                    : difficulty === "hard"
                      ? { seconds: 45, points: 100 }
                      : { seconds: 25, points: 50 };
                update({ difficulty, ...defaults });
              }}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Question points
            <select
              value={q.points || 50}
              onChange={(e) => update({ points: Number(e.target.value) })}
            >
              <option value="10">10 points</option>
              <option value="25">25 points</option>
              <option value="50">50 points</option>
              <option value="75">75 points</option>
              <option value="100">100 points</option>
            </select>
          </label>
          <label className="toggle-line">
            Randomize answers <input type="checkbox" defaultChecked />
          </label>
          <hr />
          <h3>Enhance</h3>
          <button className="enhance">
            <Sparkles /> Generate with AI
          </button>
          <button className="enhance">
            <BookOpen /> Add explanation
          </button>
        </aside>
      </div>
    </div>
  );
}

function QuestionMedia({
  question,
  compact = false,
}: {
  question: Question;
  compact?: boolean;
}) {
  const [imageState, setImageState] = useState<"checking" | "ready" | "error">(
    "checking",
  );
  useEffect(() => setImageState("checking"), [question.imageUrl]);
  if (question.type === "code" && question.code)
    return (
      <figure className={`question-code ${compact ? "compact" : ""}`}>
        <figcaption>{question.language || "Code"}</figcaption>
        <pre>
          <code>{question.code}</code>
        </pre>
      </figure>
    );
  if (question.type === "image" && compact && question.imageUrl)
    return (
      <section className={`uploaded-image-preview ${imageState}`}>
        <header>
          <span>
            {imageState === "ready" ? (
              <Check />
            ) : imageState === "error" ? (
              <X />
            ) : (
              <Clock3 />
            )}
            <span>
              <b>
                {imageState === "ready"
                  ? "Image uploaded and ready"
                  : imageState === "error"
                    ? "Image could not be loaded"
                    : "Verifying image…"}
              </b>
              <small>
                {imageState === "ready"
                  ? "This is the image students will see."
                  : imageState === "error"
                    ? "Replace the upload or check that the image URL is public."
                    : "Checking the student-facing preview."}
              </small>
            </span>
          </span>
        </header>
        <div className="uploaded-image-frame">
          <img
            src={question.imageUrl}
            alt={question.alt || question.imagePrompt || question.prompt}
            onLoad={() => setImageState("ready")}
            onError={() => setImageState("error")}
          />
        </div>
        <footer>
          <span>
            <Check /> Optimized image preview
          </span>
          <small>Click Save to keep this image with the activity.</small>
        </footer>
      </section>
    );
  if (question.type === "image")
    return (
      <figure className={`question-image ${compact ? "compact" : ""}`}>
        {question.imageUrl ? (
          <img
            src={question.imageUrl}
            alt={question.alt || question.imagePrompt || question.prompt}
          />
        ) : (
          <div>
            <FileText />
            <b>Image required</b>
            <span>
              {question.imagePrompt ||
                "Add an image URL in the activity editor."}
            </span>
          </div>
        )}
        {question.alt && <figcaption>{question.alt}</figcaption>}
      </figure>
    );
  return null;
}

function HostView({
  sessionCode,
  theme,
  onTheme,
  title,
  className,
  questions,
  current,
  setCurrent,
  started,
  setStarted,
  participants,
  studentCount,
  roomHealth,
  imageReadyCounts,
  responses,
  responseMap,
  timerEnd,
  onExtend,
  onExit,
  onJoin,
  allowPreview,
  onFinish,
  notify,
}: {
  sessionCode: string;
  theme: "light" | "dark";
  onTheme: () => void;
  title: string;
  className: string;
  questions: Question[];
  current: number;
  setCurrent: (n: number) => void;
  started: boolean;
  setStarted: (b: boolean) => void;
  participants: Array<{ name: string; roll: string }>;
  studentCount: number;
  roomHealth: RoomHealth;
  imageReadyCounts: number[];
  responses: number[];
  responseMap: Record<string, number>;
  timerEnd: number;
  onExtend: () => void;
  onExit: () => void;
  onJoin: () => void;
  allowPreview: boolean;
  onFinish: () => void;
  notify: (s: string) => void;
}) {
  const q = questions[current];
  const last = current === questions.length - 1;
  const [remaining, setRemaining] = useState(q?.seconds || 20);
  const [showResponses, setShowResponses] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const currentImageWaiting =
    q?.type === "image"
      ? Math.max(
          0,
          roomHealth.studentsOnline - (imageReadyCounts[current] || 0),
        )
      : 0;
  const nextImageWaiting =
    questions[current + 1]?.type === "image"
      ? Math.max(
          0,
          roomHealth.studentsOnline - (imageReadyCounts[current + 1] || 0),
        )
      : 0;
  useEffect(() => {
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [timerEnd]);
  useEffect(() => {
    setShowResponses(false);
    setShowChart(false);
  }, [current]);
  if (!started)
    return (
      <div
        className={`lobby ${allowPreview ? "teacher-lobby" : "projector-lobby"}`}
      >
        <div className="host-top">
          <Logo />
          <ThemeToggle theme={theme} onToggle={onTheme} />
          <button onClick={onExit}>
            <X /> Close lobby
          </button>
        </div>
        <div className="lobby-content">
          <span className="live-pill">
            <i /> LOBBY OPEN
          </span>
          <h1>{title}</h1>
          <p>{className} · Students can join now with this code</p>
          <div className="join-code">
            <strong>{formatSessionCode(sessionCode)}</strong>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(sessionCode);
                notify("Join code copied");
              }}
            >
              <Copy />
            </button>
          </div>
          <div className="lobby-steps">
            <span className="done">
              <b>1</b>Students join
            </span>
            <i />
            <span>
              <b>2</b>Start activity
            </span>
          </div>
          <button className="start-activity" onClick={() => setStarted(true)}>
            <Play fill="currentColor" />
            <span>
              <b>Start activity</b>
              <small>
                {currentImageWaiting
                  ? `${currentImageWaiting} device${currentImageWaiting === 1 ? " is" : "s are"} still loading · You can start now`
                  : "Show question 1 to students"}
              </small>
            </span>
            <ArrowRight />
          </button>
          {allowPreview && (
            <button className="student-preview-link" onClick={onJoin}>
              <Users /> Preview as a student
            </button>
          )}
          <div className="room-health">
            <i />
            <b>Room health: Excellent</b>
            <span>
              {roomHealth.studentsOnline} online ·{" "}
              {Math.max(0, studentCount - roomHealth.studentsOnline)}{" "}
              reconnecting · {studentCount} registered
            </span>
          </div>
          <div className="lobby-roster">
            <header>
              <b>{studentCount} registered</b>
              <span>{roomHealth.studentsOnline} currently online</span>
            </header>
            {participants.length ? (
              participants.map((student) => (
                <div key={student.roll || student.name}>
                  <Avatar name={student.name} tone="mint" />
                  <span>
                    <b>{student.name}</b>
                    <small>{student.roll || "Roll number not required"}</small>
                  </span>
                  <em>
                    <i />
                    Ready
                  </em>
                </div>
              ))
            ) : (
              <div className="lobby-empty">
                <Users />
                <b>No students connected yet</b>
                <span>You can start now or wait for students to join.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  const counts = q.answers.map(
    (_, i) => responses.filter((answer) => answer === i).length,
  );
  return (
    <div className="host-screen">
      <header>
        <button onClick={onExit}>
          <X />
        </button>
        <span>{title}</span>
        <div>
          <Users size={17} /> {studentCount} students <span>·</span>{" "}
          <b>{responses.length} responses</b>
        </div>
      </header>
      <section>
        <div className="host-question-head">
          <span>QUESTION {current + 1}</span>
          <div className={`timer ${remaining === 0 ? "expired" : ""}`}>
            {remaining}
          </div>
          <button className="extend-time" onClick={onExtend}>
            <Plus />
            10 sec
          </button>
          <span>
            {(q.points || 50).toLocaleString()} PTS ·{" "}
            {(q.difficulty || "medium").toUpperCase()}
          </span>
        </div>
        <h1>{q.prompt}</h1>
        <QuestionMedia question={q} />
        <div className="host-answers">
          {q.answers.map((a, i) => (
            <div
              className={`host-answer c${i} ${counts[i] ? "live-picked" : ""}`}
              key={a}
            >
              <b>{String.fromCharCode(65 + i)}</b>
              <span>{a}</span>
            </div>
          ))}
        </div>
        <div className="response-tools">
          <button onClick={() => setShowResponses((value) => !value)}>
            <Eye />{" "}
            {showResponses ? "Hide student answers" : "Display student answers"}
          </button>
          <button onClick={() => setShowChart(true)}>
            <BarChart3 /> Open response chart
          </button>
        </div>
        <div className="response-count">
          {responses.length ? (
            <>
              <div>
                <i />
              </div>
              <b>
                {responses.length} / {studentCount} responses received live
              </b>
            </>
          ) : (
            <>
              <div />
              <b>0 / {studentCount} responses · Waiting live…</b>
            </>
          )}
        </div>
        <div
          className={
            "live-response-roster " + (showResponses ? "revealed" : "concealed")
          }
        >
          <header>
            <b>Student responses</b>
            <span>
              {responses.length} of {studentCount} received
            </span>
          </header>
          <div>
            {participants.map((student) => {
              const key = (student.roll || student.name).toLowerCase();
              const answer = responseMap[key];
              return (
                <span
                  key={key}
                  className={answer === undefined ? "waiting" : ""}
                >
                  <Avatar name={student.name} />
                  <b>{student.name}</b>
                  <small>
                    {answer === undefined
                      ? "Waiting"
                      : `Answer ${String.fromCharCode(65 + answer)}`}
                  </small>
                </span>
              );
            })}
          </div>
        </div>
      </section>
      <footer>
        {allowPreview ? (
          <button onClick={onJoin}>
            <Users /> Student preview
          </button>
        ) : (
          <span />
        )}
        <div>
          <i />{" "}
          {nextImageWaiting
            ? `${nextImageWaiting} device${nextImageWaiting === 1 ? "" : "s"} loading next image`
            : responses.length
              ? "Live responses received"
              : "Listening for student answers"}
        </div>
        <button
          className="primary"
          onClick={() => {
            if (last) onFinish();
            else setCurrent(current + 1);
          }}
        >
          {last ? "Finish activity" : "Next question"} <ArrowRight />
        </button>
      </footer>
      {showChart && (
        <div
          className="chart-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Response distribution"
        >
          <button
            className="chart-modal-backdrop"
            onClick={() => setShowChart(false)}
            aria-label="Close chart"
          />
          <section>
            <header>
              <div>
                <small>LIVE RESPONSE DISTRIBUTION</small>
                <h2>{q.prompt}</h2>
                <p>
                  {responses.length} of {studentCount} students responded
                </p>
              </div>
              <button
                onClick={() => setShowChart(false)}
                aria-label="Close response chart"
              >
                <X />
              </button>
            </header>
            <div className="vertical-chart">
              {q.answers.map((answer, i) => {
                const percentage = responses.length
                  ? Math.round((counts[i] / responses.length) * 100)
                  : 0;
                return (
                  <article
                    key={answer}
                    className={i === q.correct ? "correct" : ""}
                  >
                    <div>
                      <span style={{ height: percentage + "%" }}>
                        <b>{counts[i]}</b>
                      </span>
                    </div>
                    <strong>{percentage}%</strong>
                    <em>{String.fromCharCode(65 + i)}</em>
                    <p>{answer}</p>
                    {i === q.correct && (
                      <small>
                        <Check /> Correct
                      </small>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StudentView({
  initialSessionCode,
  expectedSessionCode,
  joined,
  setJoined,
  nickname,
  setNickname,
  rollNumber,
  setRollNumber,
  requireRoll,
  selected,
  setSelected,
  questions,
  current,
  timerEnd,
  sessionStarted,
  sessionFinished,
  points,
  lobbyOpen,
  activityTitle,
  className,
  onConnect,
  onResponse,
  onImageReady,
  teacherPreview,
  onExit,
}: {
  initialSessionCode: string;
  expectedSessionCode: string;
  joined: boolean;
  setJoined: (b: boolean) => void;
  nickname: string;
  setNickname: (s: string) => void;
  rollNumber: string;
  setRollNumber: (s: string) => void;
  requireRoll: boolean;
  selected: number | null;
  setSelected: (n: number | null) => void;
  questions: Question[];
  current: number;
  timerEnd: number;
  sessionStarted: boolean;
  sessionFinished: boolean;
  points: number;
  lobbyOpen: boolean;
  activityTitle: string;
  className: string;
  onConnect: () => void;
  onResponse: (n: number) => void;
  onImageReady: (n: number) => void;
  teacherPreview: boolean;
  onExit: () => void;
}) {
  const [sessionCode, setSessionCode] = useState(
    initialSessionCode || expectedSessionCode,
  );
  const [joinError, setJoinError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [answerHistory, setAnswerHistory] = useState<Record<number, number>>(
    () => {
      if (typeof window === "undefined") return {};
      try {
        return JSON.parse(
          window.localStorage.getItem(
            `pulseclass-answers-${expectedSessionCode}`,
          ) || "{}",
        );
      } catch {
        return {};
      }
    },
  );
  useEffect(() => {
    if (initialSessionCode) setSessionCode(initialSessionCode);
  }, [initialSessionCode]);
  useEffect(() => {
    if (!joined) return;
    const images: HTMLImageElement[] = [];
    questions.forEach((question, index) => {
      if (question.type !== "image" || !question.imageUrl) return;
      const image = new Image();
      images.push(image);
      image.onload = () => onImageReady(index);
      image.src = question.imageUrl;
      if (image.complete && image.naturalWidth) onImageReady(index);
    });
    return () => {
      images.forEach((image) => {
        image.onload = null;
      });
    };
  }, [joined, questions, expectedSessionCode]);
  useEffect(() => {
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [timerEnd]);
  if (!joined)
    return (
      <div className="student-join">
        <div className="student-brand">
          <Logo />
        </div>
        <button className="exit-join" onClick={onExit}>
          <X />
        </button>
        <div className="join-panel">
          <span className="spark">✦</span>
          <h1>Join the room.</h1>
          <p>Enter the details requested by your teacher.</p>
          <label>
            SESSION CODE
            <input
              value={sessionCode}
              onChange={(e) => {
                setSessionCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setJoinError("");
              }}
              inputMode="numeric"
            />
          </label>
          <label>
            FULL NAME
            <input
              value={nickname}
              placeholder="Your full name"
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          {requireRoll && (
            <label>
              ROLL NUMBER
              <input
                value={rollNumber}
                placeholder="Your unique roll number"
                onChange={(e) => setRollNumber(e.target.value)}
              />
            </label>
          )}
          {joinError && <p className="join-error">{joinError}</p>}
          <button
            className="primary"
            onClick={() => {
              if (sessionCode !== expectedSessionCode) {
                setJoinError(
                  "That session code is not valid or its lobby is not open.",
                );
                return;
              }
              setJoined(true);
              onConnect();
            }}
            disabled={
              !nickname.trim() ||
              (requireRoll && !rollNumber.trim()) ||
              sessionCode.length !== 6
            }
          >
            Join session <ArrowRight />
          </button>
          <small>
            {lobbyOpen
              ? `${activityTitle} · Lobby open`
              : "You can connect now and wait for your teacher."}
          </small>
        </div>
        <div className="join-decor d1" />
        <div className="join-decor d2" />
        <div className="join-decor d3" />
      </div>
    );
  if (sessionFinished)
    return (
      <div className="student-results">
        <Logo />
        <main>
          <span>
            <Trophy />
          </span>
          <small>ACTIVITY COMPLETE</small>
          <h1>
            {points ? `Great work, ${nickname}!` : `Keep going, ${nickname}!`}
          </h1>
          <strong>{points.toLocaleString()}</strong>
          <p>
            {points
              ? "Total points scored"
              : "No points this time. Review the activity and try again—you’re here to learn."}
          </p>
          <section className="student-answer-review">
            <header>
              <div>
                <b>Review your answers</b>
                <span>
                  {
                    questions.filter(
                      (question, index) =>
                        answerHistory[index] === question.correct,
                    ).length
                  }{" "}
                  of {questions.length} correct
                </span>
              </div>
              <Check />
            </header>
            {questions.map((question, index) => {
              const chosen = answerHistory[index];
              const correct = chosen === question.correct;
              return (
                <article
                  key={index}
                  className={correct ? "correct" : "incorrect"}
                >
                  <b>Q{index + 1}</b>
                  <div>
                    <strong>{question.prompt}</strong>
                    <QuestionMedia question={question} compact />
                    <span>
                      Your answer:{" "}
                      {chosen === undefined
                        ? "No answer"
                        : `${String.fromCharCode(65 + chosen)}. ${question.answers[chosen]}`}
                    </span>
                    <em>
                      <Check /> Correct answer:{" "}
                      {String.fromCharCode(65 + question.correct)}.{" "}
                      {question.answers[question.correct]}
                    </em>
                  </div>
                </article>
              );
            })}
          </section>
          <div className="student-result-actions">
            <button onClick={() => window.print()}>
              <Printer />
              Print result
            </button>
            <button onClick={onExit}>
              Done <ArrowRight />
            </button>
          </div>
        </main>
      </div>
    );
  if (!sessionStarted)
    return (
      <div className="student-wait">
        <header>
          <Logo />
          {teacherPreview && (
            <button onClick={onExit}>
              <ArrowLeft /> Teacher view
            </button>
          )}
        </header>
        <main>
          <div className="waiting-pulse">
            <span />
            <span />
            <Users />
          </div>
          <small>CONNECTED · WAITING FOR TEACHER</small>
          <h1>You’re in, {nickname}!</h1>
          <p>
            {lobbyOpen
              ? "Your teacher has selected the activity. It will appear here automatically when the session starts."
              : "Your connection is ready. The teacher will choose an activity and open its lobby shortly."}{" "}
            Keep this page open.
          </p>
          <section>
            <div>
              <b>
                {lobbyOpen
                  ? activityTitle || "Class activity"
                  : "Waiting for an activity"}
              </b>
              <span>
                {lobbyOpen
                  ? className || "Srikanth Reddy’s class"
                  : "Srikanth Reddy will select the lobby"}
              </span>
            </div>
            <em className={lobbyOpen ? "" : "pending"}>
              <i /> {lobbyOpen ? "Lobby open" : "Connected"}
            </em>
          </section>
          {teacherPreview && (
            <button className="primary" onClick={onExit}>
              Return to teacher lobby <ArrowRight />
            </button>
          )}
        </main>
      </div>
    );
  const q = questions[current];
  return (
    <div className="student-play">
      <header>
        <Logo />
        <span>
          <i /> LIVE
        </span>
        <b>
          {nickname || "Student"} · {points.toLocaleString()} pts
        </b>
      </header>
      <main>
        <div
          className={`student-countdown ${remaining === 0 ? "expired" : ""}`}
        >
          <Clock3 />
          <b>{remaining}</b>
          <span>seconds left</span>
        </div>
        <p>
          QUESTION {current + 1} OF {questions.length}
        </p>
        <div className="student-timer">
          <span
            style={{
              width: `${Math.min(100, (remaining / Math.max(1, q.seconds)) * 100)}%`,
            }}
          />
        </div>
        <h1>{q.prompt}</h1>
        <QuestionMedia question={q} />
        <div className="student-answers">
          {q.answers.map((a, i) => (
            <button
              className={`s${i} ${selected === i ? "picked" : ""}`}
              disabled={remaining === 0}
              onClick={() => {
                setSelected(i);
                setAnswerHistory((history) => {
                  const next = { ...history, [current]: i };
                  window.localStorage.setItem(
                    "pulseclass-answers-" + expectedSessionCode,
                    JSON.stringify(next),
                  );
                  return next;
                });
                onResponse(i);
              }}
              key={a}
            >
              <b>{String.fromCharCode(65 + i)}</b>
              {a}
              {selected === i && <Check />}
            </button>
          ))}
        </div>
        {selected !== null ? (
          <div className="submitted">
            <Check />
            <div>
              <b>Answer saved!</b>
              <span>
                {remaining
                  ? "You can change it until the timer ends."
                  : "Time is up. Your final answer is locked."}
              </span>
            </div>
          </div>
        ) : (
          <p className="tap-hint">
            {remaining ? "Tap an answer to submit" : "Time is up"}
          </p>
        )}
      </main>
    </div>
  );
}

function ReportsArchive({
  reports,
  onOpen,
  onSessions,
}: {
  reports: SavedReport[];
  onOpen: (r: SavedReport) => void;
  onSessions: () => void;
}) {
  return (
    <div className="page module-page">
      <div className="module-head">
        <div>
          <p>SAVED RESULTS</p>
          <h1>Activity reports</h1>
          <span>Completed activity results remain available here.</span>
        </div>
      </div>
      {reports.length ? (
        <div className="reports-archive">
          {reports.map((report) => (
            <button key={report.id} onClick={() => onOpen(report)}>
              <span>
                <Trophy />
              </span>
              <div>
                <b>{report.title}</b>
                <small>
                  {report.className} · {report.participants.length} students ·{" "}
                  {new Date(report.createdAt).toLocaleString()}
                </small>
              </div>
              <ArrowRight />
            </button>
          ))}
        </div>
      ) : (
        <section className="module-empty standalone">
          <span>
            <BarChart3 />
          </span>
          <h2>No completed activity reports</h2>
          <p>Finish a live activity to save its leaderboard here.</p>
          <button className="primary" onClick={onSessions}>
            Open sessions
          </button>
        </section>
      )}
    </div>
  );
}

function LeaderboardReport({
  title,
  className,
  participants,
  scores,
  classScores,
  backLabel = "Back to reports",
  onBack,
}: {
  title: string;
  className: string;
  participants: Array<{ name: string; roll: string }>;
  scores: Record<string, number>;
  classScores: Record<string, { name: string; roll: string; points: number }>;
  backLabel?: string;
  onBack: () => void;
}) {
  const [fullscreen, setFullscreen] = useState<"activity" | "class" | null>(
    null,
  );
  const activityRows = participants
    .map((student) => ({
      ...student,
      points: scores[(student.roll || student.name).toLowerCase()] || 0,
    }))
    .sort((a, b) => b.points - a.points);
  const overallRows = Object.values(classScores).sort(
    (a, b) => b.points - a.points,
  );
  const Board = ({
    id,
    label,
    detail,
    rows,
  }: {
    id: "activity" | "class";
    label: string;
    detail: string;
    rows: Array<{ name: string; roll: string; points: number }>;
  }) => (
    <section
      className={`panel result-board ${fullscreen === id ? "board-fullscreen" : ""}`}
    >
      <header>
        <div>
          <h2>{label}</h2>
          <p>{detail}</p>
        </div>
        <button
          onClick={() => setFullscreen(fullscreen === id ? null : id)}
          aria-label={`Toggle ${label} fullscreen`}
        >
          {fullscreen === id ? <Minimize2 /> : <Maximize2 />}
        </button>
      </header>
      <div className="result-columns">
        <span>Rank</span>
        <span>Student name</span>
        <span>Roll number</span>
        <span>Points</span>
      </div>
      {rows.length ? (
        rows.map((student, index) => (
          <div className="result-row" key={student.roll || student.name}>
            <b className={index < 3 ? `place p${index + 1}` : "place"}>
              {index + 1}
            </b>
            <span className="result-student">
              <Avatar
                name={student.name}
                tone={index === 0 ? "coral" : "blue"}
              />
              <strong>{student.name}</strong>
            </span>
            <code>{student.roll || "Not provided"}</code>
            <em>{student.points.toLocaleString()} pts</em>
          </div>
        ))
      ) : (
        <div className="board-empty">No scored students yet.</div>
      )}
    </section>
  );
  return (
    <div className="page module-page leaderboard-report">
      <button className="context-back" onClick={onBack}>
        <ArrowLeft />
        {backLabel}
      </button>
      <div className="module-head">
        <div>
          <p>ACTIVITY RESULTS</p>
          <h1>{title}</h1>
          <span>
            {className} · {participants.length}{" "}
            {participants.length === 1 ? "participant" : "participants"}
          </span>
        </div>
      </div>
      <div className="leaderboard-grid">
        <Board
          id="activity"
          label="Current activity"
          detail="Points from this completed activity"
          rows={activityRows}
        />
        <Board
          id="class"
          label="Overall class"
          detail={`Cumulative points in ${className}`}
          rows={overallRows}
        />
      </div>
    </div>
  );
}

function ReportView({ onBack }: { onBack: () => void }) {
  const students = [
    ["1", "Alex Rivera", "AR", "9,420", "92%", "8.2s"],
    ["2", "Leah Kim", "LK", "8,980", "89%", "9.1s"],
    ["3", "Sam Malik", "SM", "8,640", "86%", "10.4s"],
    ["4", "Nora James", "NJ", "8,120", "84%", "11.8s"],
    ["5", "Owen Patel", "OP", "7,890", "81%", "12.1s"],
  ];
  return (
    <div className="page report-page">
      <div className="report-head">
        <button onClick={onBack}>
          <ArrowLeft />
        </button>
        <div>
          <p>SESSION REPORT</p>
          <h1>JavaScript Fundamentals</h1>
          <span>August 3, 2026 · 10:30 AM · 24 participants</span>
        </div>
        <button className="secondary">
          <FileText /> Export report
        </button>
      </div>
      <div className="report-summary">
        <div>
          <span className="stat-icon mint">
            <Users />
          </span>
          <strong>24</strong>
          <p>Participants</p>
        </div>
        <div>
          <span className="stat-icon coral">
            <Check />
          </span>
          <strong>84%</strong>
          <p>Average accuracy</p>
        </div>
        <div>
          <span className="stat-icon blue">
            <MessageSquareText />
          </span>
          <strong>96%</strong>
          <p>Completion rate</p>
        </div>
        <div>
          <span className="stat-icon gold">
            <Clock3 />
          </span>
          <strong>9.8s</strong>
          <p>Average response</p>
        </div>
      </div>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Question performance</h3>
              <p>Accuracy across the session</p>
            </div>
          </div>
          {[92, 88, 67, 84, 73, 96, 79, 91].map((n, i) => (
            <div className="question-result" key={i}>
              <b>Q{i + 1}</b>
              <div>
                <span style={{ width: `${n}%` }} />
              </div>
              <strong className={n < 75 ? "low" : ""}>{n}%</strong>
            </div>
          ))}
          <div className="attention">
            <Sparkles />
            <div>
              <b>Worth revisiting</b>
              <p>
                Students found question 3 on HTTP status codes most challenging.
              </p>
            </div>
          </div>
        </section>
        <section className="panel leaderboard">
          <div className="panel-head">
            <div>
              <h3>Leaderboard</h3>
              <p>Final results</p>
            </div>
            <button>View all</button>
          </div>
          {students.map(([rank, name, initials, pts, accuracy, time], i) => (
            <div className="leader-row" key={name}>
              <b className={i < 3 ? `rank r${i}` : "rank"}>{rank}</b>
              <Avatar
                name={initials}
                tone={i === 0 ? "coral" : i === 1 ? "blue" : "mint"}
              />
              <span>
                <b>{name}</b>
                <small>
                  {accuracy} correct · {time} avg.
                </small>
              </span>
              <strong>{pts}</strong>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
