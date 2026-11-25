const el = (tag, cls, value) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (value !== undefined) element.textContent = value;
  return element;
};
const key = (session) => session.harness + ":" + session.nativeId;
const labels = { todo: "待办", in_progress: "进行中", blocked: "受阻", review: "待核验", done: "已完成" };
const lines = (value) => value.split("\n").map((line) => line.trim()).filter(Boolean);

function button(text, action) {
  const element = el("button", "mission-button", text);
  element.type = "button";
  element.onclick = action;
  return element;
}
function field(name, tag = "input") {
  const label = el("label", "mission-field", name);
  const input = el(tag);
  input.setAttribute("aria-label", name);
  label.append(input);
  return { label, input };
}
function statusFromSteps(steps) {
  if (steps.length && steps.every((step) => step.status === "done")) return "done";
  for (const status of ["blocked", "review", "in_progress", "done"]) {
    if (steps.some((step) => step.status === status)) return status === "done" ? "in_progress" : status;
  }
  return "todo";
}

export function mountMission({ root, api, onSnapshot, toast }) {
  let snapshot, epoch = 0, pickerRevision, lastItems, saving = false;
  const picker = el("section", "mission-picker");
  picker.hidden = true;
  const search = field("筛选可登记会话");
  const checks = el("div", "mission-checks");
  picker.append(
    el("h2", "", "登记展示会话"),
    el("p", "small", "勾选在工作台显示的会话。执行授权由各会话管理。"),
    search.label, checks, button("保存展示登记", savePicker),
    button("关闭", () => { picker.hidden = true; })
  );
  root.append(picker);
  search.input.oninput = () => {
    const query = search.input.value.trim().toLowerCase();
    for (const row of checks.children) row.hidden = !row.dataset.search.includes(query);
  };
  const todos = el("section", "mission-todos");
  todos.id = "mission-todos";
  const actions = el("div", "mission-actions");
  actions.append(button("＋ 新建任务方案", () => openTask()), button("＋ 登记合作", openCollaboration));
  const editor = el("div", "mission-editor");
  editor.hidden = true;
  const list = el("div", "mission-items");
  todos.append(el("h2", "", "任务与方案"), el("p", "small", "标记步骤完成时填写证据引用。"), actions, editor, list);
  root.append(todos);

  async function persist(action, value, original, revision = snapshot?.board?.revision) {
    if (!snapshot || snapshot.demo || saving) return false;
    if (original && JSON.stringify(snapshot.board.items.find((item) => item.id === original.id)) !== JSON.stringify(original)) {
      toast("方案已被更新，请重新打开后保存");
      return false;
    }
    const version = epoch;
    saving = true;
    try {
      const result = await api("/api/workboard?" + new URLSearchParams({ project: snapshot.project.id }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, action, value }),
      });
      if (version !== epoch) return false;
      onSnapshot(result.snapshot);
      toast("登记已保存");
      return true;
    } catch (error) {
      if (version === epoch) toast(error.message);
      return false;
    } finally {
      if (version === epoch) saving = false;
    }
  }

  function checkbox(session) {
    const control = el("input");
    control.type = "checkbox";
    control.dataset.harness = session.harness;
    control.dataset.nativeId = session.nativeId;
    return control;
  }

  function register() {
    if (!snapshot || snapshot.demo) return;
    picker.hidden = !picker.hidden;
    if (picker.hidden) return;
    pickerRevision = snapshot.board.revision;
    const existing = new Map(snapshot.board.displaySessions.map((session) => [key(session), session]));
    const candidates = new Map((snapshot.sessionCatalog ?? []).map((session) => [key(session), session]));
    checks.replaceChildren();
    for (const [id, session] of new Map([...existing, ...candidates])) {
      const row = el("label", "mission-session");
      const control = checkbox(session);
      control.checked = existing.has(id);
      const title = session.title ?? session.nativeId + " · 来源暂不可用";
      row.dataset.search = [title, session.harness, session.nativeId].join(" ").toLowerCase();
      const harness = session.harness + (session.parentNativeId ? " · 子代理" : "");
      row.append(control, el("span", "", title), el("small", "", harness));
      checks.append(row);
    }
    if (!checks.children.length) {
      const message = el("p", "small", "当前项目目录没有可登记的会话。");
      message.dataset.search = "";
      checks.append(message);
    }
    search.input.value = "";
    search.input.focus();
  }

  async function savePicker() {
    const sessions = [...checks.querySelectorAll("input:checked")].map(({ dataset }) => ({
      harness: dataset.harness,
      nativeId: dataset.nativeId,
    }));
    if (await persist("display", sessions, undefined, pickerRevision)) picker.hidden = true;
  }

  function begin(title) {
    editor.hidden = false;
    editor.replaceChildren(el("h3", "", title));
  }

  function end() {
    editor.hidden = true;
    editor.replaceChildren();
  }

  function openTask(item) {
    if (!snapshot || snapshot.demo) return;
    begin(item ? "编辑方案" : "新建任务方案");
    const title = field("任务名称");
    const objective = field("目标与方案", "textarea");
    const steps = field("执行步骤（每行一步）", "textarea");
    const acceptance = field("验收条件（每行一条）", "textarea");
    title.input.value = item?.title ?? "";
    objective.input.value = item?.objective ?? "";
    steps.input.value = item?.steps.map((step) => step.title).join("\n") ?? "";
    acceptance.input.value = item?.acceptance.join("\n") ?? "";
    editor.append(title.label, objective.label, steps.label, acceptance.label);
    editor.append(button("保存任务方案", async () => {
      const nextSteps = lines(steps.input.value).map((name, index) => {
        const old = item?.steps[index];
        return old?.title === name ? old : { id: crypto.randomUUID(), title: name, status: "todo", evidence: [] };
      });
      const changedSteps = nextSteps.length !== item?.steps.length || nextSteps.some((step, index) => step !== item.steps[index]);
      const next = {
        ...item,
        id: item?.id ?? crypto.randomUUID(),
        title: title.input.value.trim(),
        objective: objective.input.value.trim(),
        status: changedSteps ? statusFromSteps(nextSteps) : item.status,
        participants: item?.participants ?? [],
        acceptance: lines(acceptance.input.value),
        steps: nextSteps,
      };
      if (await persist("task", next, item) && title.input.isConnected) end();
    }), button("取消", end));
    editor.scrollIntoView({ block: "nearest" });
    title.input.focus({ preventScroll: true });
  }

  function openCollaboration() {
    if (!snapshot || snapshot.demo) return;
    const sessions = new Map(snapshot.sessions.map((session) => [key(session), session]));
    if (sessions.size < 2) {
      toast("请先登记至少两个会话");
      return;
    }
    begin("登记合作关系");
    const title = field("合作名称");
    const members = el("div", "mission-checks");
    const roles = [];
    for (const session of sessions.values()) {
      const row = el("div", "mission-session");
      const label = el("label");
      const check = checkbox(session);
      label.append(check, el("span", "", session.title));
      const role = el("input");
      role.placeholder = "分工（例如：评审）";
      role.setAttribute("aria-label", session.title + "的分工");
      row.append(label, role);
      members.append(row);
      roles.push({ session, check, role });
    }
    const choices = el("div", "mission-checks");
    for (const plan of snapshot.board.items) {
      const label = el("label");
      const check = el("input");
      check.type = "checkbox";
      check.value = plan.id;
      label.append(check, el("span", "", plan.title));
      choices.append(label);
    }
    editor.append(title.label, members);
    if (choices.children.length) editor.append(el("p", "", "关联任务方案"), choices);
    editor.append(button("保存合作登记", async () => {
      const value = {
        id: crypto.randomUUID(),
        title: title.input.value.trim(),
        members: roles.filter(({ check }) => check.checked).map(({ session, role }) => ({
          harness: session.harness, nativeId: session.nativeId, role: role.value.trim(),
        })),
        taskIds: [...choices.querySelectorAll("input:checked")].map((check) => check.value),
        bridgeTaskIds: [],
      };
      if (await persist("collaboration", value) && title.input.isConnected) end();
    }), button("取消", end));
    editor.scrollIntoView({ block: "nearest" });
    title.input.focus({ preventScroll: true });
  }

  function renderPlan(item) {
    const card = el("details", "mission-item");
    card.dataset.planId = item.id;
    const done = item.steps.filter((step) => step.status === "done").length;
    const heading = el("summary");
    heading.append(el("strong", "", item.title),
      el("span", "mission-item-progress", done + "/" + item.steps.length + " 步 · " + labels[item.status]));
    card.append(heading);
    const content = el("div", "mission-plan-content");
    card.append(content);
    card.ontoggle = () => {
      if (!card.open || content.childElementCount) return;
      content.append(el("p", "", item.objective));
      if (item.acceptance.length) {
        const acceptance = el("ul");
        for (const condition of item.acceptance) acceptance.append(el("li", "", condition));
        content.append(acceptance);
      }
      for (const step of item.steps) {
        const row = el("div", "mission-step");
        const select = el("select");
        select.setAttribute("aria-label", item.title + " / " + step.title + "状态");
        for (const [value, label] of Object.entries(labels)) {
          const option = el("option", "", label);
          option.value = value;
          select.append(option);
        }
        select.value = step.status;
        const evidence = el("textarea");
        evidence.rows = 1;
        evidence.placeholder = "证据引用或产物路径";
        evidence.value = step.evidence.join("\n");
        evidence.setAttribute("aria-label", step.title + "证据");
        row.append(el("span", "", step.title), select, evidence, button("更新", () => {
          const next = structuredClone(item);
          const changed = next.steps.find((candidate) => candidate.id === step.id);
          changed.status = select.value;
          changed.evidence = lines(evidence.value);
          next.status = statusFromSteps(next.steps);
          return persist("task", next, item);
        }));
        content.append(row);
      }
      if (!snapshot.demo) content.append(button("编辑方案", () => openTask(item)));
    };
    return card;
  }

  function clear() {
    epoch++;
    snapshot = null;
    lastItems = null;
    saving = false;
    end();
    picker.hidden = true;
    list.replaceChildren();
  }

  return {
    clear,
    register,
    update(next) {
      if (snapshot?.project.id !== next.project.id) clear();
      snapshot = next;
      const items = next.board?.items ?? [];
      actions.hidden = Boolean(next.demo);
      todos.hidden = Boolean(next.demo) && !items.length;
      const signature = JSON.stringify(items);
      if (signature === lastItems) return;
      lastItems = signature;
      const previous = new Map([...list.querySelectorAll("details[data-plan-id]")].map((card) => [card.dataset.planId, card.open]));
      list.replaceChildren(...items.map((item) => {
        const card = renderPlan(item);
        card.open = previous.get(item.id) ?? false;
        return card;
      }));
      if (!items.length) list.append(el("p", "small", "暂无任务方案。"));
    },
    showPlan(id) {
      const card = [...list.children].find((element) => element.dataset.planId === id);
      if (!card) return;
      card.open = true;
      card.scrollIntoView({ block: "start" });
      card.querySelector("summary").focus({ preventScroll: true });
    },
  };
}
