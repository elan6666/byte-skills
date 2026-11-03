import { readFileSync, realpathSync, lstatSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
export const hash = (x) =>
  createHash("sha256")
    .update(typeof x === "string" || Buffer.isBuffer(x) ? x : canonical(x))
    .digest("hex");
export function canonical(x) {
  return JSON.stringify(sort(x));
}
function sort(x) {
  return Array.isArray(x)
    ? x.map(sort)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, sort(x[k])]),
        )
      : x;
}
export const identityKey = (x) => hash(x);
export function json(file, max = 4 * 1024 * 1024) {
  if (!statSync(file).isFile() || statSync(file).size > max)
    throw Error("文件超过读取上限");
  return JSON.parse(readFileSync(file, "utf8"));
}
export function inside(root, path) {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}
export function scoped(root, path) {
  const canonicalRoot = realpathSync(root),
    file = realpathSync(resolve(canonicalRoot, path));
  if (!inside(canonicalRoot, file)) throw Error("路径超出项目");
  return file;
}
export function rootPath(path) {
  const r = realpathSync(path);
  if (!lstatSync(r).isDirectory()) throw Error("请选择项目目录");
  return r;
}
export const text = (x, max = 500) =>
  typeof x === "string" ? x.slice(0, max) : "";
export function iso(x) {
  if (!x) return null;
  const d = new Date(typeof x === "number" && x < 1e11 ? x * 1000 : x);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
