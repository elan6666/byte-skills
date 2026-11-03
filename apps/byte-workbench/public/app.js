import { drawAgent, drawHouse, drawMachine } from "./art.js";
import { OfficeGame } from "./office-game.js";
import { mountWorklog } from "./worklog.js";
import { matchingSessions, sessionLocation } from "./session-navigation.js";
import { mountMission } from './mission.js';
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const el = (tag, cls, value) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (value !== undefined) n.textContent = String(value);
  return n;
};
const names = {
  codex: "Codex",
  zcode: "Zcode",
  claude: "Claude",
  opencode: "OpenCode",
  dsh: "DSH",
  hermes: "Hermes",
  kimi: "Kimi",
  pi: "Pi",
};
const stateNames = {
  unknown: "状态未知",
  waiting: "等待返还",
  verifying: "等待核验",
  created: "任务已建立",
  ready: "待接手",
  accepted: "已接手记录",
  running: "执行中记录",
  needs_input: "需要输入",
  failed: "任务异常",
  result_reported: "结果待核验",
  cancel_requested: "等待取消",
  verified: "任务已核验",
  main_continued: "主会话已继续",
  cancelled: "任务已取消",
};
const connectionNames = {
  registered: "Bridge 接入登记有效",
  expired: "Bridge 登记已过期",
  inactive: "Bridge 登记已停用",
  catalog: "仅发现本地对话",
};
const transportNames = {
  prepared: "准备投递",
  sending: "投递中",
  transport_confirmed: "传输已确认",
  receiver_accepted: "接收已确认",
  uncertain: "投递结果不确定",
  failed: "投递失败",
  cancelled: "已取消",
};
const observationNames = {
  queued: "原生已排队",
  accepted: "原生已接手",
  running: "曾观察到执行",
  completed: "曾观察到完成",
  unknown: "原生状态未知",
};
const attentionStates = new Set([
  "needs_input",
  "failed",
  "result_reported",
  "cancel_requested",
]);
const workflowLabels = {
  active: "进行中",
  waiting: "等待",
  recorded: "保存的协调记录",
  accepted: "已验收记录",
  completed: "完成记录",
  blocked: "受阻",
  training_wait: "训练等待",
  diagnosis: "诊断",
  research: "研究",
  planning: "规划",
  build: "构建",
  review: "评审",
  idle: "空闲",
};
const workflowLabel = (value) => workflowLabels[value] || value;
const eventNames = {
  task_created: "任务建立",
  task_ready: "任务就绪",
  task_accepted: "任务接手",
  task_running: "开始执行",
  task_result_reported: "结果回报",
  result_reported: "结果回报",
  task_verified: "独立核验",
  verification_pending_native_evidence: "等待原生核验证据",
  task_failed: "任务异常",
  task_needs_input: "等待输入",
  delivery_prepared: "准备交接",
  delivery_intent: "交接意图登记",
  delivery_outcome: "交接结果登记",
  request_completed: "请求处理记录",
  delivery_updated: "交接状态更新",
  return_created: "返还登记",
  return_verified: "返还核验",
  main_continued: "主会话继续",
  binding_registered: "会话接入登记",
  supervision_registered: "监督登记",
  supervision_stopped: "监督已停止",
};
let projects = [],
  snapshot = null,
  selected = null,
  source = null,
  selectionVersion = 0,
  filter = "all",
  deskQuery = "",
  selectedDesk = null,
  panel = "goal",
  expanded = new Map(),
  seen = new Map(),
  floor = 0,
  demoAuto = true,
  demoDeadline = 0,
  demoBusy = false,
  timer;
let reduced =
  localStorage.getItem("byte-office-reduced") === "true" ||
  (localStorage.getItem("byte-office-reduced") === null &&
    matchMedia("(prefers-reduced-motion: reduce)").matches);
const time = (s) =>
  s
    ? new Date(s).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未记录";
