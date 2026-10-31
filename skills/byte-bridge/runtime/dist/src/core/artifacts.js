import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { readProject } from '../cli/init.js';
export async function verifyArtifact(root, ref) {
    try {
        if (!ref.relative_path || isAbsolute(ref.relative_path) || ref.relative_path.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/.test(ref.sha256))
            return false;
        if ((await readProject(root)).project_id !== ref.project_id)
            return false;
        const base = await realpath(root), path = await realpath(resolve(base, ref.relative_path)), rel = relative(base, path);
        if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || !(await stat(path)).isFile())
            return false;
        return createHash('sha256').update(await readFile(path)).digest('hex') === ref.sha256;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=artifacts.js.map