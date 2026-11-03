import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hash, identityKey } from "../lib/files.mjs";
export function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "byte-office-"))),
    root = join(base, "project"),
    other = join(base, "other"),
    home = join(base, "home");
  for (const p of [
    root,
    other,
    home,
    join(root, ".session-bridge"),
    join(root, "reports"),
  ])
    mkdirSync(p, { recursive: true });
  const projectId = "fixture-project",
    main = {
      harness: "codex",
      host_id: "test-host",
      profile_id: "test-profile",
      native_session_id: "main-session",
      project_id: projectId,
      runtime_generation: "generation-1",
    },
    worker = { ...main, harness: "zcode", native_session_id: "worker-session" };
  writeFileSync(
    join(root, ".session-bridge/project.json"),
    JSON.stringify({ protocol_version: 1, project_id: projectId }),
  );
  const path = join(root, ".session-bridge/bridge.sqlite"),
    db = new DatabaseSync(path);
  db.exec(`PRAGMA user_version=8;
 CREATE TABLE bindings(binding_id TEXT,native_key TEXT,session_key TEXT,identity_json TEXT,alias TEXT,mode TEXT,capabilities_json TEXT,endpoint_ref TEXT,expires_at TEXT,active INTEGER);
 CREATE TABLE tasks(task_id TEXT PRIMARY KEY,state TEXT,input_json TEXT,input_sha256 TEXT,event_seq INTEGER);
 CREATE TABLE events(seq INTEGER PRIMARY KEY,kind TEXT,subject_id TEXT,payload_json TEXT,created_at TEXT);
 CREATE TABLE role_assignments(main_identity_json TEXT,supervisor_identity_json TEXT);
 CREATE TABLE plugin_observations(seq INTEGER PRIMARY KEY,message_id TEXT,session_key TEXT,observation_json TEXT);
 CREATE TABLE deliveries(message_id TEXT PRIMARY KEY,task_id TEXT,envelope_json TEXT,state TEXT,event_seq INTEGER,reason TEXT);
 CREATE TABLE task_results(task_id TEXT PRIMARY KEY,sha256 TEXT,result_json TEXT,reported_at TEXT);
 CREATE TABLE task_returns(task_id TEXT,state TEXT);
 CREATE TABLE supervision(id TEXT,request_json TEXT,active INTEGER,next_check_at TEXT,last_event_id TEXT);
 CREATE TABLE capabilities(secret TEXT);INSERT INTO capabilities VALUES('do-not-expose-private-capability');`);
  const now = new Date().toISOString();
  function bind(
    i,
    alias,
    expires = new Date(Date.now() + 86400000).toISOString(),
    active = 1,
  ) {
    db.prepare("INSERT INTO bindings VALUES(?,?,?,?,?,?,?,?,?,?)").run(
      identityKey(i),
      i.native_session_id,
      identityKey(i),
      JSON.stringify(i),
      alias,
      "execute",
      JSON.stringify([{ name: "private-capability", supported: true }]),
      "private-endpoint-token",
      expires,
      active,
    );
  }
  bind(main, "主设计");
  bind(worker, "监督");
  db.prepare("INSERT INTO role_assignments VALUES(?,?)").run(
    JSON.stringify(main),
    JSON.stringify(worker),
  );
  function task(
    id = "task-1",
    state = "running",
    seq = 1,
    source = main,
    target = worker,
  ) {
    const input = {
      source,
      target,
      return_to: source,
      goal: "完成受控实验 <script>bad()</script>",
      acceptance: ["核验真实结果"],
      read_paths: ["src/"],
      write_paths: ["reports/"],
    };
    db.prepare("INSERT OR REPLACE INTO tasks VALUES(?,?,?,?,?)").run(
      id,
      state,
      JSON.stringify(input),
      hash(input),
      seq,
    );
    db.prepare("INSERT OR REPLACE INTO events VALUES(?,?,?,?,?)").run(
      seq,
      "task_" + state,
      id,
      "{}",
      now,
    );
    return input;
  }
  task();
  const envelope = {
    sender: main,
    target: worker,
    kind: "task",
    created_at: now,
    body: { text: "只处理登记的实验任务" },
  };
  db.prepare("INSERT INTO deliveries VALUES(?,?,?,?,?,?)").run(
    "message-1",
    "task-1",
    JSON.stringify(envelope),
    "receiver_accepted",
    1,
    null,
  );
  function observation(state, seq = 1, session = worker) {
    const o = { message_id: "message-1", session, state };
    db.prepare("INSERT INTO plugin_observations VALUES(?,?,?,?)").run(
      seq,
      "message-1",
      identityKey(session),
      JSON.stringify(o),
    );
  }
  observation("running");
  const artifactPath = join(root, "reports/result.json"),
    artifactText = '{"loss":0.001}\n';
  writeFileSync(artifactPath, artifactText);
  function artifacts(
    list = [
      {
        project_id: projectId,
        relative_path: "reports/result.json",
        sha256: hash(artifactText),
      },
    ],
  ) {
    const result = { artifacts: list };
    db.prepare("INSERT OR REPLACE INTO task_results VALUES(?,?,?,?)").run(
      "task-1",
      hash(result),
      JSON.stringify(result),
      now,
    );
  }
  artifacts();
  const input = {
    task_id: "task-1",
    supervisor: worker,
    interval_seconds: 1800,
    run: {
      run_id: "run-1",
      pid: 1234,
      started_at: now,
      source_commit: "abc123",
      config_sha256: hash("config"),
    },
  };
  db.prepare("INSERT INTO supervision VALUES(?,?,?,?,?)").run(
    "supervision-1",
    JSON.stringify(input),
    1,
    new Date(Date.now() + 1800000).toISOString(),
    null,
  );
  return {
    base,
    root,
    other,
    home,
    path,
    db,
    main,
    worker,
    projectId,
    now,
    bind,
    task,
    observation,
    artifacts,
    artifactPath,
    cleanup() {
      try {
        db.close();
      } catch {}
      rmSync(base, { recursive: true, force: true });
    },
  };
}
export function nativeFixture(f) {
  const file = join(f.home, ".codex/state_5.sqlite");
  mkdirSync(join(f.home, ".codex"), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE threads(id TEXT,title TEXT,cwd TEXT,updated_at INTEGER,model TEXT,archived INTEGER,attached_thread_parent_id TEXT);
 CREATE TABLE projects(id TEXT,name TEXT);CREATE TABLE project_roots(project_id TEXT,position INTEGER,path TEXT);CREATE TABLE thread_spawn_edges(parent_thread_id TEXT,child_thread_id TEXT);`);
  const stmt = db.prepare("INSERT INTO threads VALUES(?,?,?,?,?,?,?)");
  for (const [id, cwd, archived, parent] of [
    ["main-session", f.root, 0, null],
    ["child-session", f.root, 0, "main-session"],
    ["other-session", f.other, 0, null],
    ["archived-session", f.root, 1, null],
  ])
    stmt.run(
      id,
      id,
      cwd,
      Math.floor(Date.now() / 1000),
      "test-model",
      archived,
      parent,
    );
  db.exec("INSERT INTO projects VALUES('native-project','测试项目')");
  db.prepare("INSERT INTO project_roots VALUES(?,?,?)").run(
    "native-project",
    0,
    f.root,
  );
  db.exec(
    "INSERT INTO thread_spawn_edges VALUES('main-session','child-session')",
  );
  db.close();
  return file;
}
