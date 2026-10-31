import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { BridgeError } from '../protocol/errors.js';
export async function scopedFile(root, path, maxBytes = 1024 * 1024) {
    const base = await realpath(root), target = await realpath(resolve(base, path)), rel = relative(base, target), info = await stat(target);
    if (isAbsolute(path) || !rel || rel === '..' || rel.startsWith('../') || !info.isFile() || info.size > maxBytes)
        throw new BridgeError('file_scope_denied', '文件超出当前项目或读取大小限制', '提供项目内的相对路径', 3);
    return readFile(target);
}
export async function artifactRefs(root, project_id, paths) { return Promise.all(paths.map(async (relative_path) => ({ project_id, relative_path, sha256: createHash('sha256').update(await scopedFile(root, relative_path, 64 * 1024 * 1024)).digest('hex') }))); }
//# sourceMappingURL=scoped-files.js.map