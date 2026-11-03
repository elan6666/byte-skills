import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { request } from "node:http";
import { fixture, nativeFixture } from "./fixtures.mjs";
import { NativeCatalog } from "../lib/native.mjs";
import { ProjectCatalog } from "../lib/catalog.mjs";
import { projectSnapshot, workflow } from "../lib/projection.mjs";
import { identityKey, hash } from "../lib/files.mjs";
import { createWorkbench } from "../server.mjs";
import { demoSnapshot } from "../lib/demo.mjs";
import { writeBoard, changeBoard } from '../../../skills/byte-plan/scripts/workboard.mjs';
const empty = { sessions: () => ({ sessions: [], warnings: [] }) };
test("project counts combine native harness catalogs without double counting project metadata", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const native = {
    projects: () => [
      { root: f.root, source: "codex-project", name: "Project" },
      { root: f.root, source: "codex-catalog", count: 2 },
      { root: f.root, source: "zcode-catalog", count: 3 },
    ],
  };
  const c = new ProjectCatalog(native, {
    roots: [f.root],
    config: join(f.base, "unused.json"),
  });
  assert.equal(c.list()[0].count, 5);
});
test("other harnesses enter their own exact Bridge desks without guessed model, URLs or liveness", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  for (const harness of ["claude", "opencode", "dsh", "hermes", "kimi", "pi"])
    f.bind(
      { ...f.worker, harness, native_session_id: harness + "-session" },
      harness,
    );
  const s = projectSnapshot(project(f), empty);
  assert.equal(s.sessions.length, 8);
  for (const agent of s.sessions.filter(
    (x) => !["codex", "zcode"].includes(x.harness),
  )) {
    assert.equal(agent.locator, null);
    assert.equal(agent.model, null);
    assert.equal(agent.workState, "unknown");
    assert.equal(agent.animate, false);
  }
});
function project(f) {
  return { id: "fixture", name: "Fixture", root: f.root };
}
async function service(t, f, extra = {}) {
  // Existing server behavior tests explicitly opt their two fixture chats in.
  writeBoard(f.root,0,b=>changeBoard(b,'display',[f.main,f.worker].map(i=>({harness:i.harness,nativeId:i.native_session_id}))));
  const server = createWorkbench({
    roots: [f.root, f.other],
    home: f.home,
    discover: false,
    config: join(f.base, "settings/projects.json"),
    interval: 40,
    ...extra,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.closeWorkbench());
  const base = "http://127.0.0.1:" + server.address().port;
  const list = await (await fetch(base + "/api/projects")).json();
  return {
    server,
    base,
    id: list.projects.find((p) => p.root === f.root)?.id,
    otherId: list.projects.find((p) => p.root === f.other)?.id,
  };
}
test("native discovery is exact-project, excludes archives and preserves parent/model metadata", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  nativeFixture(f);
  const c = new NativeCatalog({ home: f.home }),
    s = c.sessions(f.root);
  assert.deepEqual(s.sessions.map((x) => x.nativeId).sort(), [
    "child-session",
    "main-session",
  ]);
  assert.equal(
    s.sessions.find((x) => x.nativeId === "child-session").parentNativeId,
    "main-session",
  );
  assert.equal(s.sessions[0].model, "test-model");
  assert(c.projects().some((x) => x.root === f.other));
});
test("read-only snapshot never changes the database or reveals private transport material", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  f.db.close();
  const before = hash(readFileSync(f.path)),
    mtime = statSync(f.path).mtimeMs,
    s = projectSnapshot(project(f), empty);
  assert.equal(hash(readFileSync(f.path)), before);
  assert.equal(statSync(f.path).mtimeMs, mtime);
  const serialized = JSON.stringify(s);
  assert(!serialized.includes("private-endpoint-token"));
  assert(!serialized.includes("private-capability"));
  assert(!serialized.includes("do-not-expose"));
  assert.equal(s.counts.connected, 2);
  assert.equal(s.tasks[0].state, "running");
  assert.equal(s.sessions.find((x) => x.harness === "zcode").animate, false);
  assert.equal(s.runs[0].intervalSeconds, 1800);
});
test("catalog-only recent chats remain unknown; exact runtime generations stay separate", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  nativeFixture(f);
  f.bind({ ...f.main, runtime_generation: "generation-2" }, "新代次");
  const s = projectSnapshot(project(f), new NativeCatalog({ home: f.home }));
  assert.equal(
    s.sessions.filter((x) => x.nativeId === "main-session").length,
    2,
  );
  const child = s.sessions.find((x) => x.nativeId === "child-session");
  assert.equal(child.connection, "catalog");
  assert.equal(child.workState, "unknown");
  assert.equal(child.animate, false);
  assert.equal(
    s.sessions.find((x) => x.id === identityKey(f.main)).role,
    "主会话",
  );
});
test("historical running observations never override input, failure or cancellation attention", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  for (const state of ["needs_input", "failed", "cancel_requested"]) {
    f.db.prepare("UPDATE tasks SET state=?").run(state);
    const s = projectSnapshot(project(f), empty);
    assert.equal(
      s.sessions.find((s) => s.harness === "zcode").workState,
      state,
    );
    assert.equal(s.counts.needsAttention, 1);
  }
});
test("expired/malformed registrations and mismatched project identities do not show as connected", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  f.db
    .prepare("UPDATE bindings SET expires_at=? WHERE binding_id=?")
    .run("invalid", identityKey(f.worker));
  f.bind(
    { ...f.worker, project_id: "other-project", runtime_generation: "x" },
    "bad",
  );
  const s = projectSnapshot(project(f), empty);
  assert.equal(s.counts.connected, 1);
  assert.equal(s.sessions.length, 2);
  assert.equal(
    s.sessions.find((x) => x.harness === "zcode").connection,
    "expired",
  );
  assert(s.warnings.length);
});
test("latest observation wins, but cannot resurrect terminal tasks or create live animation", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  f.observation("completed", 2);
  f.db.prepare("UPDATE tasks SET state=?").run("result_reported");
  let s = projectSnapshot(project(f), empty);
  assert.equal(s.counts.verified, 0);
  assert.equal(s.counts.needsAttention, 1);
  assert.equal(
    s.sessions.find((x) => x.id === identityKey(f.main)).workState,
    "verifying",
  );
  assert.equal(
    s.sessions.find((x) => x.harness === "zcode").nativeObservation,
    "completed",
  );
  f.db.exec("INSERT INTO task_returns VALUES('task-1','main_continued')");
  s = projectSnapshot(project(f), empty);
  assert.equal(s.counts.verified, 1);
  assert.equal(s.tasks[0].state, "main_continued");
  assert(s.sessions.every((x) => !x.animate));
  assert.equal(
    s.sessions.find((x) => x.harness === "zcode").workState,
    "main_continued",
  );
});
test("newest terminal task takes precedence over older running tasks", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  f.task("task-new", "verified", 2);
  const s = projectSnapshot(project(f), empty);
  assert.equal(
    s.sessions.find((x) => x.harness === "zcode").workState,
    "verified",
  );
  assert.equal(s.sessions.find((x) => x.harness === "codex").taskIds.length, 2);
});
test("missing Bridge state remains absent; unsupported versions degrade without migration", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const plain = projectSnapshot({ ...project(f), root: f.other }, empty);
  assert.equal(plain.source.bridge, false);
  assert(!existsSync(join(f.other, ".session-bridge")));
  f.db.exec("PRAGMA user_version=999");
  const s = projectSnapshot(project(f), empty);
  assert.equal(s.source.bridge, false);
  assert(s.warnings.length);
  assert.equal(f.db.prepare("PRAGMA user_version").get().user_version, 999);
});
test("workflow loops preserve recorded acceptance instead of inventing percent complete", (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  mkdirSync(join(f.root, ".byte-os/coordination"), { recursive: true });
  writeFileSync(
    join(f.root, ".byte-os/coordination/state.json"),
    JSON.stringify({
      overall_outcome: {
        objective: "持续迭代",
        status: "active",
        workflow: { step: "diagnosis", iteration: 7 },
        acceptance: [
          { id: "a", status: "met", description: "验收 A" },
          { id: "b", status: "open", description: "验收 B" },
        ],
      },
    }),
  );
  const w = workflow(f.root);
  assert.equal(w.iteration, 7);
  assert.equal(w.acceptance.filter((x) => x.met).length, 1);
  assert.equal(w.status, "active");
  assert(!("percent" in w));
});
test("HTTP project selection is explicit; adding a project writes only workbench configuration", async (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const s = await service(t, f);
  assert.equal((await fetch(s.base + "/api/snapshot")).status, 400);
  const res = await fetch(s.base + "/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root: f.other, name: "Another" }),
  });
  assert.equal(res.status, 201);
  assert(existsSync(join(f.base, "settings/projects.json")));
  assert(!existsSync(join(f.other, ".session-bridge")));
  const snap = await (
    await fetch(s.base + "/api/snapshot?project=" + s.id)
  ).json();
  assert.equal(snap.tasks.length, 1);
  const other = await (
    await fetch(s.base + "/api/snapshot?project=" + s.otherId)
  ).json();
  assert.equal(other.tasks.length, 0);
  assert(!JSON.stringify(other).includes("task-1"));
});
test("artifact access validates registered hash and confines real paths to the selected project", async (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const s = await service(t, f),
    url =
      s.base +
      "/api/artifact?" +
      new URLSearchParams({ project: s.id, task: "task-1", index: 0 });
  assert.equal((await fetch(url)).status, 200);
  writeFileSync(f.artifactPath, "changed");
  assert.equal((await fetch(url)).status, 400);
  const outside = join(f.other, "secret.txt");
  writeFileSync(outside, "external");
  symlinkSync(outside, join(f.root, "reports/link.txt"));
  f.artifacts([
    {
      project_id: f.projectId,
      relative_path: "reports/link.txt",
      sha256: hash("external"),
    },
  ]);
  assert.equal((await fetch(url)).status, 400);
  assert.equal(
    (
      await fetch(
        s.base +
          "/api/artifact?" +
          new URLSearchParams({ project: s.otherId, task: "task-1", index: 0 }),
      )
    ).status,
    404,
  );
});
test("cross-origin and DNS-rebinding requests cannot read or mutate local settings", async (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const s = await service(t, f);
  assert.equal(
    (
      await fetch(s.base + "/api/projects", {
        headers: { Origin: "https://evil.invalid" },
      })
    ).status,
    403,
  );
  const code = await new Promise((resolve, reject) => {
    const req = request(
      s.base + "/api/projects",
      { headers: { Host: "evil.invalid" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(code, 403);
  assert.equal(
    (await fetch(s.base + "/api/execute", { method: "POST" })).status,
    405,
  );
  assert(!existsSync(join(f.base, "settings/projects.json")));
});
test("SSE publishes real state changes with project isolation", async (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const s = await service(t, f),
    controller = new AbortController();
  t.after(() => controller.abort());
  const res = await fetch(s.base + "/api/events?project=" + s.id, {
      signal: controller.signal,
    }),
    reader = res.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  async function next() {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const match = buffer.match(/event: snapshot\ndata: (.+)\n\n/);
      if (match) {
        buffer = buffer.slice(match.index + match[0].length);
        return JSON.parse(match[1]);
      }
      const chunk = await Promise.race([
        reader.read(),
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("SSE timeout")), 3000).unref(),
        ),
      ]);
      buffer += decoder.decode(chunk.value, { stream: true });
    }
    throw Error("no snapshot");
  }
  assert.equal((await next()).tasks[0].state, "running");
  f.task("task-1", "needs_input", 2);
  const update = await next();
  assert.equal(update.tasks[0].state, "needs_input");
  assert.equal(update.counts.needsAttention, 1);
  assert.equal(update.project.id, s.id);
  controller.abort();
});
test("demo progression stays isolated and does not turn acceptance into overall completion", async (t) => {
  const f = fixture();
  t.after(() => f.cleanup());
  const s = await service(t, f, { demoOnly: true });
  assert.equal(
    (await fetch(s.base + "/api/snapshot?project=" + hash(f.root).slice(0, 24)))
      .status,
    400,
  );
  const demo = await (
    await fetch(s.base + "/api/demo/next", { method: "POST" })
  ).json();
  assert.equal(demo.demo, true);
  assert.equal(demo.demoStep, 1);
  assert.equal(demoSnapshot(4).workflow.status, "active");
  assert.equal(demoSnapshot(4).counts.verified, 1);
  assert.equal(
    (await fetch(s.base + "/api/projects", { method: "POST", body: "{}" }))
      .status,
    403,
  );
  assert(!existsSync(join(f.base, "settings/projects.json")));
});
