// A small, deterministic game simulation. It never sends commands to an agent.
export const TILE = 24,
  WORLD_W = 1152,
  WORLD_H = 864;
export const ACTIVE_DELIVERIES = new Set([
  "transport_confirmed",
  "receiver_accepted",
]);
const hash = (s) =>
  [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const point = (x, y) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });
export const cell = (p) => ({
  x: Math.floor(p.x / TILE),
  y: Math.floor(p.y / TILE),
});
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function officeMap(
  harnesses = ["codex", "zcode", "claude", "opencode"],
) {
  const grid = Array.from({ length: 36 }, (_, y) =>
    Array.from(
      { length: 48 },
      (_, x) => x >= 3 && x <= 44 && y >= 3 && y <= 32,
    ),
  );
  const rooms = harnesses.map((h, i) => {
    const tx = i % 2 ? 26 : 4,
      ty = i < 2 ? 4 : 20,
      w = 18,
      hg = 11;
    const room = {
      harness: h,
      tx,
      ty,
      w,
      h: hg,
      x: tx * TILE,
      y: ty * TILE,
      width: w * TILE,
      height: hg * TILE,
      door: point(tx + 9, i < 2 ? ty + hg - 1 : ty),
      desks: [],
    };
    for (let r = ty; r < ty + hg; r++)
      for (let c = tx; c < tx + w; c++)
        if (r === ty || r === ty + hg - 1 || c === tx || c === tx + w - 1)
          grid[r][c] = false;
    const doorRow = i < 2 ? ty + hg - 1 : ty;
    grid[doorRow][tx + 8] = true;
    grid[doorRow][tx + 9] = true;
    for (let k = 0; k < 6; k++) {
      const c = tx + 3 + (k % 3) * 5,
        r = ty + 4 + Math.floor(k / 3) * 4;
      room.desks.push({
        id: h + "-" + k,
        ...point(c, r),
        home: point(c, r + 1),
      });
      for (let xx = c - 1; xx <= c + 1; xx++)
        for (let yy = r - 1; yy <= r; yy++) grid[yy][xx] = false;
    }
    room.plant = { x: (tx + 1) * TILE, y: (ty + 2) * TILE };
    room.books = { x: (tx + w - 2) * TILE, y: (ty + 2) * TILE };
    room.spots = {
      water: point(tx + 2, ty + 2),
      read: point(tx + w - 3, ty + 3),
      window: point(tx + 8, ty + 1),
      board: point(tx + 2, ty + 1),
    };
    grid[ty + 2][tx + 1] = false;
    grid[ty + 2][tx + w - 2] = false;
    grid[ty + 3][tx + w - 2] = false;
    return room;
  });
  // Shared furniture occupies actual navigation cells, including the handoff table.
  for (const [c, r] of [
    [23, 16],
    [24, 16],
    [25, 16],
    [23, 17],
    [24, 17],
    [25, 17],
    [23, 5],
    [24, 5],
    [23, 6],
    [24, 6],
    [23, 7],
    [24, 7],
    [35, 16],
    [36, 16],
    [37, 16],
    [35, 17],
    [36, 17],
    [37, 17],
    [41, 16],
    [42, 16],
  ])
    grid[r][c] = false;
  return {
    grid,
    rooms,
    width: WORLD_W,
    height: WORLD_H,
    hub: point(24, 17),
    meet: [point(22, 17), point(26, 17)],
    coffee: [point(38, 17), point(39, 18), point(40, 17)],
    lounge: [point(7, 17), point(9, 18), point(12, 17)],
    server: [point(34, 17), point(35, 18)],
  };
}
export function walkable(map, p) {
  const c = cell(p);
  return map.grid[c.y]?.[c.x] === true;
}
export function findPath(map, from, to) {
  const a = cell(from),
    b = cell(to),
    key = (c) => c.y * 48 + c.x;
  if (!map.grid[a.y]?.[a.x] || !map.grid[b.y]?.[b.x]) return [];
  const queue = [a],
    parents = new Map([[key(a), null]]);
  let cursor = 0;
  while (cursor < queue.length) {
    const c = queue[cursor++];
    if (c.x === b.x && c.y === b.y) {
      const path = [];
      let id = key(c);
      while (parents.get(id) !== null) {
        path.push(point(id % 48, Math.floor(id / 48)));
        id = parents.get(id);
      }
      return path.reverse();
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const n = { x: c.x + dx, y: c.y + dy },
        id = key(n);
      if (map.grid[n.y]?.[n.x] && !parents.has(id)) {
        parents.set(id, key(c));
        queue.push(n);
      }
    }
  }
  return [];
}
export function behaviorFor(s, demo = false) {
  if (!demo && (s.connection !== "registered" || s.workState === "unknown"))
    return "unknown";
  if (["failed", "needs_input", "cancel_requested"].includes(s.workState))
    return "help";
  if (!demo && s.stale) return "unknown";
  if (["result_reported", "verifying"].includes(s.workState)) return "review";
  if (["running", "accepted"].includes(s.workState))
    return s.role === "监督" ? "supervise" : "work";
  if (["waiting", "ready", "created"].includes(s.workState))
    return s.role === "监督" ? "supervise" : "wait";
  if (["idle", "verified", "main_continued", "cancelled"].includes(s.workState))
    return "idle";
  return "unknown";
}
const actionText = {
  work: "专心工作",
  water: "照顾绿植",
  read: "翻阅资料",
  coffee: "倒一杯咖啡",
  window: "看看窗外",
  stroll: "走动一下",
  supervise: "查看实验设备",
  review: "核对结果",
  help: "等待协助",
  wait: "等待伙伴返还",
  unknown: "等待状态同步",
  meet: "碰面交接",
  return: "回到工位",
};
export class OfficeSimulation {
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.actors = new Map();
    this.deliveries = new Set();
    this.meetings = [];
    this.pending = [];
    this.elapsed = 0;
    this.project = null;
    this.eventCount = 0;
    this.map = officeMap();
    this.paused = false;
  }
  sync(
    snapshot,
    {
      harnesses = ["codex", "zcode", "claude", "opencode"],
      sessions = snapshot.sessions,
    } = {},
  ) {
    const changed =
      this.project !== snapshot.project.id ||
      this.map.rooms.map((r) => r.harness).join() !== harnesses.join();
    if (changed) {
      this.project = snapshot.project.id;
      this.actors.clear();
      this.deliveries.clear();
      this.meetings = [];
      this.pending = [];
      this.elapsed = 0;
      this.map = officeMap(harnesses);
    }
    this.demo = snapshot.demo;
    this.snapshot = snapshot;
    const ids = new Set(sessions.map((s) => s.id));
    for (const id of this.actors.keys())
      if (!ids.has(id)) this.actors.delete(id);
    for (const room of this.map.rooms) {
      const group = sessions
        .filter((s) => s.harness === room.harness)
        .slice(0, 6);
      group.forEach((s, index) => {
        let a = this.actors.get(s.id);
        const desk = room.desks[index],
          mode = behaviorFor(s, snapshot.demo);
        if (!a) {
          a = {
            id: s.id,
            x: desk.home.x,
            y: desk.home.y,
            home: { ...desk.home },
            desk,
            room,
            seed: hash(s.id),
            turn: 0,
            mode,
            action: "stand",
            arrivedAction: "stand",
            path: [],
            wait: (hash(s.id) % 19) / 10 + 0.3,
            phase: 0,
            direction: "down",
            walked: 0,
            meeting: null,
            thought: null,
          };
          this.actors.set(s.id, a);
        }
        const movedHome = distance(a.home, desk.home) > 1;
        a.session = s;
        a.room = room;
        a.desk = desk;
        a.slot = index;
        a.home = { ...desk.home };
        if (movedHome && !a.meeting) {
          a.path = [];
          a.wait = 0.1;
          a.action = "stand";
        }
        if (a.mode !== mode) {
          a.mode = mode;
          if (mode === "help" && a.meeting) {
            const m = this.meetings.find(
              (m) => m.id === a.meeting && !m.completed,
            );
            if (m) {
              m.completed = true;
              m.phase = "interrupted";
              for (const id of [m.from, m.to]) {
                const partner = this.actors.get(id);
                if (partner) {
                  partner.meeting = null;
                  partner.thought = null;
                  partner.path = [];
                  partner.wait = 0.1;
                  partner.action = "stand";
                }
              }
            }
          }
          if (!a.meeting) {
            a.path = [];
            a.wait = 0.2;
            a.action = "stand";
          }
        }
      });
    }
    // A live initial snapshot is history. Replaying it would manufacture activity.
    for (const d of [...(snapshot.deliveries || [])].sort(
      (a, b) => a.seq - b.seq,
    )) {
      const stamp = d.id;
      if (!ACTIVE_DELIVERIES.has(d.state) || this.deliveries.has(stamp))
        continue;
      this.deliveries.add(stamp);
      if (
        !changed &&
        this.actors.has(d.from) &&
        this.actors.has(d.to) &&
        this.actors.get(d.from).mode !== "help" &&
        this.actors.get(d.to).mode !== "help"
      ) {
        this.pending.push(d);
        this.pending = this.pending.slice(-50);
      }
    }
    this.pending = this.pending.filter(
      (d) =>
        this.actors.get(d.from)?.mode !== "help" &&
        this.actors.get(d.to)?.mode !== "help",
    );
  }
  random(a) {
    a.seed = (Math.imul(a.seed, 1664525) + 1013904223) >>> 0;
    return a.seed / 4294967296;
  }
  go(a, target, action) {
    if (!["work", "review", "help", "meet", "return"].includes(action)) {
      const reserved = (p) =>
        [...this.actors.values()].some(
          (other) =>
            other !== a && other.target && distance(other.target, p) < 18,
        );
      if (reserved(target)) {
        for (const [dx, dy] of [
          [24, 0],
          [-24, 0],
          [0, 24],
          [0, -24],
          [24, 24],
          [-24, 24],
        ]) {
          const alternate = { x: target.x + dx, y: target.y + dy };
          if (walkable(this.map, alternate) && !reserved(alternate)) {
            target = alternate;
            break;
          }
        }
      }
    }
    const path = findPath(this.map, a, target);
    a.path = path;
    a.arrivedAction = action;
    a.action = path.length ? "walk" : action;
    a.target = { ...target };
    a.wait = path.length ? 0 : 2 + this.random(a) * 3;
    return path.length > 0 || distance(a, target) < TILE;
  }
  plan(a) {
    a.turn++;
    if (a.mode === "work") {
      this.go(a, a.home, "work");
      return;
    }
    if (a.mode === "review") {
      this.go(a, a.home, "review");
      return;
    }
    if (a.mode === "help") {
      this.go(a, a.home, "help");
      return;
    }
    if (a.mode === "supervise") {
      this.go(
        a,
        a.turn % 2 ? this.map.server[a.seed % 2] : a.home,
        a.turn % 2 ? "supervise" : "review",
      );
      return;
    }
    if (a.mode === "wait") {
      const choices = [
        a.home,
        this.map.coffee[a.seed % 3],
        this.map.lounge[a.seed % 3],
      ];
      this.go(
        a,
        choices[a.turn % 3],
        a.turn % 3 === 1 ? "coffee" : a.turn % 3 === 2 ? "read" : "wait",
      );
      return;
    }
    if (a.mode === "unknown") {
      this.go(
        a,
        a.turn % 2 ? point(a.room.tx + 2 + a.slot * 2, a.room.ty + 1) : a.home,
        "unknown",
      );
      return;
    }
    const choices = ["water", "read", "coffee", "window", "stroll"],
      action = choices[(a.turn + a.seed) % choices.length];
    const target =
      action === "coffee"
        ? this.map.coffee[a.seed % 3]
        : action === "stroll"
          ? this.map.lounge[a.seed % 3]
          : a.room.spots[action];
    this.go(a, target, action);
  }
  collaborate(d) {
    const a = this.actors.get(d.from),
      b = this.actors.get(d.to);
    if (!a || !b || a === b || a.meeting || b.meeting) return false;
    const meet = {
      id: d.id,
      from: a.id,
      to: b.id,
      phase: "walking",
      wait: 0,
      delivery: d,
      completed: false,
    };
    this.meetings.push(meet);
    for (const [i, actor] of [a, b].entries()) {
      actor.meeting = meet.id;
      actor.thought = i === 0 ? "带上这份任务" : "去接一下伙伴";
      this.go(actor, this.map.meet[i], "meet");
    }
    this.onEvent({
      kind: "meeting-start",
      message: "两位伙伴正在前往协作长桌",
      id: d.id,
    });
    return true;
  }
  update(dt) {
    if (this.paused) return;
    dt = Math.max(0, Math.min(dt, 0.1));
    this.elapsed += dt;
    this.pending = this.pending.filter((d) => !this.collaborate(d));
    for (const a of this.actors.values()) {
      a.phase += dt;
      if (a.path.length) {
        const p = a.path[0],
          dx = p.x - a.x,
          dy = p.y - a.y,
          dist = Math.hypot(dx, dy),
          speed = (a.meeting ? 70 : 44 + (a.seed % 16)) * dt;
        a.direction =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? "right"
              : "left"
            : dy > 0
              ? "down"
              : "up";
        a.walked += speed;
        if (dist <= speed) {
          a.x = p.x;
          a.y = p.y;
          a.path.shift();
          if (!a.path.length) {
            a.action = a.arrivedAction;
            a.wait = 3 + this.random(a) * 4;
            if (
              a.action === "work" ||
              a.action === "review" ||
              a.action === "help"
            )
              a.direction = "up";
          }
        } else {
          a.x += (dx / dist) * speed;
          a.y += (dy / dist) * speed;
        }
      } else if (!a.meeting) {
        a.wait -= dt;
        if (a.wait <= 0) {
          if (
            ["work", "help", "review"].includes(a.action) &&
            ["work", "help", "review"].includes(a.mode)
          ) {
            a.wait = 3;
            continue;
          }
          this.plan(a);
        }
      }
    }
    for (const m of this.meetings) {
      if (m.completed) continue;
      const a = this.actors.get(m.from),
        b = this.actors.get(m.to);
      if (!a || !b) {
        m.completed = true;
        for (const p of [a, b])
          if (p) {
            p.meeting = null;
            p.wait = 0.1;
          }
        continue;
      }
      if (m.phase === "walking" && !a.path.length && !b.path.length) {
        m.phase = "talking";
        m.wait = 4;
        a.direction = "right";
        b.direction = "left";
        a.thought = "把上下文和成果交给你";
        b.thought = "收到，我来接着做";
        this.onEvent({
          kind: "meeting-talk",
          id: m.id,
          message: "伙伴碰面，传递任务资料",
        });
      }
      if (m.phase === "talking") {
        m.wait -= dt;
        if (m.wait <= 0) {
          m.phase = "finished";
          m.completed = true;
          this.eventCount++;
          for (const p of [a, b]) {
            p.meeting = null;
            p.thought = null;
            this.go(p, p.home, "return");
          }
          this.onEvent({
            kind: "meeting-complete",
            id: m.id,
            message: "交接演绎完成，伙伴返回自己的分区",
          });
        }
      }
    }
    if (this.meetings.length > 40)
      this.meetings = this.meetings.filter((m) => !m.completed);
  }
  state() {
    return {
      elapsed: this.elapsed,
      project: this.project,
      meetings: this.meetings.map((m) => ({
        id: m.id,
        phase: m.phase,
        completed: m.completed,
      })),
      actors: [...this.actors.values()].map((a) => ({
        id: a.id,
        x: a.x,
        y: a.y,
        action: a.action,
        mode: a.mode,
        direction: a.direction,
        pathLength: a.path.length,
        meeting: a.meeting,
        walked: a.walked,
      })),
      eventCount: this.eventCount,
    };
  }
  label(a) {
    return (
      a.thought ||
      (a.action === "walk"
        ? a.meeting
          ? "去和伙伴碰面"
          : "走向" + (actionText[a.arrivedAction] || "目的地")
        : actionText[a.action] || "整理一下")
    );
  }
}
