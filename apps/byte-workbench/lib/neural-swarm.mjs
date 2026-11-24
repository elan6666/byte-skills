import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

function readJsonSafe(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function readJsonlSafe(path) {
  try {
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listFilesSorted(dir, matchFn) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(matchFn)
      .map((name) => {
        const full = join(dir, name);
        const st = statSync(full);
        return { name, full, mtimeMs: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

export function buildDemoNeuralSwarm(step = 0) {
  const clusters = [
    {
      id: "lead",
      title: "Codex 总控",
      en: "Coordinator",
      count: 24,
      color: "#a78bfa",
      state: "working",
      sub: "独立验收 · 协调调度",
      metricLabel: "已验收",
    },
    {
      id: "codex-methods",
      title: "Codex 主力",
      en: "Codex Researcher",
      count: 59,
      color: "#60a5fa",
      state: "working",
      sub: "Sprint Batching · 端到端对比",
      metricLabel: "冲刺批次",
    },
    {
      id: "ag-methods",
      title: "Antigravity 主力",
      en: "AG Researcher",
      count: 15,
      color: "#34d399",
      state: "working",
      sub: "BiCR-KRR · LMC32 机制",
      metricLabel: "核心模型",
    },
    {
      id: "watcher",
      title: "零Token守望",
      en: "Zero-Token Loop",
      count: 12,
      color: "#38bdf8",
      state: "waiting",
      sub: "launchd WatchPaths + 防停摆",
      metricLabel: "守望规则",
    },
    {
      id: "runs",
      title: "服务器算力",
      en: "Compute Runs",
      count: 8,
      color: "#fbbf24",
      state: step % 2 === 0 ? "working" : "waiting",
      sub: "GPU / 16核CPU 远端训练",
      metricLabel: "训练任务",
    },
    {
      id: "retro",
      title: "反思与教训",
      en: "Self-Iteration",
      count: 6,
      color: "#f472b6",
      state: "waiting",
      sub: "LESSONS · 工作流自优化",
      metricLabel: "迭代条目",
    },
  ];

  const links = [
    { from: "core", to: "lead", type: "mutual", color: "#a78bfa", weight: 3 },
    { from: "core", to: "codex-methods", type: "mutual", color: "#60a5fa", weight: 3 },
    { from: "core", to: "ag-methods", type: "mutual", color: "#34d399", weight: 3 },
    { from: "core", to: "watcher", type: "oneway", color: "#38bdf8", weight: 2 },
    { from: "core", to: "runs", type: "oneway", color: "#fbbf24", weight: 2 },
    { from: "core", to: "retro", type: "oneway", color: "#f472b6", weight: 1 },
    { from: "lead", to: "codex-methods", type: "mutual", color: "#818cf8", weight: 2 },
    { from: "lead", to: "ag-methods", type: "mutual", color: "#2dd4bf", weight: 2 },
    { from: "watcher", to: "lead", type: "oneway", color: "#38bdf8", weight: 2 },
    { from: "ag-methods", to: "runs", type: "oneway", color: "#fbbf24", weight: 2 },
  ];

  const trees = {};
  for (const c of clusters) {
    trees[c.id] = [
      {
        id: `${c.id}-n1`,
        title: `${c.title} · 最新里程碑`,
        subtitle: c.sub,
        color: c.color,
        outCount: 2,
        inCount: 1,
        path: null,
        children: [
          { id: `${c.id}-n1-c1`, title: "独立验收回执", subtitle: "verified · SHA-256 核验", color: c.color, outCount: 0, inCount: 1, path: null },
          { id: `${c.id}-n1-c2`, title: "冻结预测与对照", subtitle: "3 折留一 · 同信息预算", color: "#38bdf8", outCount: 0, inCount: 2, path: null },
        ],
      },
      {
        id: `${c.id}-n2`,
        title: `${c.title} · 协同记录`,
        subtitle: "Swarm 共享板 #seq 追踪",
        color: "#60a5fa",
        outCount: 1,
        inCount: 1,
        path: null,
        children: [
          { id: `${c.id}-n2-c1`, title: "工作流迭代与反例", subtitle: "Sprint Batching 约束", color: "#f472b6", outCount: 0, inCount: 1, path: null },
        ],
      },
    ];
  }

  return {
    mode: "demo",
    core: {
      title: "交付原创可证伪的端到端基因扰动预测模型",
      subtitle: "Neural Swarm 作战网 · 演示模式",
      status: "active",
      revision: 596,
    },
    metrics: {
      totalNodes: 124,
      totalLinks: 318,
      mutualLinks: 142,
      stalledCount: 0,
      verifiedCount: 74,
      runningCount: 1,
    },
    clusters,
    links,
    trees,
    board: [
      { seq: 1, ts: "16:30:38+0800", from: "lead", mentions: ["codex-methods", "ag-methods"], kind: "note", text: "已启用共享板、20分钟批次合并门控与无GPU漏斗训练规范。" },
    ],
    stallDiagnosis: { stalled: false, target: null, reason: "三方协同健康" },
    timeline: clusters.map((c, idx) => ({
      seq: idx + 1,
      ts: `T+${idx * 15}m`,
      clusterId: c.id,
      label: `${c.title}: ${c.sub}`,
      color: c.color,
    })),
  };
}

export function buildNeuralSwarm(projectRoot, snapshotData = null) {
  const byteOs = join(projectRoot, ".byte-os");
  const round04 = join(byteOs, "round-04");
  const coord = join(byteOs, "coordination");

  const state = readJsonSafe(join(coord, "state.json"), {});
  const outcome = state?.overall_outcome || {};
  const pausedFlag = existsSync(join(coord, "paused.flag"));
  const wfStatus = pausedFlag ? "paused" : outcome.status || "active";

  const board = readJsonlSafe(join(coord, "board.jsonl"));
  const cursors = readJsonSafe(join(coord, "board-cursors.json"), {});
  const activeRunsData = readJsonSafe(join(byteOs, "active-runs.json"), { runs: [] });
  const runs = Array.isArray(activeRunsData?.runs) ? activeRunsData.runs : [];

  const steerInputs = listFilesSorted(round04, (n) => n.endsWith("-steer-input.json"));
  const verifiedFiles = listFilesSorted(round04, (n) => n.endsWith("-mentor-verified.json"));
  const codexBatches = steerInputs.filter((f) => /^r\d+-/.test(f.name));
  const agBatches = steerInputs.filter((f) => f.name.startsWith("antigravity-"));

  const runningJobs = runs.filter((r) => r.status === "running");
  const doneJobs = runs.filter((r) => r.status === "done");
  const failedJobs = runs.filter((r) => r.status === "failed");

  const jobReqs = listFilesSorted(join(byteOs, "server-job-requests"), (n) => n.endsWith(".json") && !n.endsWith(".receipt.json"));

  // Detect stall from sessions or board
  const sessions = snapshotData?.sessions || [];
  const leadSession = sessions.find((s) => s.role === "lead" || s.title?.includes("总控"));
  const codexMethodsSession = sessions.find((s) => s.title?.includes("Codex 主力"));
  const agMethodsSession = sessions.find((s) => s.harness === "antigravity" && s.title?.includes("主力"));

  const sessionState = (s, defaultState = "waiting") => {
    if (!s) return defaultState;
    if (s.state === "working" || s.state === "running") return "working";
    if (s.state === "attention" || s.state === "error") return "stalled";
    return defaultState;
  };

  const leadUnread = board.length > 0 && board[board.length - 1].seq > (cursors?.lead?.last_read_seq || 0);
  const stalledCount = (leadUnread ? 1 : 0) + (failedJobs.length > 0 ? 1 : 0);

  const clusters = [
    {
      id: "lead",
      title: "Codex 总控",
      en: "Coordinator",
      count: verifiedFiles.length,
      color: "#a78bfa",
      state: wfStatus === "paused" ? "waiting" : sessionState(leadSession, "waiting"),
      sub: `独立验收 ${verifiedFiles.length} 批 · GPT-6.2-Sol`,
      metricLabel: "已验收",
    },
    {
      id: "codex-methods",
      title: "Codex 主力",
      en: "Codex Researcher",
      count: codexBatches.length,
      color: "#60a5fa",
      state: wfStatus === "paused" ? "waiting" : sessionState(codexMethodsSession, "waiting"),
      sub: codexBatches[0] ? `最新 ${codexBatches[0].name.replace("-research-batch-steer-input.json", "").toUpperCase()}` : "Sprint Batching 研究",
      metricLabel: "冲刺批次",
    },
    {
      id: "ag-methods",
      title: "Antigravity 主力",
      en: "AG Researcher",
      count: agBatches.length,
      color: "#34d399",
      state: runningJobs.some((r) => String(r.owner_session || "").includes("b922e0de")) ? "working" : sessionState(agMethodsSession, "waiting"),
      sub: agBatches[0] ? `最新 ${agBatches[0].name.replace("antigravity-", "").replace("-steer-input.json", "")}` : "端到端深度架构",
      metricLabel: "交付批次",
    },
    {
      id: "watcher",
      title: "零Token守望",
      en: "Zero-Token Loop",
      count: board.length + jobReqs.length + 1,
      color: "#38bdf8",
      state: wfStatus === "paused" ? "waiting" : "working",
      sub: "20m合并门控 · WatchPaths · 防停摆",
      metricLabel: "守望信号",
    },
    {
      id: "runs",
      title: "服务器算力",
      en: "Compute Runs",
      count: runs.length,
      color: "#fbbf24",
      state: runningJobs.length > 0 ? "working" : failedJobs.length > 0 ? "stalled" : "waiting",
      sub: `在跑 ${runningJobs.length} · 完成 ${doneJobs.length} · 失败 ${failedJobs.length}`,
      metricLabel: "训练记录",
    },
    {
      id: "retro",
      title: "反思与教训",
      en: "Self-Iteration",
      count: verifiedFiles.length > 0 ? Math.max(1, Math.floor(verifiedFiles.length / 10)) : 1,
      color: "#f472b6",
      state: "waiting",
      sub: "workflow-retrospective · LESSONS",
      metricLabel: "迭代沉淀",
    },
  ];

  const links = [
    { from: "core", to: "lead", type: "mutual", color: "#a78bfa", weight: 3 },
    { from: "core", to: "codex-methods", type: "mutual", color: "#60a5fa", weight: 3 },
    { from: "core", to: "ag-methods", type: "mutual", color: "#34d399", weight: 3 },
    { from: "core", to: "watcher", type: "oneway", color: "#38bdf8", weight: 2 },
    { from: "core", to: "runs", type: "oneway", color: "#fbbf24", weight: runningJobs.length > 0 ? 3 : 1 },
    { from: "core", to: "retro", type: "oneway", color: "#f472b6", weight: 1 },
    { from: "lead", to: "codex-methods", type: "mutual", color: "#818cf8", weight: 2 },
    { from: "lead", to: "ag-methods", type: "mutual", color: "#2dd4bf", weight: 2 },
    { from: "codex-methods", to: "ag-methods", type: "mutual", color: "#38bdf8", weight: 1 },
    { from: "watcher", to: "lead", type: "oneway", color: "#38bdf8", weight: 2 },
    { from: "ag-methods", to: "runs", type: "oneway", color: "#fbbf24", weight: 2 },
  ];

  // Build 3-level drilldown trees for each cluster
  const rel = (p) => relative(projectRoot, p);
  const toLeafFromSteer = (f, color) => {
    const data = readJsonSafe(f.full, {});
    const vName = f.name.replace("-steer-input.json", "-mentor-verified.json");
    const vPath = join(round04, vName);
    const hasVerified = existsSync(vPath);
    const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : [];
    const children = [];
    if (hasVerified) {
      children.push({
        id: `${f.name}-ver`,
        title: `验收回执 · ${vName.slice(0, 28)}`,
        subtitle: "mentor-verified.json",
        color: "#a78bfa",
        outCount: 0,
        inCount: 1,
        path: rel(vPath),
      });
    }
    for (const art of artifacts.slice(0, 3)) {
      if (art?.path) {
        children.push({
          id: `${f.name}-${art.path}`,
          title: art.path.split("/").pop(),
          subtitle: `SHA ${(art.sha256 || "").slice(0, 10)}`,
          color,
          outCount: 0,
          inCount: 1,
          path: art.path,
        });
      }
    }
    return {
      id: f.name,
      title: f.name.replace("-research-batch-steer-input.json", "").replace("-steer-input.json", "").toUpperCase(),
      subtitle: (data?.summary || "").slice(0, 48) || "已封存批次清单",
      color,
      outCount: children.length,
      inCount: 1,
      path: rel(f.full),
      children,
    };
  };

  const trees = {
    lead: verifiedFiles.slice(0, 12).map((vf) => {
      const vdata = readJsonSafe(vf.full, {});
      return {
        id: vf.name,
        title: vf.name.replace("-research-batch-mentor-verified.json", "").replace("-mentor-verified.json", "").toUpperCase(),
        subtitle: String(vdata?.status || "verified") + (vdata?.summary ? ` · ${String(vdata.summary).slice(0, 36)}` : ""),
        color: "#a78bfa",
        outCount: 1,
        inCount: 1,
        path: rel(vf.full),
        children: [
          {
            id: `${vf.name}-manifest`,
            title: "对应送验清单",
            subtitle: vdata?.task_id || "原任务",
            color: "#60a5fa",
            outCount: 0,
            inCount: 1,
            path: rel(join(round04, vf.name.replace("-mentor-verified.json", "-steer-input.json"))),
          },
        ],
      };
    }),
    "codex-methods": codexBatches.slice(0, 14).map((f) => toLeafFromSteer(f, "#60a5fa")),
    "ag-methods": agBatches.slice(0, 14).map((f) => toLeafFromSteer(f, "#34d399")),
    watcher: [
      {
        id: "watcher-lead",
        title: "lead-watch.py",
        subtitle: "WatchPaths + 20m 批次门控 + 作业队列",
        color: "#38bdf8",
        outCount: 2,
        inCount: 1,
        path: ".byte-os/lead-watch.py",
        children: [
          { id: "w-ag", title: "ag-watch.py", subtitle: "Antigravity 零Token自循环", color: "#34d399", outCount: 0, inCount: 1, path: ".byte-os/ag-watch.py" },
          { id: "w-say", title: "ag-say.py", subtitle: "Antigravity ACP 直连通道", color: "#a78bfa", outCount: 0, inCount: 1, path: ".byte-os/ag-say.py" },
        ],
      },
      ...board.slice(-8).reverse().map((b) => ({
        id: `board-${b.seq}`,
        title: `#${b.seq} [${b.from} → ${(b.mentions || []).join(",") || "all"}]`,
        subtitle: (b.text || "").slice(0, 52),
        color: "#38bdf8",
        outCount: 0,
        inCount: 1,
        path: ".byte-os/coordination/board.jsonl",
        children: [],
      })),
    ],
    runs: runs.slice(-14).reverse().map((r) => ({
      id: r.id || "run",
      title: `${r.id} (a${r.attempt || 1})`,
      subtitle: `${r.status} · PID ${r.pid || "—"} · ${r.gpu ? `GPU${r.gpu}` : "CPU16"}`,
      color: r.status === "running" ? "#fbbf24" : r.status === "done" ? "#34d399" : "#f87171",
      outCount: r.terminal_verification ? 1 : 0,
      inCount: 1,
      path: ".byte-os/active-runs.json",
      children: r.terminal_verification
        ? [{ id: `${r.id}-tv`, title: "终态核验回执", subtitle: r.terminal_verification, color: "#a78bfa", outCount: 0, inCount: 1, path: r.terminal_verification }]
        : [],
    })),
    retro: [
      {
        id: "retro-doc",
        title: "workflow-retrospective.md",
        subtitle: "三方协作反思与工作流迭代记录",
        color: "#f472b6",
        outCount: 2,
        inCount: 1,
        path: ".byte-os/coordination/workflow-retrospective.md",
        children: [
          { id: "lessons-doc", title: "LESSONS.md", subtitle: "永久防呆教训库", color: "#fbbf24", outCount: 0, inCount: 1, path: ".byte-os/LESSONS.md" },
          { id: "agents-doc", title: "AGENTS.md", subtitle: "三会话极简协作总纲", color: "#a78bfa", outCount: 0, inCount: 1, path: "AGENTS.md" },
        ],
      },
    ],
  };

  const timeline = steerInputs
    .slice(0, 20)
    .reverse()
    .map((f, idx) => ({
      seq: idx + 1,
      ts: new Date(f.mtimeMs).toLocaleTimeString("zh-CN", { hour12: false }),
      clusterId: f.name.startsWith("antigravity-") ? "ag-methods" : "codex-methods",
      label: f.name.replace("-research-batch-steer-input.json", "").replace("-steer-input.json", "").toUpperCase(),
      color: f.name.startsWith("antigravity-") ? "#34d399" : "#60a5fa",
    }));

  const pendingCount = Math.max(0, steerInputs.length - verifiedFiles.length);

  return {
    mode: "live",
    core: {
      title: outcome.objective && outcome.objective.length > 44 ? `${outcome.objective.slice(0, 44)}…` : (outcome.objective || "交付原创可证伪端到端模型"),
      subtitle: `${wfStatus === "paused" ? "已暂停 (Paused)" : "自主循环中 (Active)"} · Workflow rev${state?.revision || "—"}`,
      status: wfStatus,
      revision: state?.revision || 0,
    },
    metrics: {
      totalNodes: steerInputs.length + verifiedFiles.length + runs.length + board.length,
      totalLinks: links.length + verifiedFiles.length * 2 + runs.length,
      mutualLinks: links.filter((l) => l.type === "mutual").length + verifiedFiles.length,
      stalledCount,
      verifiedCount: verifiedFiles.length,
      runningCount: runningJobs.length,
      pendingCount,
    },
    clusters,
    links,
    trees,
    board: board.slice(-20),
    stallDiagnosis: {
      stalled: stalledCount > 0,
      reason: leadUnread ? "共享板有总控未读消息" : failedJobs.length > 0 ? `存在 ${failedJobs.length} 个失败运行` : "三方协同健康",
    },
    timeline,
  };
}

export function appendNeuralBoardPost(projectRoot, { sender, to, kind, text }) {
  const coord = join(projectRoot, ".byte-os/coordination");
  mkdirSync(coord, { recursive: true });
  const bpath = join(coord, "board.jsonl");
  const cpath = join(coord, "board-cursors.json");
  const posts = readJsonlSafe(bpath);
  const cursors = readJsonSafe(cpath, {});
  const seq = posts.length > 0 ? (posts[posts.length - 1].seq || 0) + 1 : 1;
  const mentions = String(to || "")
    .split(",")
    .map((s) => s.trim().replace(/^@/, ""))
    .filter(Boolean);
  const entry = {
    seq,
    ts: new Date().toISOString(),
    from: sender || "user",
    mentions,
    kind: kind || "note",
    text: String(text || "").trim(),
  };
  writeFileSync(bpath, [...posts, entry].map((p) => JSON.stringify(p)).join("\n") + "\n", "utf8");
  cursors[entry.from] = {
    last_post_seq: seq,
    last_read_seq: Math.max(Number(cursors?.[entry.from]?.last_read_seq || 0), seq),
  };
  writeFileSync(cpath, JSON.stringify(cursors, null, 2) + "\n", "utf8");
  return entry;
}
