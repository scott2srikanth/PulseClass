import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PulseClass application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>PulseClass — Every voice in the room<\/title>/i);
  assert.match(html, /Restoring your workspace/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("uses durable rooms and event-driven browser synchronization", async () => {
  const [page, worker, session, catalog, vite] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/classroom-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/workspace-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(vite, /CLASSROOM_SESSIONS/);
  assert.match(page, /Image uploaded and ready/);
  assert.match(page, /uploaded-image-preview/);
  assert.match(page, /onLoad=\{\(\)\s*=>\s*setImageState\("ready"\)\}/);
  assert.match(vite, /new_sqlite_classes/);
  assert.match(worker, /idFromName\(`session:\$\{code\}`\)/);
  assert.match(session, /acceptWebSocket/);
  assert.match(session, /state\.storage\.put\("session"/);
  assert.match(session, /Date\.now\(\) <= this\.session\.timerEnd/);
  assert.match(session, /HOST_BATCH_MS = 100/);
  assert.match(session, /HOST_BATCH_COUNT = 50/);
  assert.match(session, /RESULT_RETENTION_MS/);
  assert.match(session, /async alarm/);
  assert.match(session, /revision/);
  assert.match(session, /MAX_STUDENTS = 400/);
  assert.match(session, /MAX_STUDENT_MESSAGES_PER_SECOND/);
  assert.match(session, /Action not allowed for this role/);
  assert.match(session, /answerVersions/);
  assert.match(session, /questions\[this\.session\.current\]\?\.points/);
  assert.match(session, /Math\.min\(100/);
  assert.match(session, /imageReadyCounts/);
  assert.match(session, /"ready"/);
  assert.match(session, /responses:update/);
  assert.match(session, /bufferedAmount/);
  assert.match(catalog, /state\.storage\.put\("catalog"/);
  assert.match(page, /new WebSocket/);
  assert.match(page, /sessionReconnectRef/);
  assert.match(page, /Room health: Excellent/);
  assert.match(page, /Code reading/);
  assert.match(page, /Image identification/);
  assert.match(page, /imagePrompt/);
  assert.match(page, /QuestionMedia/);
  assert.match(page, /questionPresentationReady/);
  assert.match(page, /Upload required before presenting/);
  assert.match(page, /Add and save an image/);
  assert.match(page, /Question points/);
  assert.match(page, /difficulty/);
  assert.match(page, /Never assign more than 100 points/);
  assert.match(page, /Every question must have between 0 and 100 points/);
  assert.match(page, /DIFFICULTY DISTRIBUTION/);
  assert.match(page, /All easy/);
  assert.match(page, /Easy and medium/);
  assert.match(page, /Mixed: easy, medium and hard/);
  assert.match(page, /Print result/);
  assert.match(page, /vertical-chart/);
  assert.match(worker, /locationHint: "apac"/);
  assert.match(worker, /workspace:\$\{workspace\}/);
  assert.match(worker, /Retry-After/);
  assert.match(worker, /QUIZ_IMAGES\.put/);
  assert.match(worker, /max-age=31536000, immutable/);
  assert.match(worker, /UPLOAD_AUTH_SECRET/);
  assert.match(worker, /uploadAuthSecret/);
  assert.doesNotMatch(worker, /Teacher uploads are not configured/);
  assert.match(worker, /pc_teacher/);
  assert.match(worker, /withinUploadLimit/);
  assert.match(worker, /crypto\.subtle\.digest\("SHA-256",bytes\)/);
  assert.match(worker, /QUIZ_IMAGES\.head/);
  assert.match(worker, /caches\.default\.match/);
  assert.match(worker, /QUIZ_IMAGES\.delete/);
  assert.match(page, /optimizeQuizImage/);
  assert.match(page, /targetBytes: 48 \* 1024/);
  assert.match(page, /targetBytes: 96 \* 1024/);
  assert.match(page, /Maximum compression/);
  assert.match(page, /Rename class/);
  assert.match(page, /onRenameActivity/);
  assert.match(page, /Activity renamed/);
  assert.match(page, /Class renamed/);
  assert.match(page, /useState<ImageCompressionMode>\("balanced"\)/);
  assert.match(page, /dimensionScale\s*\*=\s*0\.82/);
  assert.match(page, /cleanupStoredImages/);
  assert.match(page, /onImageReady/);
  assert.match(page, /You can start now/);
  assert.doesNotMatch(page, /disabled=\{currentImageWaiting>0\}/);
  assert.doesNotMatch(page, /disabled=\{!last&&nextImageWaiting>0\}/);
  assert.doesNotMatch(page, /setInterval\(poll/);
});
