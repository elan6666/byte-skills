import { createNeuralSwarmView } from "./neural-swarm.js";

const views = {
  graph: ["✦", "作战网"],
  overview: ["▦", "总览"],
  board: ["▤", "任务看板"],
  members: ["◎", "成员"],
  office: ["▧", "像素办公室"],
};
const lanes = [
  ["todo", "待办", "·"],
  ["active", "进行中", "↗"],
  ["attention", "需要关注", "!"],
  ["done", "已归档", "✓"],
];
const planStates = {
  todo: ["todo", "待办"],
  in_progress: ["active", "进行中"],
  blocked: ["attention", "受阻"],
  review: ["attention", "待核验"],
  done: ["done", "已登记完成"],
};
const bridgeStates = {
  created: ["todo", "已建立"],
  ready: ["todo", "待接手"],
  accepted: ["active", "已接手"],
  running: ["active", "执行中记录"],
  needs_input: ["attention", "需要输入"],
  failed: ["attention", "任务异常"],
  result_reported: ["attention", "结果待核验"],
  cancel_requested: ["attention", "等待取消"],
  verified: ["done", "已核验"],
  main_continued: ["done", "主会话已继续"],
  cancelled: ["done", "已取消"],
};
const sessionKey = (s) => s.harness + ":" + s.nativeId;
const node = (tag, cls, text) => {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (text != null) item.textContent = text;
  return item;
};
const button = (text, action, cls = "wb-action") => {
  const item = node("button", cls, text);
  item.type = "button";
  item.onclick = action;
  return item;
};
const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
  : "";
const empty = (text) => node("p", "wb-empty", text);