const short = (s) => (s ? String(s).slice(0, 12) : "未记录");
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => $("#toast").classList.remove("show"), 3000);
}
async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json();
  if (!res.ok) throw Error(body.error || "读取失败");
  return body;
}
function streamState(text, good = false) {
  $("#stream").textContent = "";
  $("#stream").append(el("i"), document.createTextNode(text));
  $("#stream").classList.toggle("live", good);
}
function button(label, cls, fn) {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}
function note(message) {
  return el("p", "notice", message);
}
function section(title, ...children) {
  const s = el("section", "detail-section");
  s.append(el("h3", "", title), ...children);
  return s;
}
function pair(label, value) {
  const row = el("div");
  row.append(el("dt", "", label), el("dd", "", value ?? "未记录"));
  return row;
}
function facts(values) {
  const d = el("dl");
  for (const [k, v] of values)
    d.append(el("dt", "", k), el("dd", "", v ?? "未记录"));
  return d;
}
function portrait(s, size = 86) {
  const c = el("canvas");
  c.width = size;
  c.height = size;
  c.setAttribute("aria-hidden", "true");
  drawAgent(c, s);
  return c;
}
function displayState(s) {
  if (s.connection === "catalog") return "状态未知";
  if (s.connection === "expired" || s.connection === "inactive")
    return "接入已失效";
  return stateNames[s.workState] || s.workState;
}
function isAttention(s) {
  return snapshot.tasks.some(
    (t) => s.taskIds?.includes(t.id) && attentionStates.has(t.state),
  );
}
function showInspector() {
  const node = $("#inspector");
  node.classList.remove("closed");
}
function loadProjects() {
  return api("/api/projects").then((data) => {
    projects = data.projects;
    $("#project-count").textContent = projects.length;
    renderProjects();
    return data;
  });
}
function renderProjects() {
  const list = $("#projects"),
    q = $("#project-search").value.trim().toLowerCase();
  list.replaceChildren();
  for (const p of projects.filter((p) =>
    (p.name + " " + p.root).toLowerCase().includes(q),
  )) {
    const b = button(
      "",
      "project" + (selected === p.id ? " selected" : ""),
      () => selectProject(p.id),
    );
    b.title = p.root;
    b.setAttribute("aria-label", p.name);
    b.append(el("span", "project-icon", p.bridge ? "▦" : "⌂"));
    const copy = el("span", "project-copy");
    copy.append(
      el("strong", "", p.name),
      el(
        "small",
        "",
        p.source === "demo"
          ? "示例项目"
          : p.bridge
            ? "Bridge · " + (p.count ? p.count + " 个目录会话" : "协作记录")
            : p.count
              ? p.count + " 个目录会话"
              : "本地项目目录",
      ),
    );
    b.append(copy);
    if (p.workflow) b.append(el("i", "project-mark"));
    list.append(b);
  }
  if (!list.children.length)
    list.append(el("p", "empty-nav", "没有匹配的项目"));
}
async function selectProject(id) {
  const version = ++selectionVersion;
  worklog.clear();
  source?.close();
  source = null;
  selected = id;
  snapshot = null;
  selectedDesk = null;
  panel = "goal";
  filter = "all";
  deskQuery = "";
  expanded = new Map();
  seen = new Map();
  floor = 0;
  demoAuto = true;
  demoDeadline = performance.now() + 22000;
  search.value = "";
  $("#inspector").classList.add("closed");
  streamState("正在读取");
  $("#crumb").textContent = "读取项目…";
  renderProjects();
  try {
    const data = await api("/api/snapshot?project=" + encodeURIComponent(id));
    if (version !== selectionVersion) return;
    applySnapshot(data);
    const url = new URL(location);
    url.searchParams.set("project", id);
    history.replaceState(null, "", url);
    source = new EventSource("/api/events?project=" + encodeURIComponent(id));
    source.addEventListener("snapshot", (e) => {
      if (version !== selectionVersion) return;
      applySnapshot(JSON.parse(e.data));
      streamState(data.demo ? "示例连接" : "本地状态已同步", true);
    });
    source.addEventListener("unavailable", () => {
      streamState("来源暂不可读");
      $("#warnings").replaceChildren(
        note("来源暂不可读；下方保留上次快照，不表示当前状态。"),
      );
    });
    source.onerror = () => {
      if (version === selectionVersion) streamState("连接断开 · 重连中");
    };
  } catch (e) {
    if (version !== selectionVersion) return;
    streamState("读取失败");
    toast(e.message);
    $("#crumb").textContent = "项目读取失败";
    $("#office").hidden = true;
    $("#welcome").hidden = false;
  }
}
function applySnapshot(data) {
  const first = !snapshot;
  const priorStep = snapshot?.demoStep;
  snapshot = data;
  mission.update(data);
  worklog.update(data);
  if (data.demo && (first || priorStep !== data.demoStep))
    demoDeadline = performance.now() + 22000;
  $("#demo-play").textContent = demoAuto ? "Ⅱ 暂停剧情" : "▶ 自动剧情";
  $("#welcome").hidden = true;
  $("#office").hidden = false;
  $("#crumb").textContent = data.project.name;
  $("#office-name").textContent = data.project.name;
  $("#project-root").textContent = data.project.root;
  $("#copy-root").hidden = data.demo;
  $("#demo-banner").hidden = !data.demo;
  $("#clock").textContent = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  $("#updated").textContent = "快照 " + time(data.observedAt);
  $("#warnings").replaceChildren(...data.warnings.map(note));
  const w = data.workflow;
  $("#goal").textContent = w?.goal || "尚未登记项目工作流";
  $("#stage").textContent = w
    ? [
        workflowLabel(w.stage),
        w.iteration != null ? "第 " + w.iteration + " 轮" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "先看会话与协作记录，不推断总体完成度";
  $("#session-count").textContent = data.counts.sessions;
  $("#connected-count").textContent = data.counts.connected + " 个有效接入 · " + (data.counts.discovered ?? data.counts.sessions) + " 个可登记会话";
  $("#attention-count").textContent = data.counts.needsAttention;
  $("#verified-count").textContent = data.tasks.length
    ? `${data.counts.verified} / ${data.tasks.length}`
    : "—";
  $("#verified-caption").textContent = "已核验任务 / 已登记任务";
  renderRooms();
  renderRuns();
  renderEvents();
  renderDetails();
  streamState(data.demo ? "示例连接" : "本地状态已同步", true);
}
function renderRooms() {
  if (!snapshot) return;
  $$("[data-filter]").forEach((b) =>
    b.classList.toggle("active", b.dataset.filter === filter),
  );
  const harnesses = [
    ...new Set([
      "codex",
      "zcode",
      "claude",
      "opencode",
      ...snapshot.sessions.map((s) => s.harness),
    ]),
  ];
  const maxFloor = Math.ceil(harnesses.length / 4);
  floor = Math.min(floor, maxFloor - 1);
  const zones = harnesses.slice(floor * 4, floor * 4 + 4);
  const visible = [];
  const pages = $("#room-pages");
  pages.replaceChildren();
  for (const h of zones) {
    const group = matchingSessions(snapshot.sessions, {harness:h,filter,query:deskQuery,attention:isAttention});
    const page = Math.min(
      expanded.get(h) || 0,
      Math.max(0, Math.ceil(group.length / 6) - 1),
    );
    visible.push(...group.slice(page * 6, page * 6 + 6));
    if (group.length > 6) {
      const control = button(
        `${names[h] || h} ${page + 1}/${Math.ceil(group.length / 6)} 页 ↻`,
        "room-page",
        () => {
          expanded.set(h, (page + 1) % Math.ceil(group.length / 6));
          renderRooms();
        },
      );
      control.title = "每个分区显示六位伙伴；点击换一组";
      pages.append(control);
    }
  }
  $("#floor-label").textContent =
    `${floor + 1}F · ${zones.map((h) => names[h] || h).join(" / ")}`;
  $("#floor-prev").disabled = floor === 0;
  $("#floor-next").disabled = floor === maxFloor - 1;
  $("#scene-count").textContent =
    `当前显示 ${visible.length} / ${snapshot.sessions.length} 个对话 · 完整名册可定位所有对话`;
  const roster = $("#all-sessions");
  roster.replaceChildren();
  const matches = matchingSessions(snapshot.sessions,{filter,query:deskQuery,attention:isAttention});
  $("#roster-count").textContent = `${matches.length} / ${snapshot.sessions.length}`;
  for (const s of matches) {
    const entry = button(`${s.title} · ${names[s.harness] || s.harness}${s.parentNativeId ? ' · 子代理' : ''}`, 'roster-entry', () => {
      const where = sessionLocation(snapshot.sessions,harnesses,s.id);
      if (!where) return;
      filter='all'; deskQuery=''; search.value='';
      floor=where.floor; expanded.set(where.harness,where.page);
      selectedDesk=s.id; panel='session';
      renderRooms(); showInspector(); renderDetails();
      $("#rooms").scrollIntoView({behavior:'smooth',block:'center'});
    });
    entry.dataset.nativeId=s.nativeId;
    roster.append(entry);
  }
  if (!matches.length) roster.append(note('当前筛选没有匹配对话；清空搜索或切换到所有工位。'));
  game.sync(snapshot, {
    harnesses: zones,
    sessions: visible,
    filter,
    query: deskQuery,
  });
  game.selected = selectedDesk;
  game.setPaused(reduced);
  $("#scene-caption").textContent = snapshot.demo
    ? [
        "主会话开始设计；短测试助手正在忙，其余伙伴自由活动。",
        "监督伙伴接手长任务；主会话可以休息一下。",
        "出现需要处理的问题，伙伴举起了求助标记。",
        "成果送回，主会话和评审伙伴开始核对。",
        "这一轮核验通过，主会话继续推进下一步。",
      ][snapshot.demoStep]
    : "人物根据登记状态演绎；「?」代表当前状态未知。";
}
function renderRuns() {
  const list = $("#runs");
  list.replaceChildren();
  if (!snapshot.runs.length) {
    list.append(
      el(
        "p",
        "empty-section",
        "还没有监督运行记录。长任务接入 Byte 监督流程后，设备会出现在这里。",
      ),
    );
    return;
  }
  for (const run of snapshot.runs) {
    const row = el("div", "run"),
      c = el("canvas");
    c.width = 60;
    c.height = 60;
    drawMachine(c, run.active);
    const info = el("div", "run-info");
    info.append(
      el("strong", "", run.runId || run.id),
      el(
        "span",
        "",
        `${run.active ? "监督配置已启用" : "该轮监督已停用"} · ${run.pid ? "记录 PID " + run.pid : "未提供进程观测"}`,
      ),
    );
    const right = el("div", "timer");
    right.append(
      el(
        "strong",
        "",
        run.active
          ? run.intervalSeconds
            ? Math.round(run.intervalSeconds / 60) + " 分钟巡检"
            : "监督已登记"
          : "已收尾",
      ),
      el(
        "small",
        "",
        run.active ? "计划检查 " + time(run.nextCheckAt) : "保留运行记录",
      ),
    );
    row.append(c, info, right);
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "查看运行 " + run.runId);
    const open = () => {
      panel = "run";
      selectedDesk = run.id;
      showInspector();
      renderDetails();
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    list.append(row);
  }
}
function renderEvents() {
  const list = $("#events");
  list.replaceChildren();
  const entries = [
    ...snapshot.events.slice(-18).map((e) => ({
      key: "event-" + e.seq,
      at: e.at,
      title: eventNames[e.kind] || e.kind,
      detail: "事件 #" + e.seq + " · " + short(e.subjectId),
    })),
    ...snapshot.deliveries.slice(0, 12).map((d) => ({
      key: d.id,
      at: d.at,
      title: transportNames[d.state] || d.state,
      detail:
        (names[snapshot.sessions.find((s) => s.id === d.from)?.harness] ||
          "来源") +
        " → " +
        (names[snapshot.sessions.find((s) => s.id === d.to)?.harness] ||
          "目标") +
        " · " +
        (observationNames[d.observation] || "执行状态另行核验"),
      delivery: d,
    })),
  ]
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .slice(0, 20);
  $("#event-caption").textContent = snapshot.demo
    ? "演示事件"
    : snapshot.source.bridge
      ? "最近的登记事件 · 非完整历史"
      : "等待 Bridge 接入";
  if (!entries.length) {
    list.append(
      el("p", "empty-section", "这里会留下交接、接收、结果和核验的足迹。"),
    );
    return;
  }
  for (const e of entries) {
    const row = el("div", "event");
    row.append(el("time", "", time(e.at)), el("i"));
    const content = el("div");
    content.append(el("strong", "", e.title), el("small", "", e.detail));
    row.append(content);
    if (e.delivery) {
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.addEventListener("click", () => {
        selectedDesk = e.delivery.id;
        panel = "delivery";
        showInspector();
        renderDetails();
      });
      row.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") row.click();
      });
    }
    list.append(row);
  }
}
function renderDetails() {
  if (!snapshot) return;
  const d = $("#detail");
  d.replaceChildren();
  d.className = "detail-content";
  if (panel === "session") {
    const s = snapshot.sessions.find((x) => x.id === selectedDesk);
    if (!s) {
      panel = "goal";
      return renderDetails();
    }
    const heading = el("div", "detail-portrait");
    heading.append(
      portrait(s, 62),
      el("div", "", names[s.harness] || s.harness),
    );
    d.append(
      heading,
      el("h2", "", s.title),
      el(
        "span",
        "pill" + (s.connection === "registered" ? " green" : ""),
        connectionNames[s.connection] || s.connection,
      ),
    );
    d.append(
      section(
        "当前记录",
        facts([
          ["角色", s.role],
          ["任务状态", displayState(s)],
          ["模型", s.model || "客户端未提供"],
          ["最近目录／事件", time(s.lastActivityAt)],
          ["时间来源", s.activitySource || "未记录"],
        ]),
      ),
    );
    if (s.connection === "catalog")
      d.append(
        note(
          "这里只读取到了对话目录，无法确认当前是否在思考、调用工具或等待。接入 Bridge 后可关联任务。",
        ),
      );
    else
      d.append(
        note(
          "人物的走动、休息和交接是本地场景演绎。任务状态和来源时间以下方记录为准；接入登记并非在线探测。",
        ),
      );
    if (s.stale && s.lastActivityAt)
      d.append(note("最近记录超过两分钟，当前运行情况未确认。"));
    if (s.nativeObservation)
      d.append(
        section(
          "原生观察",
          el(
            "p",
            "",
            observationNames[s.nativeObservation] || s.nativeObservation,
          ),
        ),
      );
    if (s.parentNativeId)
      d.append(
        section("子代理关系", el("p", "mono", "父会话 " + s.parentNativeId)),
      );
    const linkSection = section("原对话与身份", el("p", "mono", s.nativeId));
    if (s.locator) {
      const a = el("a", "primary", "在 Codex 中打开 ↗");
      a.href = s.locator;
      linkSection.append(a);
      linkSection.append(
        el(
          "p",
          "small",
          "需要客户端支持 codex:// 对话链接。无法跳转时可复制下方 ID 查找。",
        ),
      );
    } else
      linkSection.append(
        el(
          "p",
          "small",
          "客户端未提供可验证的对话链接。可复制会话 ID 到对应客户端查找。",
        ),
      );
    linkSection.append(
      button("复制会话 ID", "text-btn", () => copy(s.nativeId)),
    );
    if (s.identity)
      linkSection.append(
        facts([
          ["主机", s.identity.host_id],
          ["项目 ID", s.identity.project_id],
          ["运行代次", short(s.identity.runtime_generation)],
          ["登记到期", time(s.expiresAt)],
        ]),
      );
    d.append(linkSection);
    for (const t of snapshot.tasks.filter((t) => s.taskIds.includes(t.id)))
      d.append(taskCard(t));
    if (!s.taskIds.length) d.append(note("未关联已登记的 Bridge 任务。"));
    return;
  }
  if (panel === "attention") {
    d.append(el("h2", "", "需要关注"));
    const tasks = snapshot.tasks.filter((t) => attentionStates.has(t.state));
    d.append(note("只列出登记任务中的异常、等待输入、取消确认与结果待核验。"));
    tasks.forEach((t) => d.append(taskCard(t)));
    if (!tasks.length) d.append(el("p", "", "目前没有登记的待处理项。"));
    return;
  }
  if (panel === "run") {
    const r = snapshot.runs.find((x) => x.id === selectedDesk);
    if (!r) {
      panel = "goal";
      return renderDetails();
    }
    d.append(
      el("div", "eyebrow", "EXPERIMENT CORNER"),
      el("h2", "", r.runId),
      note("这里展示监督登记，不探测服务器进程，也不代替现有监督器执行巡检。"),
    );
    d.append(
      facts([
        ["监督配置", r.active ? "已启用" : "已停用"],
        ["巡检间隔", r.intervalSeconds ? r.intervalSeconds + " 秒" : "未记录"],
        ["计划检查时间", time(r.nextCheckAt)],
        ["记录启动时间", time(r.startedAt)],
        ["记录 PID", r.pid || "未提供"],
        ["源码提交", r.sourceCommit || "未记录"],
        ["配置摘要", r.configSha256 || "未记录"],
      ]),
    );
    const t = snapshot.tasks.find((x) => x.id === r.taskId);
    if (t) d.append(taskCard(t));
    return;
  }
  if (panel === "delivery") {
    const m = snapshot.deliveries.find((x) => x.id === selectedDesk);
    if (!m) {
      panel = "goal";
      return renderDetails();
    }
    d.append(
      el("div", "eyebrow", "HANDOFF RECEIPT"),
      el("h2", "", "一次协作交接"),
      facts([
        ["传输状态", transportNames[m.state] || m.state],
        ["原生执行观察", observationNames[m.observation] || "未提供"],
        ["登记时间", time(m.at)],
        ["消息 ID", m.id],
      ]),
      note(
        "传输确认、接收确认、执行、产物核验是不同步骤。消息到达不会自动算作任务完成。",
      ),
    );
    if (m.reason) d.append(section("记录原因", el("p", "", m.reason)));
    if (m.summary)
      d.append(
        section(
          "消息摘要 · 外部 Agent 数据",
          el("p", "detail-message", m.summary),
        ),
      );
    const t = snapshot.tasks.find((x) => x.id === m.taskId);
    if (t) d.append(taskCard(t));
    return;
  }
  const w = snapshot.workflow;
  d.append(
    el("div", "eyebrow", "PROJECT NOTICEBOARD"),
    el("h2", "", w?.goal || "项目公告板"),
  );
  if (!w) {
    d.append(
      note(
        "该目录尚未登记 Byte 工作流。会话目录和 Bridge 任务仍可查看；不会从消息数量推算总体进度。",
      ),
    );
  } else {
    d.append(
      facts([
        ["当前步骤", workflowLabel(w.stage) || "未记录"],
        ["循环轮次", w.iteration ?? "未记录"],
        ["工作流状态", workflowLabel(w.status)],
        ["执行模式", workflowLabel(w.mode) || "未记录"],
        ["记录更新时间", time(w.updatedAt)],
      ]),
    );
    if (w.acceptance.length) {
      const checks = section("工作流验收记录");
      const met = w.acceptance.filter((x) => x.met).length;
      checks.append(
        el(
          "p",
          "small",
          `${met} / ${w.acceptance.length} 项登记为满足 · 不是整体进度百分比`,
        ),
      );
      for (const a of w.acceptance) {
        const row = el("div", "check-item");
        row.append(
          el("span", "check" + (a.met ? " checked" : ""), a.met ? "✓" : "·"),
          el("span", "", a.title),
        );
        checks.append(row);
      }
      d.append(checks);
    }
    if (w.next) d.append(section("下一步", el("p", "", w.next)));
    d.append(
      note(
        "公告板反映保存的工作流。是否达标由原工作流的独立验收决定，工作台不会自行推进循环。",
      ),
    );
    d.append(section("数据来源", el("p", "mono", w.source)));
  }
  d.append(
    section(
      "如何阅读办公室",
      el(
        "p",
        "",
        "一个人物对应一个对话。伙伴会按登记状态工作或休息；新交接让双方走到协作长桌碰面。首次载入的历史记录不会重新触发交接。",
      ),
      el(
        "p",
        "",
        "角色、模型与状态使用来源记录。未接入或未提供的信息明确显示未知。",
      ),
    ),
  );
  if (snapshot.tasks.length)
    d.append(section("最近任务", ...snapshot.tasks.slice(0, 5).map(taskCard)));
}
function taskCard(t) {
  const card = el("article", "task-card");
  card.append(
    el("span", "task-state", t.label || t.state),
    el("h3", "", t.goal),
    el("p", "mono", short(t.id)),
  );
  if (t.acceptance?.length) {
    const list = el("ul");
    t.acceptance.forEach((a) => list.append(el("li", "", a)));
    card.append(list);
  }
  if (t.returnState)
    card.append(el("p", "small", "返还记录：" + t.returnState));
  if (t.artifacts?.length) {
    const list = el("div", "artifact-links");
    t.artifacts.forEach((a, i) => {
      const link = el("a", "", a.path + " ↗");
      link.href =
        "/api/artifact?" +
        new URLSearchParams({ project: selected, task: t.id, index: i });
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = "读取时校验 SHA-256：" + a.sha256;
      list.append(link);
    });
    card.append(list);
  }
  return card;
}
async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    toast("已复制");
  } catch {
    toast("复制不可用，可在详情中选择文字。");
  }
}
$("#project-search").addEventListener("input", renderProjects);
$("#demo").onclick = $("#welcome-demo").onclick = () =>
  selectProject("demo-office");
