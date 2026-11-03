import http from "node:http";
import { readFileSync, statSync, existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, extname } from "node:path";
import { NativeCatalog } from "./lib/native.mjs";
import { ProjectCatalog } from "./lib/catalog.mjs";
import { projectSnapshot } from "./lib/projection.mjs";
import { demoProject, demoSnapshot } from "./lib/demo.mjs";
import { scoped, hash } from "./lib/files.mjs";
import { collectRecall, queryRecall } from "../../skills/byte-status/scripts/recall.mjs";
import { taskHistory } from "./lib/history.mjs";
import { displaySnapshot } from './lib/workboard.mjs';
import { readBoard, writeBoard, changeBoard, sessionKey } from '../../skills/byte-plan/scripts/workboard.mjs';
const dir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};
export function createWorkbench({
  roots = [],
  config,
  home,
  discover = true,
  demoOnly = false,
  interval = 2500,
} = {}) {
  const native = new NativeCatalog({ home, enabled: discover && !demoOnly }),
    catalog = new ProjectCatalog(native, { config, roots });
  let demoStep = 0;
  const clients = new Set();
  let tick;
  const snapshot = (id) => {
    if (demoOnly && id !== demoProject.id)
      throw Error("演示服务不读取真实项目");
    return id === demoProject.id
      ? demoSnapshot(demoStep)
      : displaySnapshot(projectSnapshot(catalog.get(id), native));
  };
  function send(res, status, value) {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const port = server.address()?.port,
      hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (
      !hosts.includes(req.headers.host) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(res, 403, { error: "仅允许本机同源访问" });
    if (
      req.headers.origin &&
      ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(
        req.headers.origin,
      )
    )
      return send(res, 403, { error: "来源不匹配" });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get("project");
    try {
      if (req.method === "GET" && url.pathname === "/api/projects")
        return send(res, 200, {
          projects: demoOnly ? [demoProject] : catalog.list(),
          demoProject,
          mode: demoOnly ? "demo" : "live",
        });
      if (req.method === "POST" && url.pathname === "/api/projects") {
        if (demoOnly)
          return send(res, 403, { error: "演示模式不登记真实项目" });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) return send(res, 413, { error: "请求过大" });
        }
        const input = JSON.parse(body);
        return send(res, 201, catalog.add(input.root, input.name));
      }
      if (req.method === "POST" && url.pathname === "/api/demo/next") {
        demoStep = (demoStep + 1) % 5;
        return send(res, 200, demoSnapshot(demoStep));
      }
      if (req.method === "GET" && url.pathname === "/api/snapshot")
        return send(res, 200, snapshot(id));
      if (req.method === 'POST' && url.pathname === '/api/workboard') {
        if(demoOnly || id===demoProject.id)return send(res,403,{error:'示例不修改真实登记'});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024*1024)return send(res,413,{error:'请求过大'});}
        const {revision,action,value}=JSON.parse(raw),p=catalog.get(id);
        // UI registration may only select a currently observed exact project chat.
        if(action==='display'){
          const known=new Set([...projectSnapshot(p,native).sessions,...readBoard(p.root).displaySessions].map(sessionKey));
          if(!Array.isArray(value)||value.some(s=>!known.has(sessionKey(s))))throw Error('所选会话不属于当前项目目录');
        }
        const board=writeBoard(p.root,revision,b=>changeBoard(b,action,value));
        return send(res,200,{board,snapshot:snapshot(id)});
      }
      if (req.method === "GET" && url.pathname === "/api/recall") {
        if (id === demoProject.id || demoOnly)
          return send(res, 200, {hits:[], total:0, available:0, warnings:[], demo:true,
            scope:"示例不读取真实项目记忆", trust:"示例数据不是执行权限"});
        const p = catalog.get(id);
        const options = {};
        for (const key of ['query','id','sha256','limit','maxChars'])
          if (url.searchParams.has(key)) options[key] = url.searchParams.get(key);
        return send(res, 200, queryRecall(collectRecall(p.root), options));
      }
      if (req.method === "GET" && url.pathname === "/api/task-history") {
        if (id === demoProject.id || demoOnly)
          return send(res, 200, {taskId:url.searchParams.get('task'), events:[], hasMore:false, nextCursor:null, demo:true});
        return send(res, 200, taskHistory(catalog.get(id).root, url.searchParams.get('task'), {
          before:url.searchParams.get('before'), limit:url.searchParams.get('limit') ?? 40}));
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        const initial = snapshot(id);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        const c = { id, res, revision: initial.revision };
        clients.add(c);
        res.write(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);
        req.on("close", () => clients.delete(c));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/artifact") {
        const p = catalog.get(id),
          s = snapshot(id),
          task = s.tasks.find((t) => t.id === url.searchParams.get("task")),
          a = task?.artifacts[Number(url.searchParams.get("index"))];
        if (!a) return send(res, 404, { error: "没有对应的登记产物" });
        const extension = extname(a.path).toLowerCase();
        if (
          ![
            ".md",
            ".txt",
            ".json",
            ".csv",
            ".log",
            ".png",
            ".jpg",
            ".jpeg",
            ".pdf",
            ".svg",
          ].includes(extension) ||
          a.path.split(/[\\/]/).some((x) => x.startsWith("."))
        )
          throw Error("不展示此类型产物");
        const file = scoped(p.root, a.path);
        if (!statSync(file).isFile() || statSync(file).size > 8 * 1024 * 1024)
          throw Error("产物不是文件或超过8MB预览上限");
        const bytes = readFileSync(file);
        if (hash(bytes) !== a.sha256)
          throw Error("产物已变化，SHA-256与登记结果不符");
        const binary = [".png", ".jpg", ".jpeg", ".pdf"].includes(extension);
        res.writeHead(200, {
          "Content-Type": binary
            ? "application/octet-stream"
            : "text/plain; charset=utf-8",
          "Content-Disposition": binary ? "attachment" : "inline",
          "Cache-Control": "no-store",
        });
        return res.end(bytes);
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return send(res, 405, { error: "此工作台不执行Agent或任务控制操作" });
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!/^[a-zA-Z0-9._-]+$/.test(name))
        return send(res, 404, { error: "不存在" });
      const path = join(dir, "public", name);
      if (!existsSync(path) || !statSync(path).isFile())
        return send(res, 404, { error: "不存在" });
      res.writeHead(200, {
        "Content-Type": MIME[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : readFileSync(path));
    } catch (error) {
      send(res, error.status || 400, { error: error.message || "读取失败" });
    }
  });
  server.on("listening", () => {
    tick = setInterval(() => {
      for (const c of clients) {
        try {
          const s = snapshot(c.id);
          if (s.revision !== c.revision) {
            c.revision = s.revision;
            c.res.write(`event: snapshot\ndata: ${JSON.stringify(s)}\n\n`);
          } else c.res.write(": heartbeat\n\n");
        } catch {
          c.res.write(
            `event: unavailable\ndata: ${JSON.stringify({ error: "来源暂不可读，请刷新或重新选择项目" })}\n\n`,
          );
        }
      }
    }, interval);
    tick.unref();
  });
  server.on("close", () => clearInterval(tick));
  server.closeWorkbench = () => {
    for (const c of clients) c.res.end();
    clients.clear();
    return new Promise((resolve) => server.close(resolve));
  };
  return server;
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Byte Workbench\nnode server.mjs [--port 4317] [--project /absolute/project] [--config /path/projects.json] [--no-discovery] [--demo]\n原生状态只读；展示与任务方案写所选项目的.byte-os/workboard.json。绑定127.0.0.1。",
    );
    process.exit(0);
  }
  const roots = args.flatMap((a, i) =>
    a === "--project" ? [args[i + 1]] : [],
  );
  const port = Number(
    args.includes("--port") ? args[args.indexOf("--port") + 1] : 4317,
  );
  const config = args.includes("--config")
    ? args[args.indexOf("--config") + 1]
    : undefined;
  const server = createWorkbench({
    roots,
    config,
    discover: !args.includes("--no-discovery"),
    demoOnly: args.includes("--demo"),
  });
  server.on("error", (e) => {
    console.error("Byte Workbench:", e.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Byte Workbench → http://localhost:${server.address().port}`),
  );
  process.on("SIGINT", () =>
    server.closeWorkbench().then(() => process.exit(0)),
  );
  process.on("SIGTERM", () =>
    server.closeWorkbench().then(() => process.exit(0)),
  );
}
