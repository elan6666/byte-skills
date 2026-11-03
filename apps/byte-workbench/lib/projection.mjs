import { DatabaseSync } from "node:sqlite";
import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { hash, identityKey, json, scoped, text, iso } from "./files.mjs";
export const TASK_LABELS = {
  created: "已创建",
  ready: "待接手",
  accepted: "已接手",
  running: "执行记录",
  result_reported: "结果待核验",
  verified: "任务已核验",
  needs_input: "需要输入",
  failed: "任务异常",
  cancel_requested: "等待取消确认",
  cancelled: "已取消",
  main_continued: "主会话已继续",
};
const parse = (s, fallback = {}) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};
const rows = (db, table, tail = "", args = []) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table)
    ? db.prepare(`SELECT * FROM ${table} ${tail}`).all(...args)
    : [];
const safeIdentity = (i, pid) =>
  i &&
  [
    "harness",
    "host_id",
    "profile_id",
    "native_session_id",
    "project_id",
    "runtime_generation",
  ].every((k) => typeof i[k] === "string") &&
  i.project_id === pid;
export function workflow(root) {
  const path = join(root, ".byte-os/coordination/state.json");
  if (!existsSync(path)) return null;
  const s = json(scoped(root, ".byte-os/coordination/state.json")),
    o = s.overall_outcome;
  if (!o)
    return {
      goal: text(s.acceptance) || "项目协调记录",
      stage: text(s.stage),
      owner: text(s.owner_session || s.owner),
      next: text(s.next_action),
      status: "recorded",
      acceptance: [],
      iteration: null,
      run: null,
      updatedAt: iso(s.updated_at),
      evidence: [],
      source: ".byte-os/coordination/state.json",
    };
  const w = o.workflow || {},
    e = o.execution || {};
  const evidence = (w.evidence || []).slice(-12).map((x) => ({
    path: text(x.path || x.receipt?.path),
    sha256: text(x.sha256 || x.receipt?.sha256),
  }));
  return {
    goal: text(o.objective || o.goal || o.title) || "已登记的工作流",
    stage: text(w.step) || text(s.stage),
    owner: text(s.owner_session),
    next: text(o.next_action || s.next_action),
    status: text(o.status),
    mode: text(e.mode),
    acceptance: (Array.isArray(o.acceptance) ? o.acceptance : []).map((a) => ({
      id: text(a.id),
      title: text(a.description || a.criterion || a.text || a.id),
      met: a.status === "met",
    })),
    iteration: w.iteration ?? null,
    run: e.active_run || w.active_run || null,
    updatedAt: iso(s.updated_at || o.updated_at),
    evidence,
    source: ".byte-os/coordination/state.json",
  };
}
export function projectSnapshot(project, catalog, now = Date.now()) {
  const out = {
    project: { id: project.id, name: project.name, root: project.root },
    observedAt: new Date(now).toISOString(),
    demo: false,
    sessions: [],
    tasks: [],
    deliveries: [],
    events: [],
    runs: [],
    workflow: null,
    warnings: [],
    source: { bridge: false, native: catalog.enabled !== false },
  };
  const native = catalog.sessions(project.root);
  out.warnings.push(...native.warnings);
  const byNative = new Map();
  const addCatalog = (r) => {
    const id = `catalog:${r.harness}:${r.nativeId}`;
    const s = {
      id,
      nativeId: r.nativeId,
      harness: r.harness,
      title: r.title,
      model: r.model,
      modelSource: r.modelSource,
      parentNativeId: r.parentNativeId,
      identity: null,
      connection: "catalog",
      presence: "unknown",
      workState: "unknown",
      role: r.parentNativeId ? "子代理" : "未分配",
      lastActivityAt: r.updatedAt,
      activitySource: "本地目录更新时间",
      source: r.source,
      taskIds: [],
      capabilities: [],
      locator:
        r.harness === "codex"
          ? `codex://threads/${encodeURIComponent(r.nativeId)}`
          : null,
    };
    out.sessions.push(s);
    byNative.set(`${r.harness}:${r.nativeId}`, s);
  };
  for (const r of native.sessions) addCatalog(r);
  try {
    out.workflow = workflow(project.root);
  } catch {
    out.warnings.push("Byte 工作流记录不可读；保留未知状态。");
  }
  let db;
  const stateDir = join(project.root, ".session-bridge");
  if (!existsSync(stateDir)) return finalize(out, now);
  try {
    if (
      lstatSync(stateDir).isSymbolicLink() ||
      !lstatSync(stateDir).isDirectory()
    )
      throw Error("invalid state directory");
    const cfg = json(scoped(project.root, ".session-bridge/project.json"));
    if (cfg.protocol_version !== 1 || typeof cfg.project_id !== "string")
      throw Error("invalid project");
    const pid = cfg.project_id;
    const dbPath = scoped(project.root, ".session-bridge/bridge.sqlite");
    if (lstatSync(join(stateDir, "bridge.sqlite")).isSymbolicLink())
      throw Error("linked database");
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=500; BEGIN;");
    const version = Number(
      db.prepare("PRAGMA user_version").get().user_version,
    );
    if (version < 1 || version > 8) throw Error("unsupported schema");
    out.source.bridge = true;
    const byKey = new Map();
    for (const r of rows(db, "bindings")) {
      const i = parse(r.identity_json);
      if (!safeIdentity(i, pid)) {
        out.warnings.push("忽略了项目身份不匹配的会话记录。");
        continue;
      }
      const key = identityKey(i);
      let s = byNative.get(`${i.harness}:${i.native_session_id}`);
      // Distinct runtime generations remain distinct desks; never infer a replacement binding.
      if (!s || s.identity) {
        s = {
          id: key,
          nativeId: i.native_session_id,
          harness: i.harness,
          title: text(r.alias, 150) || "已接入会话",
          model: null,
          modelSource: null,
          parentNativeId: null,
          source: "bridge",
          locator:
            i.harness === "codex"
              ? `codex://threads/${encodeURIComponent(i.native_session_id)}`
              : null,
        };
        out.sessions.push(s);
      }
      Object.assign(s, {
        id: key,
        identity: i,
        connection: !r.active
          ? "inactive"
          : !Number.isFinite(Date.parse(r.expires_at)) ||
              Date.parse(r.expires_at) <= now
            ? "expired"
            : "registered",
        presence: "unknown",
        workState: "unknown",
        role: "未分配",
        taskIds: [],
        bindingId: r.binding_id,
        expiresAt: iso(r.expires_at),
      });
      byKey.set(key, s);
    }
    for (const r of rows(db, "role_assignments")) {
      const main = byKey.get(identityKey(parse(r.main_identity_json))),
        sup = byKey.get(identityKey(parse(r.supervisor_identity_json)));
      if (main) main.role = "主会话";
      if (sup) sup.role = "监督";
    }
    const eventRows = rows(db, "events", "ORDER BY seq DESC LIMIT 160");
    const eventTime = new Map(
      eventRows.map((e) => [Number(e.seq), iso(e.created_at)]),
    );
    const taskRows = rows(db, "tasks", "ORDER BY event_seq DESC LIMIT 500");
    const returns = new Map(
      rows(db, "task_returns").map((r) => [r.task_id, r]),
    );
    const observations = rows(
      db,
      "plugin_observations",
      "ORDER BY seq DESC LIMIT 1000",
    );
    const obsByMessage = new Map();
    for (const r of observations) {
      if (!obsByMessage.has(r.message_id))
        obsByMessage.set(r.message_id, parse(r.observation_json));
    }
    const allDeliveries = rows(
      db,
      "deliveries",
      "ORDER BY event_seq DESC LIMIT 1000",
    );
    for (const r of taskRows) {
      const i = parse(r.input_json);
      if (
        !safeIdentity(i.source, pid) ||
        !safeIdentity(i.target, pid) ||
        !safeIdentity(i.return_to, pid)
      )
        continue;
      const ret = returns.get(r.task_id);
      const t = {
        id: r.task_id,
        state: r.state,
        label: TASK_LABELS[r.state] || r.state,
        goal: text(i.goal, 1500),
        acceptance: Array.isArray(i.acceptance)
          ? i.acceptance.map((a) => text(a))
          : [],
        source: identityKey(i.source),
        target: identityKey(i.target),
        returnTo: identityKey(i.return_to),
        readPaths: (i.read_paths || []).map((p) => text(p)),
        writePaths: (i.write_paths || []).map((p) => text(p)),
        deadlineAt: iso(i.deadline_at),
        updatedAt: eventTime.get(Number(r.event_seq)) || null,
        returnState: ret?.state || null,
        artifacts: [],
      };
      const result = rows(db, "task_results", "WHERE task_id=?", [t.id])[0];
      if (result) {
        const value = parse(result.result_json);
        t.artifacts = (value.artifacts || [])
          .filter(
            (a) =>
              a.project_id === pid &&
              typeof a.relative_path === "string" &&
              /^[a-f0-9]{64}$/.test(a.sha256),
          )
          .map((a) => ({
            path: text(a.relative_path, 1000),
            sha256: a.sha256,
          }));
      }
      if (ret?.state === "main_continued") {
        t.label = "主会话已继续";
        t.state = "main_continued";
      }
      out.tasks.push(t);
      for (const [key, role] of [
        [t.source, "主会话"],
        [t.target, "执行"],
        [t.returnTo, "主会话"],
      ]) {
        const s = byKey.get(key);
        if (!s) continue;
        s.taskIds.push(t.id);
        if (s.role === "未分配") s.role = role;
        if (!s.lastActivityAt || t.updatedAt > s.lastActivityAt) {
          s.lastActivityAt = t.updatedAt;
          s.activitySource = "Bridge 任务事件";
        }
        if (!s.primaryTaskId) {
          s.primaryTaskId = t.id;
          s.workState = ["verified", "main_continued", "cancelled"].includes(
            t.state,
          )
            ? t.state
            : key === t.returnTo && t.state === "result_reported"
              ? "verifying"
              : key === t.target
                ? t.state
                : "waiting";
        }
      }
    }
    const observedTargets = new Set();
    for (const r of allDeliveries) {
      const e = parse(r.envelope_json);
      if (!safeIdentity(e.sender, pid) || !safeIdentity(e.target, pid))
        continue;
      const o = obsByMessage.get(r.message_id);
      const valid =
        o &&
        safeIdentity(o.session, pid) &&
        identityKey(o.session) === identityKey(e.target) &&
        o.message_id === r.message_id;
      out.deliveries.push({
        id: r.message_id,
        taskId: r.task_id,
        from: identityKey(e.sender),
        to: identityKey(e.target),
        kind: e.kind,
        state: r.state,
        observation: valid ? o.state : null,
        at: iso(e.created_at),
        summary: text(e.body?.text, 700),
        reason: text(r.reason),
        seq: Number(r.event_seq),
      });
      if (valid) {
        const key = identityKey(o.session),
          s = byKey.get(key),
          task = out.tasks.find((t) => t.id === r.task_id);
        if (s && !observedTargets.has(key)) {
          observedTargets.add(key);
          s.nativeObservation = o.state;
          // Observations have no timestamp in schema 8. A stored running observation
          // is evidence of a past observation, never proof of current liveness.
          if (
            task &&
            s.primaryTaskId === task.id &&
            ["created", "ready", "accepted", "running"].includes(task.state) &&
            o.state === "running" &&
            s.workState !== "verifying"
          )
            s.workState = "running";
        }
      }
    }
    for (const e of eventRows.reverse())
      out.events.push({
        seq: Number(e.seq),
        kind: e.kind,
        subjectId: e.subject_id,
        at: iso(e.created_at),
      });
    for (const r of rows(db, "supervision")) {
      const v = parse(r.request_json);
      const task = out.tasks.find((t) => t.id === v.task_id);
      if (!task || !v.run) continue;
      out.runs.push({
        id: r.id,
        taskId: v.task_id,
        runId: text(v.run.run_id),
        pid: typeof v.run.pid === "number" ? v.run.pid : null,
        startedAt: iso(v.run.started_at),
        sourceCommit: text(v.run.source_commit),
        configSha256: text(v.run.config_sha256),
        active: r.active === 1,
        nextCheckAt: iso(r.next_check_at),
        intervalSeconds: v.interval_seconds,
        supervisor:
          v.supervisor && safeIdentity(v.supervisor, pid)
            ? identityKey(v.supervisor)
            : null,
        lastEventId: r.last_event_id || null,
        status: r.active ? "supervised" : "inactive",
      });
    }
    db.exec("COMMIT");
  } catch {
    out.warnings.push(
      "Bridge 状态不可读或版本不兼容；不会创建、迁移或修复数据库。",
    );
  } finally {
    db?.close();
  }
  return finalize(out, now);
}
function finalize(out, now) {
  for (const s of out.sessions) {
    s.taskIds = [...new Set(s.taskIds)];
    s.stale = !s.lastActivityAt || now - Date.parse(s.lastActivityAt) > 120000;
    s.animate = false;
    if (s.connection !== "registered")
      s.presence = s.connection === "catalog" ? "unknown" : "offline";
    else s.presence = s.stale ? "stale" : "recorded";
  }
  out.tasks.sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  );
  out.deliveries = out.deliveries.slice(0, 100);
  out.counts = {
    sessions: out.sessions.length,
    connected: out.sessions.filter((s) => s.connection === "registered").length,
    needsAttention: out.tasks.filter((t) =>
      ["needs_input", "failed", "result_reported", "cancel_requested"].includes(
        t.state,
      ),
    ).length,
    running: out.tasks.filter((t) => t.state === "running").length,
    verified: out.tasks.filter(
      (t) => t.state === "verified" || t.state === "main_continued",
    ).length,
  };
  out.revision = hash({ ...out, observedAt: undefined });
  return out;
}