$("#goal-board").onclick = () => {
  panel = "goal";
  selectedDesk = null;
  showInspector();
  renderRooms();
  renderDetails();
};
$("#attention-stat").onclick = () => {
  panel = "attention";
  filter = "attention";
  showInspector();
  renderRooms();
  renderDetails();
};
$$("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      renderRooms();
    }),
);
$("#close-inspector").onclick = () => $("#inspector").classList.add("closed");
$("#copy-root").onclick = () => copy(snapshot.project.root);
$("#refresh").onclick = async () => {
  try {
    await loadProjects();
    if (selected) {
      const version = selectionVersion,
        data = await api(
          "/api/snapshot?project=" + encodeURIComponent(selected),
        );
      if (version === selectionVersion) applySnapshot(data);
    }
    toast("已重新读取");
  } catch (e) {
    toast(e.message);
    streamState("刷新失败");
  }
};
async function advanceDemo(manual = false) {
  if (!snapshot?.demo || demoBusy) return;
  if (manual) demoAuto = false;
  demoBusy = true;
  try {
    const data = await api("/api/demo/next", { method: "POST" });
    if (snapshot?.demo) applySnapshot(data);
  } catch (e) {
    toast(e.message);
  } finally {
    demoBusy = false;
  }
}
$("#demo-next").onclick = () => advanceDemo(true);
$("#demo-play").onclick = () => {
  demoAuto = !demoAuto;
  demoDeadline = performance.now() + 22000;
  $("#demo-play").textContent = demoAuto ? "Ⅱ 暂停剧情" : "▶ 自动剧情";
};
function setMotion() {
  document.body.classList.toggle("reduced", reduced);
  $("#sound").setAttribute("aria-pressed", String(!reduced));
  $("#sound").textContent = reduced ? "▶ 继续生活" : "Ⅱ 暂停动作";
  game.setPaused(reduced);
}
$("#sound").onclick = () => {
  reduced = !reduced;
  localStorage.setItem("byte-office-reduced", String(reduced));
  setMotion();
};
$("#add-project").onclick = () => {
  $("#form-error").textContent = "";
  $("#project-dialog").showModal();
};
$("#cancel-dialog").onclick = () => $("#project-dialog").close();
$("#project-form").onsubmit = async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.currentTarget));
  try {
    const p = await api("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    $("#project-dialog").close();
    await loadProjects();
    await selectProject(p.id);
  } catch (err) {
    $("#form-error").textContent = err.message;
  }
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("#inspector").classList.add("closed");
});
const mission=mountMission({root:$('#mission-root'),api,onSnapshot:applySnapshot,toast,onSession:id=>{selectedDesk=id;panel='session';showInspector();renderDetails();},onView:view=>{
  for(const selector of ['.game-shell','.behavior-key','#roster-panel','.room-toolbar'])$(selector).hidden=view==='tech';
}});
$('#todo-root').append($('#mission-todos'));
const worklog = mountWorklog({api, element: $("#worklog-root"), toast});
$("#tasks-toggle").onclick = () => worklog.open('tasks');
$("#recall-toggle").onclick = () => worklog.open('memory');
const search = el("input", "desk-search");
search.placeholder = "⌕ 查找对话";
search.setAttribute("aria-label", "查找项目对话");
search.addEventListener("input", () => {
  deskQuery = search.value;
  if (deskQuery.trim()) $("#roster-panel").open = true;
  renderRooms();
});
$(".room-toolbar").append(search);
drawHouse($("#welcome-house"));
const game = new OfficeGame($("#rooms"), {
  onSelect: (id) => {
    selectedDesk = id;
    panel = "session";
    showInspector();
    renderDetails();
  },
  onBoard: () => $("#goal-board").click(),
  onEvent: (e) => {
    $("#scene-caption").textContent = e.message;
  },
});
window.byteOfficeScene = Object.freeze({ getState: () => game.debug() });
$("#zoom-in").onclick = () => game.zoom(0.2);
$("#zoom-out").onclick = () => game.zoom(-0.2);
$("#fit-scene").onclick = () => game.fit();
$("#names-toggle").onclick = () => {
  game.showNames = !game.showNames;
  $("#names-toggle").setAttribute("aria-pressed", String(game.showNames));
  game.paint();
};
$("#roster-toggle").onclick = () => {
  $("#roster-panel").open = !$("#roster-panel").open;
  if ($("#roster-panel").open) $("#roster-panel").scrollIntoView({behavior:'smooth',block:'start'});
};
$("#floor-prev").onclick = () => {
  floor--;
  renderRooms();
};
$("#floor-next").onclick = () => {
  floor++;
  renderRooms();
};
$("#scene-speed").onclick = () => {
  game.setSpeed(game.speed === 1 ? 2 : 1);
  $("#scene-speed").textContent = game.speed + "× 生活";
};
$("#fullscreen").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $(".game-shell").requestFullscreen?.();
};
$("#runs-toggle").onclick = () => {
  $("#equipment-panel").open = !$("#equipment-panel").open;
  if ($("#equipment-panel").open)
    $("#equipment-panel").scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "nearest",
    });
};
$("#events-toggle").onclick = () => {
  $("#activity-panel").open = !$("#activity-panel").open;
  if ($("#activity-panel").open)
    $("#activity-panel").scrollIntoView({
      behavior: reduced ? "instant" : "smooth",
      block: "nearest",
    });
};
setMotion();
setInterval(() => {
  if (
    snapshot?.demo &&
    demoAuto &&
    !reduced &&
    !document.hidden &&
    performance.now() > demoDeadline
  )
    advanceDemo();
}, 1000);
loadProjects()
  .then(() => {
    const id = new URL(location).searchParams.get("project");
    if (id) selectProject(id);
  })
  .catch((e) => {
    streamState("无法连接本地服务");
    toast(e.message);
  });
