import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { hostname, homedir } from 'node:os';
import { realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcpClient } from './client.js';
import { digest } from '../../protocol/canonical.js';
import { openStore } from '../../core/database.js';
import { BindingService, issueEnrollment } from '../../core/bindings.js';
import { privateDirectory } from '../../core/private-paths.js';
import { privateWrite } from '../../install/apply.js';
import { startPluginSession, pluginWireText } from '../plugin-client.js';
import { invokeSourceTool, sourceToolSchema } from '../source-tool.js';
import { processBirth } from '../../cli/service.js';
export function isolatedAcpProfile(path) {
    const profile = realpathSync(path);
    if ([homedir(), join(homedir(), '.kimi-code'), join(homedir(), '.config/opencode'), join(homedir(), '.local/share/opencode')].some(p => p === profile))
        throw new Error('ACP host requires an explicit isolated profile');
    return profile;
}
export async function startAcpHost(options) {
    const root = realpathSync(options.root), profile = isolatedAcpProfile(options.profile);
    const client = new AcpClient(options), sessions = new Map(), pending = new Map();
    let closed = false, closing;
    const unsubscribe = client.onSettlement((method, id) => { if (method === 'session/prompt')
        for (const s of sessions.values())
            if (s.id === id)
                s.busy = false; });
    const expires = Date.now() + options.lifetime_seconds * 1000, store = openStore(root), generation = digest({ nonce: randomUUID(), profile });
    const dir = privateDirectory(root, ['.session-bridge', 'acp-hosts', generation]);
    const persist = (p) => privateWrite(join(dir, digest(p.envelope.message_id) + '.json'), JSON.stringify(p) + '\n');
    const usable = () => !closed && client.alive && Date.now() < expires;
    const connect = async (s) => {
        if (!usable() || sessions.get(s.token) !== s)
            throw new Error('Original native ACP session unavailable');
        if (s.handle)
            return s.handle;
        if (s.connecting)
            return s.connecting;
        s.connecting = (async () => {
            const setup = issueEnrollment(store), identity = { harness: options.harness, host_id: hostname(), profile_id: digest(profile), native_session_id: s.id, project_id: store.project_id, runtime_generation: generation };
            const h = await startPluginSession({ setup, native_proof: { binding_id: randomUUID(), identity, challenge_id: randomUUID(), response: randomUUID(), expires_at: new Date(Date.now() + 30000).toISOString() } }, { root, alias: s.alias, mode: 'managed', expires_at: new Date(expires).toISOString(), validateCurrent: () => usable() && sessions.get(s.token) === s, deliver: async (envelope) => {
                    if (!usable() || envelope.target.native_session_id !== s.id)
                        return { state: 'refused', reason: 'Original ACP session unavailable' };
                    if (pending.has(envelope.message_id))
                        return { state: 'uncertain', reason: 'Original message already recorded; reconcile without resending' };
                    if (Date.parse(envelope.expires_at) <= Date.now())
                        return { state: 'refused', reason: 'Message expired' };
                    const p = { envelope, state: 'queued' };
                    persist(p);
                    pending.set(envelope.message_id, p);
                    return { state: 'confirmed', native_receipt: options.harness + '-acp-local:' + envelope.message_id };
                } });
            if (!usable()) {
                await h.close();
                throw new Error('Original ACP owner closed during enrollment');
            }
            s.handle = h;
            return h;
        })();
        try {
            return await s.connecting;
        }
        finally {
            s.connecting = undefined;
        }
    };
    const requests = new Set();
    const server = createServer((req, res) => {
        const work = (async () => {
            try {
                if (req.method !== 'POST' || req.url !== '/source') {
                    res.writeHead(404).end();
                    return;
                }
                const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '', s = [...sessions.values()].find(s => Buffer.byteLength(s.token) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(s.token), Buffer.from(token)));
                if (!usable() || !s?.id) {
                    res.writeHead(403).end();
                    return;
                }
                let body = '';
                for await (const c of req) {
                    body += c.toString();
                    if (Buffer.byteLength(body) > 65536) {
                        res.writeHead(413).end();
                        return;
                    }
                }
                const input = sourceToolSchema.parse(JSON.parse(body)), h = await connect(s), result = await invokeSourceTool(h.connection_file, root, input, () => usable() && sessions.get(s.token) === s);
                if (input.method === 'report_result' && ['result_reported', 'verified', 'main_continued'].includes(result.state))
                    for (const p of pending.values())
                        if (p.envelope.task_id === input.params.task_id && p.envelope.target.native_session_id === s.id) {
                            p.state = 'completed';
                            persist(p);
                            await h.publish(p.envelope, 'completed');
                        }
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
            }
            catch {
                if (!res.headersSent)
                    res.writeHead(409);
                res.end(JSON.stringify({ error: 'Original native source or request rejected' }));
            }
        })();
        requests.add(work);
        void work.finally(() => requests.delete(work));
    });
    let watch;
    const close = () => closing ??= (async () => {
        closed = true;
        unsubscribe();
        if (watch)
            clearInterval(watch);
        for (const p of pending.values())
            if (p.state === 'queued' || p.state === 'submitting') {
                p.state = p.state === 'queued' ? 'cancelled' : 'uncertain';
                persist(p);
            }
        await client.close();
        server.closeAllConnections();
        await Promise.allSettled([...requests]);
        await Promise.allSettled([...sessions.values()].flatMap(s => s.connecting ? [s.connecting] : []));
        await Promise.all([...sessions.values()].flatMap(s => s.handle ? [s.handle.close()] : []));
        if (server.listening)
            await new Promise(r => server.close(() => r()));
        store.close();
    })();
    try {
        const info = await client.initialize();
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('Private ACP endpoint missing');
        const url = `http://127.0.0.1:${address.port}/source`, birth = await processBirth(client.pid);
        if (!birth)
            throw new Error('Native process identity missing');
        watch = setInterval(() => {
            if (!usable()) {
                void close();
                return;
            }
            for (const p of pending.values()) {
                if (p.state !== 'queued')
                    continue;
                const s = [...sessions.values()].find(s => s.id === p.envelope.target.native_session_id);
                if (!s?.handle || s.busy)
                    continue;
                if (!new BindingService(store).isUsable(s.handle.binding.binding_id) || store.db.prepare('SELECT task_id FROM task_cancellations WHERE task_id=?').get(p.envelope.task_id)) {
                    p.state = 'cancelled';
                    persist(p);
                    continue;
                }
                if (Date.parse(p.envelope.expires_at) <= Date.now()) {
                    p.state = 'expired';
                    persist(p);
                    continue;
                }
                s.busy = true;
                p.state = 'submitting';
                persist(p);
                void client.request('session/prompt', { sessionId: s.id, prompt: [{ type: 'text', text: pluginWireText(p.envelope) }] }).then(async () => { if (closed)
                    return; await s.handle.publish(p.envelope, 'accepted'); if (p.state === 'submitting') {
                    p.state = 'settled';
                    persist(p);
                } }).catch(() => { if (!closed && p.state === 'submitting') {
                    p.state = 'uncertain';
                    persist(p);
                } }).finally(() => { s.busy = client.hasPendingPrompt(s.id); });
            }
        }, 200);
        watch.unref();
        return { client, info, generation, mode: 'managed',
            async createSession(alias) {
                if (!usable() || sessions.size)
                    throw new Error('Only one native session per ACP host; use another isolated profile/process');
                const token = randomUUID() + randomUUID(), s = { id: '', token, alias, busy: false };
                sessions.set(token, s);
                try {
                    const result = await client.request('session/new', { cwd: root, mcpServers: [{ name: 'sessionbridge', command: process.execPath, args: [join(dirname(fileURLToPath(import.meta.url)), 'mcp.js')], env: [{ name: 'SESSIONBRIDGE_ACP_URL', value: url }, { name: 'SESSIONBRIDGE_ACP_TOKEN', value: token }, { name: 'SESSIONBRIDGE_ACP_PID', value: String(client.pid) }, { name: 'SESSIONBRIDGE_ACP_BIRTH', value: birth }] }] });
                    s.id = result.sessionId;
                    return { id: s.id, alias, mode: 'managed', configOptions: result.configOptions, modes: result.modes };
                }
                catch (error) {
                    sessions.delete(token);
                    throw error;
                }
            },
            async prompt(id, text) { const s = [...sessions.values()].find(s => s.id === id); if (!usable() || !s || s.busy)
                throw new Error('Original ACP session unavailable or busy'); s.busy = true; try {
                return await client.request('session/prompt', { sessionId: id, prompt: [{ type: 'text', text }] });
            }
            finally {
                s.busy = client.hasPendingPrompt(s.id);
            } },
            connected: () => [...sessions.values()].flatMap(s => s.handle ? [s.handle.binding] : []), close, };
    }
    catch (error) {
        await close();
        throw error;
    }
}
//# sourceMappingURL=host.js.map