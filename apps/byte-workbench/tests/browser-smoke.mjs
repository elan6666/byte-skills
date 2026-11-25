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
    width: 1536,
    height: 1024,
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
  await until(
    "!document.querySelector('#wb-overview').hidden && document.querySelector('.wb-thread')?.open",
    "overview opens by default with a recorded thread",
  );
  await shot("overview");
  await evaluate("document.querySelector('#wb-tab-board').click()");
  assert.equal(await evaluate("document.querySelectorAll('.wb-lane .wb-record').length"), 1);
  await evaluate(`(()=>{const q=document.querySelector('[aria-label="搜索看板"]');q.value='不匹配';q.dispatchEvent(new Event('input'));})()`);
  assert.equal(await evaluate("document.querySelectorAll('.wb-lane .wb-record').length"), 0);
  await evaluate(`(()=>{const q=document.querySelector('[aria-label="搜索看板"]');q.value='';q.dispatchEvent(new Event('input'));})()`);
  await shot("tasks");
  await evaluate("document.querySelector('#wb-tab-members').click()");
  assert.equal(await evaluate("document.querySelectorAll('#wb-members .wb-profile').length"), 6);
  await evaluate("document.querySelector('#wb-members .wb-member-info button').click()");
  assert.equal(await evaluate("document.querySelectorAll('#wb-members .wb-profile').length"), 1);
  await evaluate("document.querySelector('#wb-tab-graph').click()");
  assert.equal(await evaluate("document.querySelectorAll('.wb-graph-node').length"), 3);
  await evaluate("document.querySelector('.wb-graph-node').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))");
  assert.equal(await evaluate("document.querySelector('#detail h2').textContent"), "实验设计与核心实现");
  await evaluate("document.querySelector('#close-inspector').click()");
  await shot("graph");
  checks.push("Default overview, searchable lanes, cross-view member filter and keyboard graph profile");
  await evaluate("document.querySelector('#wb-tab-office').click()");
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
  await until("!document.querySelector('#office').hidden", "native project snapshot");
  assert.equal(await evaluate("document.querySelector('#session-count').textContent"), "0");
  await evaluate(`(()=>{document.querySelector('.wb-register').click();
    const picker=document.querySelector('.mission-picker');
    picker.querySelectorAll('input[type=checkbox]').forEach(input=>input.checked=true);
    picker.querySelector('button').click();})()`);
  await until(
    "document.querySelector('#session-count').textContent==='3'",
    "native fixture",
  );
  assert.equal(
    await evaluate("document.querySelector('#demo-banner').hidden"),
    true,
  );
  checks.push("Catalog/Bridge sessions appear after explicit display registration");
  const taskRow = "document.querySelector('.wb-lane[data-state=attention] .wb-record')";
  await evaluate("document.querySelector('#wb-tab-board').click()");
  assert.equal(await evaluate("document.querySelectorAll('.wb-lane[data-state=active] .wb-record').length"), 1);
  await evaluate("document.querySelector('.wb-lane[data-state=active] .wb-record').click()");
  await until("document.querySelector('.task-history')?.childElementCount > 0", "exact SQLite task history");
  await evaluate("document.querySelector('#tasks-panel').open=false");
  await evaluate(`(()=>{const button=[...document.querySelectorAll('.mission-actions button')].find(b=>b.textContent.includes('新建任务方案'));button.click();
    document.querySelector('[aria-label="任务名称"]').value='受控验证方案';
    document.querySelector('[aria-label="目标与方案"]').value='验证跨视图保存';
    document.querySelector('[aria-label="执行步骤（每行一步）"]').value='保存证据';
    document.querySelector('.mission-editor button').click();})()`);
  await until("document.querySelector('.wb-lane[data-state=todo] .wb-record strong')?.textContent==='受控验证方案'", "saved plan on board");
  await evaluate("document.querySelector('.wb-lane[data-state=todo] .wb-record').click()");
  await until("!!document.querySelector('.mission-step')", "board opens exact plan details");
  await evaluate(`(()=>{const row=document.querySelector('.mission-step');row.querySelector('select').value='done';
    row.querySelector('textarea').value=['reports/result.json','reports/check.md'].join(String.fromCharCode(10));
    row.querySelector('button').click();})()`);
  await until("document.querySelector('.wb-lane[data-state=done] .wb-record strong')?.textContent==='受控验证方案'", "evidence-backed plan status");
  await until("document.querySelector('.mission-step textarea')?.value.split(String.fromCharCode(10)).length===2", "multiple saved evidence references");
  await evaluate("window.scrollTo(0,0)");
  checks.push("Board opens exact Bridge history and saves plan status with multiple evidence references");
  await evaluate(`(()=>{document.querySelector('.mission-actions button:last-child').click();
    const editor=document.querySelector('.mission-editor');
    editor.querySelector('[aria-label="合作名称"]').value='验证小组';
    const rows=[...editor.querySelectorAll('.mission-session')].filter(row=>['main-session','worker-session'].includes(row.querySelector('[type=checkbox]').dataset.nativeId));
    rows.forEach(row=>{row.querySelector('[type=checkbox]').checked=true;row.querySelector('[aria-label]').value='验证';});
    [...editor.querySelectorAll('.mission-checks')].at(-1).querySelector('input').checked=true;
    editor.querySelector('button').click();})()`);
  await until("document.querySelector('.mission-editor').hidden", "collaboration saved");
  await evaluate("document.querySelector('#wb-tab-graph').click()");
  assert.equal(await evaluate("document.querySelectorAll('.wb-edge.planned').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('.wb-edge.bridge').length"), 1);
  await evaluate("document.querySelector('#wb-tab-overview').click()");
  assert.equal(await evaluate("document.querySelectorAll('.wb-thread').length"), 2);
  checks.push("Explicit collaboration plan and actual Bridge history display as separate graph edges and threads");
  await evaluate("document.querySelector('#wb-tab-office').click()");
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
  await evaluate("document.querySelector('#close-inspector').click();document.querySelector('#wb-tab-board').click()");
  await until(taskRow + "?.textContent.includes('需要输入')", "SSE task changes board lanes");
  checks.push("A Bridge state change moves the live record into the attention lane");
  await evaluate("document.querySelector('#wb-tab-overview').click()");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const fitsMobile = "document.documentElement.clientWidth === 390 && document.documentElement.scrollWidth <= 390 && Math.abs(visualViewport.scale - 1) < .01";
  await until(fitsMobile, "unscaled mobile overview");
  await shot("mobile");
  await evaluate("document.querySelector('#wb-tab-board').click()");
  await until(fitsMobile, "unscaled mobile board");
  await evaluate("document.querySelector('#wb-tab-graph').click()");
  await until(fitsMobile, "unscaled mobile graph");
  await evaluate("document.querySelector('#wb-tab-overview').click()");
  checks.push("390px overview, board and graph have no horizontal page overflow");
  await evaluate("document.querySelector('#close-inspector').click()");
  assert.equal(
    await evaluate(
      "document.querySelector('#inspector').classList.contains('closed')",
    ),
    true,
  );
  await evaluate("document.querySelector('#projects-toggle').click()");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#project-sidebar')).display"), "flex");
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
    await evaluate("(document.querySelector('#demo').hidden ? document.querySelector('#welcome-demo') : document.querySelector('#demo')).click()");
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
      await evaluate(`(() => {
        const search = document.querySelector("#project-search");
        search.value = ${JSON.stringify(expected.project.name)};
        search.dispatchEvent(new Event("input"));
      })()`);
      assert.equal(
        await evaluate("document.querySelector('#wb-overview .wb-panel .wb-profile')?.closest('section').querySelectorAll('.wb-profile').length || 0"),
        Math.min(expected.sessions.length, 4),
      );
      await shot("live-overview");
      await evaluate("document.querySelector('#wb-tab-board').click()");
      assert.equal(await evaluate("document.querySelectorAll('.wb-lane .wb-record').length"),
        expected.tasks.length + (expected.board?.items.length ?? 0));
      await shot("live-board");
      await evaluate("document.querySelector('#wb-tab-graph').click()");
      assert.equal(await evaluate("document.querySelectorAll('.wb-graph-node').length"), expected.sessions.length);
      await shot("live-graph");
      checks.push(
        "Actual selected project matches the live API across overview, board and graph",
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
