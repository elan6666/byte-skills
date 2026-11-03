import { basename, join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { hash, json, rootPath } from "./files.mjs";
export class ProjectCatalog {
  constructor(
    native,
    {
      config = join(homedir(), ".config/byte-workbench/projects.json"),
      roots = [],
    } = {},
  ) {
    this.native = native;
    this.config = config;
    this.roots = roots;
    this.current = new Map();
  }
  list() {
    const records = [];
    try {
      if (existsSync(this.config)) records.push(...json(this.config).projects);
    } catch {}
    records.push(
      ...this.roots.map((root) => ({ root, pinned: true })),
      ...this.native.projects(),
    );
    const unique = new Map(),
      counts = new Map();
    for (const r of records) {
      try {
        const root = rootPath(r.root);
        if (root === homedir() || root === "/") continue;
        const id = hash(root).slice(0, 24),
          prior = unique.get(id);
        const sourceCounts = counts.get(id) || new Map();
        if (r.count)
          sourceCounts.set(
            r.source,
            Math.max(sourceCounts.get(r.source) || 0, r.count),
          );
        counts.set(id, sourceCounts);
        const count = [...sourceCounts.values()].reduce((a, b) => a + b, 0);
        if (prior) {
          prior.count = count;
          prior.pinned ||= !!r.pinned;
          if (r.updated && (!prior.updatedAt || r.updated > prior.updatedAt))
            prior.updatedAt = r.updated;
          continue;
        }
        unique.set(id, {
          id,
          root,
          name: r.name || basename(root),
          source: r.source || "configured",
          pinned: !!r.pinned,
          count,
          updatedAt: r.updated || null,
          bridge: existsSync(join(root, ".session-bridge/project.json")),
          workflow: existsSync(join(root, ".byte-os/coordination/state.json")),
        });
      } catch {}
    }
    this.current = unique;
    return [...unique.values()].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        Number(b.bridge) - Number(a.bridge) ||
        Number(b.workflow) - Number(a.workflow) ||
        (b.updatedAt || "").localeCompare(a.updatedAt || ""),
    );
  }
  get(id) {
    if (!this.current.size) this.list();
    const p = this.current.get(id);
    if (!p) throw Error("项目未登记");
    return p;
  }
  add(path, name) {
    const root = rootPath(path);
    if (root === homedir() || root === "/")
      throw Error("请选择具体项目，不使用整个主目录或系统根目录");
    let settings = { projects: [] };
    if (existsSync(this.config)) settings = json(this.config);
    if (!settings.projects.some((p) => p.root === root))
      settings.projects.push({
        root,
        name: typeof name === "string" ? name.slice(0, 100) : basename(root),
        pinned: true,
      });
    mkdirSync(join(this.config, ".."), { recursive: true, mode: 0o700 });
    const temp = this.config + ".tmp";
    writeFileSync(temp, JSON.stringify(settings, null, 2), { mode: 0o600 });
    renameSync(temp, this.config);
    this.list();
    return this.get(hash(root).slice(0, 24));
  }
}
