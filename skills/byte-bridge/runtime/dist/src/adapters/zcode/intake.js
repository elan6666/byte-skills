import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { lstatSync, realpathSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { processBirth } from '../../cli/service.js';
import { DEFAULT_ZCODE_BINARY } from './rpc.js';
const exec = promisify(execFile);
// Read only the exact current tool challenge. No session ID is accepted from
// model arguments, no native database write or session resume is involved.
export function resolveNativeChallenge(file, root, challenge, toolName = 'sessionbridge_attach') {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()))
        throw new Error('Unsafe native history');
    const db = new DatabaseSync(file, { readOnly: true });
    try {
        const matches = db.prepare("SELECT p.id part_id,p.session_id,s.directory FROM part p JOIN message m ON m.id=p.message_id AND m.session_id=p.session_id JOIN session s ON s.id=p.session_id WHERE json_extract(m.data,'$.role')='assistant' AND json_extract(p.data,'$.type')='tool' AND json_extract(p.data,'$.state.input.challenge')=? AND substr(json_extract(p.data,'$.tool'), -?)=? AND p.time_created>=? AND s.time_archived IS NULL AND s.time_deleted IS NULL GROUP BY p.session_id LIMIT 3").all(challenge, toolName.length + 2, '__' + toolName, Date.now() - 60000);
        const valid = matches.filter(row => { try {
            return realpathSync(String(row.directory)) === realpathSync(root);
        }
        catch {
            return false;
        } });
        if (valid.length !== 1)
            return null;
        const row = valid[0];
        return { session_id: String(row.session_id), part_id: String(row.part_id) };
    }
    finally {
        db.close();
    }
}
export function nativeSessionExists(file, root, id) {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
        const row = db.prepare('SELECT directory FROM session WHERE id=? AND time_archived IS NULL AND time_deleted IS NULL').get(id);
        return Boolean(row && realpathSync(String(row.directory)) === realpathSync(root));
    }
    catch {
        return false;
    }
    finally {
        db.close();
    }
}
export async function originalZCodeOwner() {
    if (!existsSync(DEFAULT_ZCODE_BINARY))
        throw new Error('Original native ZCode runtime unavailable');
    const binary = realpathSync(DEFAULT_ZCODE_BINARY), sha256 = createHash('sha256').update(readFileSync(binary)).digest('hex');
    if (sha256 !== '97490d0f06a7a225d54d47817acf4b4859cdb268b59f2490caaeda982bef063a')
        throw new Error('Uncertified native ZCode artifact; retest before attaching');
    let pid = process.ppid;
    for (let n = 0; n < 16 && pid > 1; n++) {
        const command = (await exec('ps', ['-p', String(pid), '-o', 'command='], { timeout: 2000, maxBuffer: 16384 })).stdout.trim();
        const nativeDb = join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite');
        let ownsNativeDatabase = false;
        if (existsSync(nativeDb)) {
            try {
                const files = (await exec('lsof', ['-a', '-p', String(pid), '-Ffan', '--', nativeDb], { timeout: 2000, maxBuffer: 16384 })).stdout;
                ownsNativeDatabase = files.split(/\nf/).some(record => /\na[uw]\n/.test(record) && record.includes('n' + realpathSync(nativeDb)));
            }
            catch { /* Not an owner of this exact native database. */ }
        }
        if ((command.includes(binary) && /\bapp-server\b/.test(command)) || ownsNativeDatabase) {
            const started_at = await processBirth(pid);
            if (!started_at)
                break;
            return { pid, started_at, binary, sha256 };
        }
        pid = Number((await exec('ps', ['-p', String(pid), '-o', 'ppid='], { timeout: 2000 })).stdout.trim());
    }
    throw new Error('Original native ZCode runtime required; external callers cannot attach');
}
//# sourceMappingURL=intake.js.map