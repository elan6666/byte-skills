import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
export function privateDirectory(root, parts) {
    let path = realpathSync(root);
    for (const part of parts) {
        if (!part || part === '.' || part === '..' || /[\\/]/.test(part))
            throw new Error('Invalid private directory component');
        path = join(path, part);
        if (!existsSync(path))
            try {
                mkdirSync(path, { mode: 0o700 });
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
            }
        const info = lstatSync(path);
        if (info.isSymbolicLink() || !info.isDirectory() || realpathSync(path) !== path || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))
            throw new Error('Private state directory is not owned, local and mode 0700');
    }
    return path;
}
//# sourceMappingURL=private-paths.js.map