function projectData(snapshot) {
  const board = snapshot.board ?? { items: [], collaborations: [] };
  const byKey = new Map();
  for (const s of snapshot.sessions) {
    const key = sessionKey(s);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(s);
  }
  const idsFor = (reference) => (byKey.get(sessionKey(reference)) ?? []).filter((s) =>
    (!reference.hostId || s.identity?.host_id === reference.hostId) &&
    (!reference.profileId || s.identity?.profile_id === reference.profileId)
  ).map((s) => s.id);
  const members = new Map(snapshot.sessions.map((s) => [s.id, { ...s, roles: new Set() }]));
  const owner = members.get(snapshot.workflow?.owner);
  const ownerCandidates = byKey.get(snapshot.workflow?.owner) ?? [];
  const lead = owner ?? (ownerCandidates.length === 1 ? ownerCandidates[0] : null);
  if (lead) members.get(lead.id).roles.add("项目负责人");
  const agents = new Map((board.agents ?? []).filter((a) => a.session).map((a) => [a.id, a.session]));
  const plans = board.items.map((plan) => {
    const assigned = agents.get(plan.agentId);
    const ids = plan.participants.flatMap(idsFor);
    if (assigned) ids.push(...idsFor(assigned));
    const [lane, status] = planStates[plan.status];
    return { id: plan.id, kind: "plan", title: plan.title, note: plan.objective,
      acceptance: plan.acceptance, ids: [...new Set(ids)], lane, status, bridgeId: plan.bridgeTaskId };
  });
  const bridge = snapshot.tasks.map((task) => {
    const [lane, status] = bridgeStates[task.state] ?? ["todo", task.label || task.state];
    return { id: task.id, kind: "bridge", title: task.goal, ids: [task.source, task.target], lane, status,
      acceptance: task.acceptance ?? [], at: task.updatedAt, owner: task.target };
  });
  const bridgeById = new Map(bridge.map((task) => [task.id, task]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const linked = new Set();
  const threads = board.collaborations.map((group) => {
    const ids = group.members.flatMap((s) => {
      const matching = idsFor(s);
      for (const id of matching) members.get(id).roles.add(s.role);
      return matching;
    });
    const items = group.taskIds.map((id) => planById.get(id)).filter(Boolean);
    const bridgeIds = new Set([...group.bridgeTaskIds, ...items.map((item) => item.bridgeId)]);
    for (const id of bridgeIds) {
      const task = bridgeById.get(id);
      if (task) {
        linked.add(id);
        items.push(task);
      }
    }
    return { id: "plan:" + group.id, title: group.title, ids, items, planned: true };
  });
  const bySource = new Map();
  for (const task of bridge.filter((task) => !linked.has(task.id))) {
    const source = task.ids[0];
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(task);
  }
  for (const [source, items] of bySource) {
    threads.push({
      id: "bridge:" + source,
      title: members.get(source)?.title ?? "Bridge 交接",
      ids: [...new Set(items.flatMap((task) => task.ids))],
      items,
      planned: false,
    });
  }
  const links = [];
  for (const s of members.values()) {
    if (!s.parentNativeId) continue;
    const parents = byKey.get(sessionKey({ harness: s.harness, nativeId: s.parentNativeId })) ?? [];
    if (parents.length === 1) links.push({ from: parents[0].id, to: s.id, label: "父子会话", kind: "child" });
  }
  const records = [...bridge, ...plans];
  const counts = new Map();
  for (const record of records) {
    for (const id of new Set(record.ids)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { members, bridge, threads, records, links, counts, leadId: lead?.id };
}

export function mountCollaboration({ root, panels, onView, onMember, onRecord, onGoal, onRegister, onTimeline, onHistory, formatEvent, workflowLabel, memberStatus }) {
  let snapshot, data, current = "graph", member = "", query = "", source = "all";
  const neuralSwarm = createNeuralSwarmView(panels.graph);
  let expanded = new Map();
  const bar = node("div", "wb-viewbar");
  const tabs = node("div", "wb-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "项目视图");
  const tabButtons = new Map();
  for (const [id, [glyph, label]] of Object.entries(views)) {
    const tab = button("", () => view(id), "wb-tab");
    tab.id = "wb-tab-" + id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panels[id].id);
    const icon = node("span", "wb-nav-icon", glyph);
    icon.setAttribute("aria-hidden", "true");
    tab.append(icon, node("span", "", label), node("small", "wb-count"));
    panels[id].setAttribute("role", "tabpanel");
    panels[id].setAttribute("aria-labelledby", tab.id);
    tabButtons.set(id, tab);
    tabs.append(tab);
  }
  tabs.addEventListener("keydown", (event) => {
    const ids = [...tabButtons.keys()];
    const moves = { ArrowLeft: -1, ArrowRight: 1, Home: -ids.length, End: ids.length };
    const offset = moves[event.key];
    if (!offset || !tabs.contains(document.activeElement)) return;
    event.preventDefault();
    const index = offset === -ids.length ? 0 : offset === ids.length ? ids.length - 1
      : (ids.indexOf(current) + offset + ids.length) % ids.length;
    view(ids[index]);
    tabButtons.get(current).focus();
  });
  const register = button("＋ 登记会话", onRegister, "wb-action wb-register");
  bar.append(tabs, register);
  root.append(bar);

  const filters = node("div", "wb-filters");
  const memberSelect = node("select");
  memberSelect.setAttribute("aria-label", "按成员筛选");
  memberSelect.onchange = () => {
    member = memberSelect.value;
    renderView();
  };
  filters.append(memberSelect);
  root.append(filters);

  const boardTools = node("div", "wb-board-tools");
  const search = node("input");
  search.type = "search";
  search.placeholder = "搜索任务、目标、验收条件";
  search.setAttribute("aria-label", "搜索看板");
  search.oninput = () => { query = search.value.trim().toLowerCase(); renderBoard(); };
  const sourceSelect = node("select");
  sourceSelect.setAttribute("aria-label", "任务来源");
  for (const [id, label] of [["all", "全部来源"], ["plan", "任务方案"], ["bridge", "Bridge 记录"]]) {
    const option = node("option", "", label);
    option.value = id;
    sourceSelect.append(option);
  }
  sourceSelect.onchange = () => { source = sourceSelect.value; renderBoard(); };
  boardTools.append(search, sourceSelect, button("任务历史", onHistory));
  const lanesRoot = node("div", "wb-lanes");
  panels.board.prepend(boardTools, lanesRoot);

  function view(id, notify = true) {
    current = Object.hasOwn(views, id) ? id : "overview";
    for (const [key, tab] of tabButtons) {
      const selected = key === current;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[key].hidden = !selected;
    }
    filters.hidden = current === "office" || !data?.members.size;
    if (data) renderView();
    if (notify) onView(current);
  }

  function filterMember(id) {
    member = member === id ? "" : id;
    memberSelect.value = member;
    renderView();
    memberSelect.focus();
  }

  function displayTitle(s) {
    const prefix = snapshot.project.name;
    for (const separator of ["｜", " | "]) {
      if (s.title.startsWith(prefix + separator)) return s.title.slice(prefix.length + separator.length);
    }
    return s.title;
  }

  function avatar(s) {
    const stamp = node("span", "wb-avatar", [...displayTitle(s).trim()][0]?.toUpperCase() || "·");
    stamp.dataset.hue = String([...s.id].reduce((sum, letter) => sum + letter.codePointAt(0), 0) % 4);
    stamp.setAttribute("aria-hidden", "true");
    return stamp;
  }

  function row(record) {
    const item = button("", () => onRecord(record), "wb-record");
    const icon = node("span", "wb-signal", lanes.find(([id]) => id === record.lane)[2]);
    icon.dataset.state = record.lane;
    icon.setAttribute("aria-hidden", "true");
    const label = node("span", "wb-row-label");
    label.append(node("strong", "", record.title));
    const owner = data.members.get(record.owner ?? record.ids[0]);
    const kind = record.kind === "plan" ? "任务方案" : "Bridge 记录";
    label.append(node("small", "", [kind, owner?.title, formatTime(record.at)].filter(Boolean).join(" · ")));
    const status = node("span", "wb-status", record.status);
    status.dataset.state = record.lane;
    const arrow = node("span", "wb-arrow", "›");
    arrow.setAttribute("aria-hidden", "true");
    item.append(icon, label, status, arrow);
    return item;
  }

  function panel(title, action) {
    const element = node("section", "wb-panel");
    const head = node("div", "wb-panel-head");
    head.append(node("h2", "", title));
    if (action) head.append(action);
    element.append(head);
    return element;
  }

  function memberCard(s, detailed = false) {
    const element = node("article", "wb-member");
    const profile = button("", () => onMember(s.id), "wb-profile");
    const meta = node("span", "wb-row-label");
    const roles = s.roles.size ? [...s.roles] : [s.role !== "未分配" && s.role];
    meta.append(node("strong", "", s.title),
      node("small", "", [s.harness, ...roles].filter(Boolean).join(" · ")));
    if (detailed && s.model) meta.append(node("small", "", s.model));
    profile.append(avatar(s), meta, node("span", "wb-arrow", "›"));
    const info = node("div", "wb-member-info");
    info.append(node("span", "wb-member-state", memberStatus(s)));
    const count = data.counts.get(s.id) ?? 0;
    info.append(button(member === s.id ? "取消筛选" : "筛选 · " + count + " 条", () => filterMember(s.id), "wb-link"));
    element.append(profile, info);
    return element;
  }

  function objective() {
    const workflow = snapshot.workflow;
    const card = node("section", "wb-objective");
    const head = node("div", "wb-panel-head");
    head.append(node("h2", "", "项目目标"), button("查看目标 ↗", onGoal, "wb-link"));
    const fullGoal = workflow?.goal ?? "尚未登记项目目标";
    const firstSentence = fullGoal.match(/^.+?[。！？](?:\s*|$)/u)?.[0]?.trim();
    const title = firstSentence && firstSentence.length < fullGoal.length ? firstSentence : fullGoal;
    const titleLine = node("p", "wb-objective-title", title);
    titleLine.title = fullGoal;
    card.append(head, titleLine);
    if (workflow) {
      const iteration = workflow.iteration != null ? "第 " + workflow.iteration + " 轮" : "";
      card.append(node("p", "wb-objective-meta", [
        workflowLabel(workflow.status), workflowLabel(workflow.stage), iteration,
      ].filter(Boolean).join(" · ")));
      if (workflow.next) {
        const label = workflow.status === "paused" ? "恢复后的既定步骤 · " : "下一步 · ";
        card.append(node("p", "wb-next", label + workflow.next));
      }
    }
    const checklist = workflow?.acceptance ?? [];
    const plan = snapshot.planProgress;
    const usePlan = !checklist.length && plan?.total > 0;
    const total = usePlan ? plan.total : checklist.length;
    const done = usePlan ? plan.done : checklist.filter((step) => step.met).length;
    if (!total) return card;
    const progress = node("div", "wb-progress");
    const kind = usePlan ? "方案步骤" : "工作流验收项";
    progress.append(node("span", "", kind), node("strong", "", done + " / " + total + " 已登记"));
    if (!usePlan && checklist.length <= 6 && checklist.every((step) => step.title.length <= 24)) {
      const steps = node("ol", "wb-milestones");
      for (const step of checklist) {
        const item = node("li", step.met ? "met" : "", (step.met ? "✓ " : "") + step.title);
        item.title = step.title;
        steps.append(item);
      }
      card.append(progress, steps);
    } else {
      const meter = node("progress", "wb-meter");
      meter.max = total;
      meter.value = done;
      meter.setAttribute("aria-label", kind + "已登记完成");
      card.append(progress, meter);
    }
    return card;
  }

  const matchesMember = (ids) => !member || ids.includes(member);

  function renderOverview() {
    const main = node("div", "wb-overview-main");
    const side = node("div", "wb-overview-side");
    main.append(objective());
    const active = panel("待跟进记录", button("查看看板 ›", () => view("board"), "wb-link"));
    const followup = data.records.filter((record) => record.lane !== "done" && matchesMember(record.ids));
    const [attention, running, pending] = ["attention", "active", "todo"].map((lane) => followup.filter((record) => record.lane === lane));
    const priority = [...attention, ...running, ...pending];
    active.append(priority.length ? node("p", "wb-totals", [
      attention.length + " 需关注", running.length + " 进行中", pending.length + " 待办",
    ].join("　·　")) : empty("暂无待跟进任务。"));
    for (const record of priority.slice(0, 6)) active.append(row(record));

    const threads = panel("协作线程");
    const visible = data.threads.filter((thread) => matchesMember(thread.ids) || thread.items.some((item) => matchesMember(item.ids)));
    if (!visible.length) threads.append(empty("暂无关联的合作计划或 Bridge 交接。"));
    for (const [index, thread] of visible.entries()) {
      const disclosure = node("details", "wb-thread");
      disclosure.open = expanded.get(thread.id) ?? index === 0;
      disclosure.ontoggle = () => {
        if (disclosure.isConnected) expanded.set(thread.id, disclosure.open);
      };
      const done = thread.items.filter((item) => item.lane === "done").length;
      const heading = node("summary");
      heading.append(node("strong", "", thread.title), node("small", "", thread.planned ? "合作登记" : "Bridge 交接"),
        node("span", "wb-thread-count", done + " / " + thread.items.length));
      disclosure.append(heading);
      const participants = thread.ids.map((id) => data.members.get(id)?.title).filter(Boolean);
      if (participants.length) disclosure.append(node("p", "wb-thread-members", participants.join(" · ")));
      for (const record of thread.items) disclosure.append(row(record));
      if (!thread.items.length) disclosure.append(empty("暂无明确关联的任务。"));
      threads.append(disclosure);
    }
    main.append(active, threads);

    const team = panel("团队", button(data.members.size + " 位成员 ›", () => view("members"), "wb-link"));
    const members = [...data.members.values()].filter((s) => matchesMember([s.id]));
    if (!members.length) team.append(empty("登记希望显示的项目会话。"));
    for (const s of members.slice(0, 4)) team.append(memberCard(s));
    const activity = panel("最近协作", button("时间线 ›", onTimeline, "wb-link"));
    const relevant = new Map(data.bridge.filter((record) => matchesMember(record.ids)).map((record) => [record.id, record]));
    const events = snapshot.events.filter((event) => relevant.has(event.subjectId)).slice(-4).reverse();
    for (const event of events) {
      const record = relevant.get(event.subjectId);
      const entry = button("", () => onRecord(record), "wb-event");
      entry.append(node("span", "", formatEvent(event.kind)), node("time", "", formatTime(event.at)));
      activity.append(entry);
    }
    if (!events.length) activity.append(empty("暂无任务事件。"));
    side.append(team, activity);
    const content = node("div", "wb-overview");
    content.append(main, side);
    panels.overview.replaceChildren(content);
  }

  function renderBoard() {
    lanesRoot.replaceChildren();
    const filtered = data.records.filter((record) =>
      (source === "all" || source === record.kind) && matchesMember(record.ids) &&
      [record.title, record.note, record.id, ...record.acceptance].join(" ").toLowerCase().includes(query)
    );
    for (const [id, label] of lanes) {
      const records = filtered.filter((record) => record.lane === id);
      const lane = panel(label, node("span", "wb-count", records.length));
      lane.classList.add("wb-lane");
      lane.dataset.state = id;
      for (const record of records) lane.append(row(record));
      if (!records.length) lane.append(empty("暂无任务"));
      lanesRoot.append(lane);
    }
  }

  function renderMembers() {
    const grid = node("div", "wb-member-grid");
    for (const s of data.members.values()) {
      if (matchesMember([s.id])) grid.append(memberCard(s, true));
    }
    panels.members.replaceChildren(grid);
    if (!grid.children.length) panels.members.append(empty("登记希望显示的项目会话。"));
  }

  function renderGraph() {
    if (snapshot?.project?.id) {
      neuralSwarm.update(snapshot.project.id);
    }
  }

  function renderGraphLegacyUnused() {
    const root = panels.graph;
    if (!data.members.size) {
      root.replaceChildren(empty("登记项目会话后查看协作关系。"));
      return;
    }
    const graphPanel = panel("会话关系");
    const scroll = root.querySelector(".wb-graph-canvas");
    const legend = node("p", "wb-graph-legend");
    legend.append(node("span", "wb-solid", "Bridge 任务"), node("span", "wb-dashed", "合作登记"));
    if (data.links.length) legend.append(node("span", "wb-dotted", "父子会话"));
    const edges = [...data.links, ...data.bridge.map((record) => ({
      from: record.ids[0], to: record.ids[1], label: record.title, kind: "bridge",
    }))];
    for (const thread of data.threads.filter((item) => item.planned)) {
      for (const id of thread.ids.slice(1)) edges.push({ from: thread.ids[0], to: id, label: thread.title, kind: "planned" });
    }
    const visibleEdges = edges.filter(({ from, to }) => matchesMember([from, to]));
    const visible = member ? new Set([member, ...visibleEdges.flatMap(({ from, to }) => [from, to])]) : new Set(data.members.keys());
    const participants = [...visible].map((id) => data.members.get(id)).filter(Boolean);
    const leadIndex = participants.findIndex((s) => s.id === data.leadId);
    if (leadIndex > 0) participants.unshift(...participants.splice(leadIndex, 1));
    const namespace = "http://www.w3.org/2000/svg";
    function svgNode(tag, attributes) {
      const item = document.createElementNS(namespace, tag);
      for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
      return item;
    }
    const width = 1000, columns = Math.min(5, participants.length), cell = width / columns;
    const leadAbove = leadIndex !== -1 && participants.length > 2 && participants.length <= 5;
    const height = leadAbove ? 310 : Math.ceil(participants.length / columns) * 130 + 82;
    const svg = svgNode("svg", { viewBox: "0 0 " + width + " " + height, role: "group", "aria-label": "协作图，可选择会话节点" });
    const positions = new Map(participants.map((s, i) => {
      if (leadAbove) {
        return [s.id, i === 0 ? { x: width / 2, y: 52 }
          : { x: (i - 0.5) * width / (participants.length - 1), y: 210 }];
      }
      return [s.id, { x: (i % columns + 0.5) * cell, y: 75 + Math.floor(i / columns) * 130 }];
    }));
    const relations = new Map();
    for (const edge of visibleEdges) {
      const key = JSON.stringify([[edge.from, edge.to].sort(), edge.kind]);
      if (!relations.has(key)) relations.set(key, { ...edge, labels: [] });
      relations.get(key).labels.push(edge.label);
    }
    for (const { from, to, labels, kind } of relations.values()) {
      const a = positions.get(from), b = positions.get(to);
      if (!a || !b) continue;
      const bend = kind === "child" ? 0 : kind === "planned" ? 42 : -42;
      const path = a === b
        ? "M " + a.x + " " + a.y + " c -95 -55 95 -55 0 0"
        : "M " + a.x + " " + a.y + " Q " + (a.x + b.x) / 2 + " " + ((a.y + b.y) / 2 + bend) + " " + b.x + " " + b.y;
      const line = svgNode("path", { d: path, class: "wb-edge " + kind });
      const label = svgNode("title", {});
      label.textContent = labels.join("\n");
      line.append(label);
      svg.append(line);
    }
    for (const s of participants) {
      const { x, y } = positions.get(s.id);
      const group = svgNode("g", { role: "button", tabindex: "0", "aria-label": "查看会话 " + s.title, class: "wb-graph-node" });
      const label = svgNode("text", { x, y: y + 46, "text-anchor": "middle" });
      const title = displayTitle(s);
      const characters = [...title];
      const limit = columns < 4 ? 22 : 13;
      label.textContent = characters.length > limit ? characters.slice(0, limit).join("") + "…" : title;
      const glyph = svgNode("text", { x, y: y + 5, "text-anchor": "middle", class: "wb-graph-glyph" });
      glyph.textContent = s.harness === "antigravity" ? "Antigravity" : s.harness;
      const roles = [...s.roles].filter((role) => role !== "项目负责人").join(" · ");
      const roleLabel = svgNode("text", { x, y: y + 64, "text-anchor": "middle", class: "wb-graph-role" });
      roleLabel.textContent = columns < 4 ? roles : "";
      group.append(svgNode("rect", { x: x - 55, y: y - 25, width: 110, height: 50, rx: 7 }), glyph, label, roleLabel);
      group.onclick = () => onMember(s.id);
      group.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onMember(s.id);
      };
      svg.append(group);
    }
    const canvas = node("div", "wb-graph-canvas");
    canvas.append(svg);
    graphPanel.append(legend, canvas);
    if (!visibleEdges.length) graphPanel.append(empty("当前范围暂无已登记的合作或交接关系。"));
    root.replaceChildren(graphPanel);
    if (scroll) {
      canvas.scrollLeft = scroll.scrollLeft;
      canvas.scrollTop = scroll.scrollTop;
    }
  }

  function renderView() {
    if (current === "overview") renderOverview();
    if (current === "board") renderBoard();
    if (current === "members") renderMembers();
    if (current === "graph") renderGraph();
  }

  view(current, false);
  return {
    view,
    update(next) {
      if (snapshot?.project.id === next.project.id && snapshot.revision === next.revision) return;
      if (snapshot?.project.id !== next.project.id) {
        expanded = new Map();
        member = query = search.value = "";
        source = sourceSelect.value = "all";
      }
      snapshot = next;
      data = projectData(next);
      if (!data.members.has(member)) member = "";
      const all = node("option", "", "全部成员");
      all.value = "";
      memberSelect.replaceChildren(all);
      for (const s of data.members.values()) {
        const option = node("option", "", s.title);
        option.value = s.id;
        memberSelect.append(option);
      }
      memberSelect.value = member;
      register.hidden = Boolean(next.demo);
      tabButtons.get("board").lastElementChild.textContent = data.records.length;
      tabButtons.get("members").lastElementChild.textContent = data.members.size;
      view(current, false);
    },
  };
}
