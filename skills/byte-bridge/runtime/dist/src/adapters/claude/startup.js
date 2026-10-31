import { randomUUID } from 'node:crypto';
import { nativeIndexPath, readSourcePointer } from '../../core/connections.js';
import { BindingService } from '../../core/bindings.js';
import { transaction } from '../../core/database.js';
import { digest } from '../../protocol/canonical.js';
const key = (signal) => 'claude-start:' + digest(signal);
function read(store, signal) { const row = store.db.prepare('SELECT holder FROM leases WHERE id=?').get(key(signal)); return row ? JSON.parse(String(row.holder)) : undefined; }
function write(store, signal, value) { store.db.prepare("INSERT INTO leases(id,holder,expires_at) VALUES (?,?,'9999-01-01T00:00:00Z') ON CONFLICT(id) DO UPDATE SET holder=excluded.holder").run(key(signal), JSON.stringify(value)); }
export function reserveClaudeStartup(store, signal, sid, event) {
    return transaction(store, () => {
        const prior = read(store, signal);
        if (prior && event === 'UserPromptSubmit' && (prior.sid !== sid || prior.state === 'ended'))
            throw new Error('Claude native startup session changed');
        if (prior?.sid === sid && prior.state !== 'ended') {
            const pointer = prior.state === 'ready' ? readSourcePointer(store.root, nativeIndexPath(store.root, signal)) : null, service = new BindingService(store), binding = pointer ? service.get(pointer.binding_id) : null;
            if ((prior.state === 'pending' && prior.pending_until > Date.now()) || (binding?.identity.native_session_id === sid && service.isUsable(binding.binding_id)))
                return { token: prior.token, start: false };
        }
        const next = { sid, token: randomUUID(), state: 'pending', pending_until: Date.now() + 60000 };
        write(store, signal, next);
        return { token: next.token, start: true };
    });
}
export function assertClaudeStartup(store, signal, token) { const current = read(store, signal); if (!current || current.token !== token || current.state === 'ended' || (current.state === 'pending' && current.pending_until <= Date.now()))
    throw new Error('Claude native startup superseded'); }
export function withClaudeStartup(store, signal, token, publish) { return transaction(store, () => { assertClaudeStartup(store, signal, token); const result = publish(), current = read(store, signal); write(store, signal, { ...current, state: 'ready' }); return result; }); }
export function endClaudeStartup(store, signal, sid) { transaction(store, () => { const current = read(store, signal); if (!current || current.sid === sid)
    write(store, signal, { sid, token: randomUUID(), state: 'ended', pending_until: 0 }); }); }
//# sourceMappingURL=startup.js.map