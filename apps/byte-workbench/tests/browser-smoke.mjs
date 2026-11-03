// Optional real Chromium test. CHROME_BIN must point to an installed browser.
// Uses Node's CDP/WebSocket support; no Playwright/Puppeteer dependency.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createWorkbench } from "../server.mjs";
import { fixture, nativeFixture } from "./fixtures.mjs";
const chrome = process.env.CHROME_BIN;
if (!chrome) throw Error("Set CHROME_BIN to an installed Chromium executable.");
const args = process.argv.slice(2),
  out = resolve(args[args.indexOf("--output") + 1] || "browser-results");
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "byte-office-browser-"));
const f = fixture();
nativeFixture(f);
const server = createWorkbench({
  home: f.home,
  roots: [f.root, f.other],
  config: join(f.base, "config.json"),
  interval: 100,
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const child = spawn(
  chrome,
  [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let ws;
const errors = [],
  checks = [];
try {
  const debug = await new Promise((res, rej) => {
    let text = "";
    const timeout = setTimeout(
      () => rej(Error("Chromium did not start")),
      15000,
    );
    child.stderr.on("data", (data) => {
      text += data;
      const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timeout);
        res(m[1]);
      }
    });
    child.on("error", rej);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      rej(Error("Chromium exited " + code));
    });
  });
  ws = new WebSocket(debug);
  await once(ws, "open");
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error
        ? p.reject(Error(JSON.stringify(msg.error)))
        : p.resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown")
      errors.push(
        msg.params.exceptionDetails.exception?.description ||
          msg.params.exceptionDetails.text,
      );
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  const target = await send("Target.createTarget", { url: "about:blank" }),
    { sessionId } = await send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
  const call = (method, params = {}) => send(method, params, sessionId);
  await call("Runtime.enable");
  await call("Page.enable");
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  };
  const until = async (expression, label, limit = 10000) => {
    const start = Date.now();
    while (Date.now() - start < limit) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 70));
    }
    throw Error("Timed out: " + label);
  };
  const go = async (url) => {
    await call("Page.navigate", { url });
    await until(
      "location.href===" +
        JSON.stringify(new URL(url).href) +
        " && document.readyState==='complete' && !!document.querySelector('#projects .project')",
      "app loaded",
    );
  };
  const shot = async (name) => {
    const result = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(join(out, name + ".png"), Buffer.from(result.data, "base64"));
  };
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1120,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await go(base);
  assert.equal(
    await evaluate("document.querySelector('#office').hidden"),
    true,
  );
  checks.push("Explicit project selection; no implicit first project");
  await evaluate("document.querySelector('#demo').click()");
  await until(
    "!document.querySelector('#office').hidden && !document.querySelector('#demo-banner').hidden",
    "demo",
  );
  await shot("demo-office");
  assert.equal(
    await evaluate("!!document.querySelector('.office-canvas')"),
    true,
  );
  const beforeMotion = await evaluate("window.byteOfficeScene.getState()");
  await new Promise((r) => setTimeout(r, 3400));
  const afterMotion = await evaluate("window.byteOfficeScene.getState()");
  assert(
    afterMotion.actors.some((a) => {
      const old = beforeMotion.actors.find((b) => b.id === a.id);
      return old && Math.hypot(old.x - a.x, old.y - a.y) > 15;
    }),
  );
  assert(
    afterMotion.actors.some((a) => a.mode === "work" && a.action === "work"),
  );
  await shot("living-office");
  checks.push(
    "Continuous 2D map: idle characters walk autonomously while busy characters work at desks",
  );
  const clickPoint = await evaluate(
    `(()=>{const state=window.byteOfficeScene.getState(),a=state.actors.find(a=>a.id==='demo-main'),r=document.querySelector('.office-canvas').getBoundingClientRect(),scale=Math.min(r.width/1152,r.height/864)*state.camera.zoom;return{x:r.left+r.width/2+(a.x-state.camera.x)*scale,y:r.top+r.height/2+(a.y-20-state.camera.y)*scale};})()`,
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...clickPoint,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...clickPoint,
  });
  await until(
    "document.querySelector('#detail h2')?.textContent==='实验设计与核心实现'",
    "canvas character click opens exact chat",
  );
  await evaluate("document.querySelector('#close-inspector').click()");
  checks.push(
    "Clicking the moving-world character opens its exact chat details",
  );
  await evaluate("document.querySelector('#sound').click()");
  const frozen = await evaluate("window.byteOfficeScene.getState().elapsed");
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(
    await evaluate("window.byteOfficeScene.getState().elapsed"),
    frozen,
  );
  await evaluate("document.querySelector('#sound').click()");
  checks.push("Pause stops actual game motion and resume restores it");
  const zoom = await evaluate("window.byteOfficeScene.getState().camera.zoom");
  await evaluate("document.querySelector('#zoom-in').click()");
  assert(
    (await evaluate("window.byteOfficeScene.getState().camera.zoom")) > zoom,
  );
  await evaluate("document.querySelector('#fit-scene').click()");
  checks.push("Game camera zoom and fit controls");
  await evaluate("document.querySelector('#demo-next').click()");
  await until(
    "document.querySelector('#stage').textContent.includes('监督中')",
    "supervision",
  );
  await until(
    "window.byteOfficeScene.getState().meetings.some(m=>m.phase==='walking')",
    "characters leave desks to collaborate",
  );
  await until(
    "window.byteOfficeScene.getState().meetings.some(m=>m.phase==='talking')",
    "characters meet at shared table",
    18000,
  );
  await shot("collaboration");
  await until(
    "window.byteOfficeScene.getState().meetings.some(m=>m.phase==='finished'&&m.completed)",
    "characters finish exchange and return to desks",
    10000,
  );
  assert(
    (await evaluate("window.byteOfficeScene.getState().actors"))
      .filter((a) => ["demo-main", "demo-watch"].includes(a.id))
      .every((a) => a.meeting === null),
  );
  checks.push(
    "Actual browser: new handoff makes two characters walk across rooms and meet at the shared table",
  );
  await evaluate("document.querySelector('[data-session=demo-watch]').click()");
  assert(
    (await evaluate("document.querySelector('#detail').textContent")).includes(
      "GLM · 演示",
    ),
  );
  checks.push("Demo stages and clickable role/model details");
  for (let i = 0; i < 3; i++)
    await evaluate(
      "document.querySelector('#demo-next').click();new Promise(r=>setTimeout(r,80))",
    );
  await until(
    "document.querySelector('#stage').textContent.includes('主会话继续')",
    "main continuation",
  );
  checks.push("Demo supervision → input → verification → main continuation");
  const projects = await (await fetch(base + "/api/projects")).json(),
    id = projects.projects.find((p) => p.root === f.root).id;
  await go(base + "/?project=" + id);
  await until(
    "document.querySelector('#session-count').textContent==='3'",
    "native fixture",
  );
  assert.equal(
    await evaluate("document.querySelector('#demo-banner').hidden"),
    true,
  );
  checks.push("Real catalog+Bridge data; clear demo/live separation");
  await evaluate(
    "document.querySelector('[data-session=\"catalog:codex:child-session\"]').click()",
  );
  assert(
    (await evaluate("document.querySelector('#detail').textContent")).includes(
      "状态未知",
    ),
  );
  checks.push("Recent catalog-only chat remains unknown");
  await evaluate(
    "document.querySelector('.desk-search').value='child';document.querySelector('.desk-search').dispatchEvent(new Event('input'))",
  );
  assert.equal(await evaluate("document.querySelectorAll('.seat').length"), 1);
  await evaluate(
    "document.querySelector('.desk-search').value='';document.querySelector('.desk-search').dispatchEvent(new Event('input'))",
  );
  checks.push("Conversation search");
  f.task("task-1", "needs_input", 2);
  await until(
    "document.querySelector('#attention-count').textContent==='1'",
    "SSE task change",
  );
  assert(
    (await evaluate("window.byteOfficeScene.getState().actors")).some(
      (a) => a.mode === "help",
    ),
  );
  checks.push(
    "SQLite failure/input state reaches the game character behavior through SSE",
  );
  await evaluate("document.querySelector('#attention-stat').click()");
  assert(
    (await evaluate("document.querySelector('#detail').textContent")).includes(
      "需要输入",
    ),
  );
  assert.equal(
    await evaluate("document.querySelectorAll('#detail script').length"),
    0,
  );
  checks.push(
    "SSE updates UI from actual SQLite change; external titles are text, not executable markup",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await shot("mobile");
  assert.equal(
    await evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  checks.push("390px viewport has no horizontal page overflow");
  await evaluate("document.querySelector('#close-inspector').click()");
  assert.equal(
    await evaluate(
      "document.querySelector('#inspector').classList.contains('closed')",
    ),
    true,
  );
  await evaluate("document.querySelector('#add-project').click()");
  assert.equal(
    await evaluate("document.querySelector('#project-dialog').open"),
    true,
  );
  await evaluate("document.querySelector('#cancel-dialog').click()");
  checks.push("Mobile details close and project dialog");
  const liveAt = args.indexOf("--live");
  if (liveAt >= 0) {
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 1120,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await go(args[liveAt + 1]);
    await evaluate("document.querySelector('#demo').click()");
    await until(
      "!document.querySelector('#office').hidden",
      "live service demo",
    );
    await shot("office-preview");
    checks.push("Installed local service opens correctly");
    const liveProjectAt = args.indexOf("--live-project");
    if (liveProjectAt >= 0) {
      const url = new URL(args[liveAt + 1]);
      url.searchParams.set("project", args[liveProjectAt + 1]);
      const expected = await (
        await fetch(
          new URL(
            "/api/snapshot?project=" +
              encodeURIComponent(args[liveProjectAt + 1]),
            url,
          ),
        )
      ).json();
      await go(url.href);
      await until(
        "!document.querySelector('#office').hidden && document.querySelector('#demo-banner').hidden",
        "real installed project",
      );
      assert.equal(
        await evaluate(
          "Number(document.querySelector('#session-count').textContent)",
        ),
        expected.counts.sessions,
      );
      if (expected.tasks.length)
        assert.equal(
          await evaluate(
            "document.querySelector('#verified-count').textContent",
          ),
          `${expected.counts.verified} / ${expected.tasks.length}`,
        );
      await shot("live-office");
      checks.push(
        "Actual selected project matches real API task and session counts",
      );
    }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  writeFileSync(
    join(out, "browser-results.json"),
    JSON.stringify({ passed: checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, output: out }, null, 2));
} finally {
  ws?.close();
  child.kill("SIGTERM");
  await server.closeWorkbench();
  f.cleanup();
  await new Promise((r) => setTimeout(r, 250));
  rmSync(profile, { recursive: true, force: true });
}
