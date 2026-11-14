import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { digest } from '../protocol/canonical.js';
import { privateDirectory } from './private-paths.js';
function operatorPath(store) { return join(store.root, '.session-bridge', 'operator.json'); }
export function ensureOperator(store) {
    const path = operatorPath(store);
    let token;
    if (existsSync(path)) {
        const info = lstatSync(path);
        if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))
            throw new Error('Unsafe operator credential');
        token = String(JSON.parse(readFileSync(path, 'utf8')).token ?? '');
        if (!/^[a-f0-9]{64}$/.test(token))
            throw new Error('Invalid operator credential');
    }
    else {
        const dir = privateDirectory(store.root, ['.session-bridge']);
        token = randomBytes(32).toString('hex');
        writeFileSync(join(dir, 'operator.json'), JSON.stringify({ token, created_at: new Date().toISOString() }) + '\n', { mode: 0o600 });
    }
    return { token, actor: operatorActor(store, token) };
}
export function operatorActor(store, token) {
    return {
        binding_id: 'operator',
        session: { harness: 'operator', host_id: hostname(), profile_id: digest(store.root), native_session_id: 'operator', project_id: store.project_id, runtime_generation: 'operator:' + digest(token).slice(0, 16) },
        scope: { project_id: store.project_id, task_ids: ['*'], operations: ['say', 'delegate_task', 'get_task_status', 'reconcile', 'status'] }
    };
}
export function isOperator(store, token, claimed) {
    if (claimed.binding_id !== 'operator')
        return false;
    try {
        const expected = ensureOperator(store);
        return digest(expected.token) === digest(token) && digest(expected.actor) === digest(claimed);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=operator.js.map