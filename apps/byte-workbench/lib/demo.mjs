export const demoProject = {
  id: "demo-office",
  name: "苔原研究所",
  root: "演示数据 · 不连接真实客户端",
  source: "demo",
  count: 6,
  bridge: false,
  workflow: true,
};
export function demoSnapshot(step = 0) {
  const now = new Date().toISOString();
  const stages = ["准备交接", "监督中", "等待输入", "结果待核验", "主会话继续"];
  const source = "demo-main",
    sup = "demo-watch";
  const sessions = [
    ["demo-main", "codex", "实验设计与核心实现", "GPT · 演示", "主会话"],
    ["demo-review", "codex", "独立验收", "GPT · 演示", "评审"],
    ["demo-sub", "codex", "短测试助手", "Luna · 演示", "子代理"],
    ["demo-watch", "zcode", "长程训练监督", "GLM · 演示", "监督"],
    ["demo-paper", "claude", "文献与证据整理", "Claude · 演示", "研究"],
    ["demo-run", "opencode", "实验脚本与构建", null, "执行"],
  ].map(([id, harness, title, model, role]) => ({
    id,
    nativeId: id,
    harness,
    title,
    model,
    modelSource: "fixture",
    identity: null,
    parentNativeId: id === "demo-sub" ? "demo-main" : null,
    connection: "registered",
    presence: "recorded",
    workState:
      id === sup
        ? step === 1
          ? "running"
          : step === 2
            ? "needs_input"
            : "idle"
        : id === source
          ? step === 3
            ? "verifying"
            : step === 4
              ? "running"
              : step === 0
                ? "running"
                : "waiting"
          : (id === "demo-sub" && step === 0) ||
              (id === "demo-review" && step === 3) ||
              (id === "demo-run" && step === 0)
            ? "running"
            : "idle",
    role,
    lastActivityAt: now,
    activitySource: "演示事件",
    source: "demo",
    taskIds: ["demo-task"],
    capabilities: [],
    stale: false,
    animate: (step === 1 && id === sup) || (step === 4 && id === source),
    locator: null,
  }));
  const state = [
    "ready",
    "running",
    "needs_input",
    "result_reported",
    "main_continued",
  ][step];
  const goal = "比较两个表征方案，完成实验并核验结果";
  const deliveries =
    step > 0
      ? [
          {
            id: step >= 3 ? "demo-return" : "demo-handoff",
            taskId: "demo-task",
            from: step >= 3 ? sup : source,
            to: step >= 3 ? source : sup,
            kind: step >= 3 ? "return" : "task",
            state: "receiver_accepted",
            observation: step === 1 ? "running" : "completed",
            at: now,
            summary: "演示：精确运行、权限与返还路径已附在交接中。",
            seq: step,
          },
        ]
      : [];
  return {
    project: demoProject,
    demo: true,
    observedAt: now,
    revision: `demo-${step}`,
    demoStep: step,
    sessions,
    tasks: [
      {
        id: "demo-task",
        state,
        label: stages[step],
        goal,
        acceptance: ["完成对照实验", "独立核验产物", "由主会话继续"],
        source,
        target: sup,
        returnTo: source,
        readPaths: ["src/", "experiments/"],
        writePaths: ["reports/"],
        deadlineAt: null,
        updatedAt: now,
        returnState: step >= 3 ? "reported" : null,
        artifacts: [],
      },
    ],
    deliveries,
    events: stages.slice(0, step + 1).map((kind, i) => ({
      seq: i + 1,
      kind,
      subjectId: "demo-task",
      at: now,
    })),
    runs:
      step > 0
        ? [
            {
              id: "demo-lease",
              taskId: "demo-task",
              runId: "training-demo-01",
              pid: null,
              startedAt: now,
              active: step < 3,
              nextCheckAt: new Date(Date.now() + 27 * 60000).toISOString(),
              intervalSeconds: 1800,
              status: step < 3 ? "supervised" : "inactive",
            },
          ]
        : [],
    workflow: {
      goal,
      stage: stages[step],
      iteration: 2,
      status: "active",
      mode: step === 1 ? "waiting" : "active",
      owner: source,
      next: "核验结果，未通过则返回诊断",
      acceptance: [
        { id: "core", title: "核心实现与启动检查", met: true },
        { id: "experiments", title: "运行对照实验", met: step >= 3 },
        { id: "accept", title: "独立验收", met: step === 4 },
      ],
      evidence: [],
      source: "演示工作流",
    },
    warnings: [],
    source: { bridge: false, native: false },
    counts: {
      sessions: 6,
      connected: 6,
      needsAttention: [2, 3].includes(step) ? 1 : 0,
      running: state === "running" ? 1 : 0,
      verified: step === 4 ? 1 : 0,
    },
  };
}
