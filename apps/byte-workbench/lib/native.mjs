import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { text, iso } from "./files.mjs";
function open(file) {
  if (!existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec("PRAGMA busy_timeout=300; PRAGMA query_only=ON;");
  return db;
}
function columns(db, table) {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name),
  );
}
export class NativeCatalog {
  constructor({ home = homedir(), enabled = true } = {}) {
    this.home = home;
    this.enabled = enabled;
    this.codex = join(home, ".codex/state_5.sqlite");
    this.zcode = join(home, ".zcode/cli/db/db.sqlite");
  }
  projects() {
    if (!this.enabled) return [];
    const result = [];
    let db;
    try {
      db = open(this.codex);
      if (db) {
        const cols = columns(db, "threads");
        if (cols.has("cwd")) {
          const hasProjects = columns(db, "project_roots").has("path");
          const named = hasProjects
            ? db
                .prepare(
                  "SELECT p.id,p.name,r.path FROM projects p JOIN project_roots r ON r.project_id=p.id ORDER BY r.position",
                )
                .all()
            : [];
          for (const row of named)
            result.push({
              nativeId: row.id,
              name: text(row.name),
              root: row.path,
              source: "codex-project",
            });
          for (const row of db
            .prepare(
              "SELECT cwd, max(updated_at) AS updated, count(*) AS count FROM threads WHERE archived=0 GROUP BY cwd ORDER BY updated DESC LIMIT 300",
            )
            .all())
            result.push({
              root: row.cwd,
              source: "codex-catalog",
              updated: iso(row.updated),
              count: row.count,
            });
        }
      }
    } catch {
    } finally {
      db?.close();
      db = null;
    }
    try {
      db = open(this.zcode);
      if (db && columns(db, "session").has("directory"))
        for (const row of db
          .prepare(
            "SELECT directory,max(time_updated) AS updated,count(*) AS count FROM session WHERE time_archived IS NULL AND time_deleted IS NULL GROUP BY directory LIMIT 300",
          )
          .all())
          result.push({
            root: row.directory,
            source: "zcode-catalog",
            updated: iso(row.updated),
            count: row.count,
          });
    } catch {
    } finally {
      db?.close();
      db = null;
    }
    return result;
  }
  sessions(root) {
    const result = [],
      warnings = [];
    if (!this.enabled) return { sessions: result, warnings };
    let db;
    try {
      db = open(this.codex);
      if (db) {
        const cols = columns(db, "threads");
        if (!cols.has("cwd")) throw Error("unsupported");
        const model = cols.has("model") ? "model" : "NULL AS model";
        const parent = cols.has("attached_thread_parent_id")
          ? "attached_thread_parent_id"
          : "NULL AS attached_thread_parent_id";
        // Desktop renames live in name; title can remain the first user prompt.
        const title = cols.has("name")
          ? "COALESCE(NULLIF(TRIM(name), ''), title) AS title"
          : "title";
        const rows = db
          .prepare(
            `SELECT id,${title},cwd,updated_at,${model},${parent} FROM threads WHERE cwd=? AND archived=0 ORDER BY updated_at DESC LIMIT 500`,
          )
          .all(root);
        const edges = columns(db, "thread_spawn_edges").has("parent_thread_id")
          ? db
              .prepare(
                "SELECT parent_thread_id,child_thread_id FROM thread_spawn_edges WHERE child_thread_id IN (SELECT id FROM threads WHERE cwd=? AND archived=0)",
              )
              .all(root)
          : [];
        const parents = new Map(
          edges.map((e) => [e.child_thread_id, e.parent_thread_id]),
        );
        for (const r of rows)
          result.push({
            nativeId: r.id,
            harness: "codex",
            title: text(r.title, 150) || "未命名对话",
            updatedAt: iso(r.updated_at),
            model: text(r.model) || null,
            modelSource: r.model ? "native metadata" : null,
            parentNativeId:
              parents.get(r.id) || r.attached_thread_parent_id || null,
            source: "codex-catalog",
            root,
          });
      }
    } catch {
      warnings.push("Codex 元数据暂不可读；不会据此推断会话状态。");
    } finally {
      db?.close();
      db = null;
    }
    try {
      db = open(this.zcode);
      if (db) {
        const cols = columns(db, "session");
        if (!cols.has("directory")) throw Error("unsupported");
        for (const r of db
          .prepare(
            "SELECT id,title,time_updated,parent_id FROM session WHERE directory=? AND time_archived IS NULL AND time_deleted IS NULL ORDER BY time_updated DESC LIMIT 500",
          )
          .all(root))
          result.push({
            nativeId: r.id,
            harness: "zcode",
            title: text(r.title, 150) || "未命名对话",
            updatedAt: iso(r.time_updated),
            model: null,
            modelSource: null,
            parentNativeId: r.parent_id || null,
            source: "zcode-catalog",
            root,
          });
      }
    } catch {
      warnings.push("Zcode 元数据暂不可读；不会据此推断会话状态。");
    } finally {
      db?.close();
    }
    return { sessions: result, warnings };
  }
}
