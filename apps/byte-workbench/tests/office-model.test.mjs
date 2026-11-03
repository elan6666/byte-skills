import test from "node:test";
import assert from "node:assert/strict";
import {
  officeMap,
  findPath,
  walkable,
  OfficeSimulation,
  behaviorFor,
  distance,
  TILE,
} from "../public/office-model.js";
import { demoSnapshot } from "../lib/demo.mjs";
const advance = (s, seconds) => {
  for (let i = 0; i < seconds * 20; i++) s.update(0.05);
};
test("all desks and leisure spots connect through doors without crossing furniture or walls", () => {
  const map = officeMap();
  for (const room of map.rooms)
    for (const desk of room.desks)
      for (const to of [
        room.spots.water,
        room.spots.read,
        room.spots.window,
        room.spots.board,
        ...map.meet,
        ...map.coffee,
        ...map.server,
      ]) {
        const path = findPath(map, desk.home, to);
        assert(
          path.length || distance(desk.home, to) < TILE,
          `${room.harness} ${desk.id} -> ${JSON.stringify(to)} unreachable`,
        );
        let from = desk.home;
        for (const p of path) {
          assert(walkable(map, p));
          assert.equal(Math.abs(p.x - from.x) + Math.abs(p.y - from.y), TILE);
          from = p;
        }
      }
  assert.equal(
    findPath(map, map.rooms[0].desks[0].home, { x: 0, y: 0 }).length,
    0,
  );
});
test("idle characters autonomously walk and use multiple leisure activities; no snapshot mutation", () => {
  const data = demoSnapshot(0),
    before = JSON.stringify(data),
    s = new OfficeSimulation();
  s.sync(data);
  const seen = new Set();
  for (let i = 0; i < 1200; i++) {
    s.update(0.05);
    for (const a of s.actors.values())
      if (a.mode === "idle") seen.add(a.action);
  }
  assert(seen.has("walk"));
  assert(
    [...seen].some((x) =>
      ["water", "read", "coffee", "window", "stroll"].includes(x),
    ),
  );
  assert([...s.actors.values()].some((a) => a.walked > 200));
  assert.equal(JSON.stringify(data), before);
});
test("busy characters stay at work, attention requests stop at a desk, unknown stays semantically distinct", () => {
  const s = new OfficeSimulation(),
    data = demoSnapshot(0);
  s.sync(data);
  advance(s, 15);
  assert.equal(s.actors.get("demo-main").action, "work");
  assert(
    distance(s.actors.get("demo-main"), s.actors.get("demo-main").home) < 1,
  );
  const next = demoSnapshot(2);
  s.sync(next);
  advance(s, 25);
  assert.equal(s.actors.get("demo-watch").action, "help");
  assert.equal(
    behaviorFor(
      { ...data.sessions[0], connection: "catalog", workState: "running" },
      false,
    ),
    "unknown",
  );
  assert.equal(
    behaviorFor({ ...data.sessions[0], stale: true }, false),
    "unknown",
  );
});
test("new cross-chat handoffs cause walking, a meeting, file exchange and a return; history does not replay", () => {
  const s = new OfficeSimulation(),
    initial = demoSnapshot(0);
  s.sync(initial);
  advance(s, 1);
  s.sync(demoSnapshot(1));
  advance(s, 0.1);
  assert.equal(s.meetings.length, 1);
  assert.equal(s.meetings[0].phase, "walking");
  assert(s.actors.get("demo-main").path.length);
  let talked = false;
  for (let i = 0; i < 800; i++) {
    s.update(0.05);
    talked ||= s.meetings[0].phase === "talking";
    for (const a of s.actors.values()) assert(walkable(s.map, a));
  }
  assert(talked);
  assert.equal(s.eventCount, 1);
  assert.equal(s.meetings[0].completed, true);
  assert.equal(s.actors.get("demo-watch").meeting, null);
  s.sync(demoSnapshot(1));
  advance(s, 15);
  assert.equal(s.eventCount, 1);
  const restored = new OfficeSimulation();
  restored.sync(demoSnapshot(3));
  advance(restored, 35);
  assert.equal(restored.eventCount, 0);
  assert.equal(restored.meetings.length, 0);
});
test("queued collaborations are visualized once in order, including return to the main chat", () => {
  const s = new OfficeSimulation();
  s.sync(demoSnapshot(0));
  const d = demoSnapshot(1);
  d.deliveries.push({ ...demoSnapshot(3).deliveries[0], seq: 2 });
  s.sync(d);
  advance(s, 80);
  assert.equal(s.eventCount, 2);
  assert(s.meetings.every((m) => m.completed));
  s.sync(d);
  advance(s, 15);
  assert.equal(s.eventCount, 2);
});
test("pause freezes motion, project switches clear scene and delivery identities", () => {
  const s = new OfficeSimulation();
  s.sync(demoSnapshot(0));
  advance(s, 4);
  s.paused = true;
  const before = s.state();
  advance(s, 10);
  assert.deepEqual(s.state(), before);
  s.paused = false;
  s.sync({
    ...demoSnapshot(0),
    project: { id: "different", name: "Other" },
    sessions: [],
    deliveries: [],
  });
  assert.equal(s.actors.size, 0);
  assert.equal(s.project, "different");
  assert.equal(s.meetings.length, 0);
});
