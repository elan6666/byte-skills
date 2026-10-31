import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { hostname } from 'node:os';
import { realpathSync, openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ZCodeRpc } from './rpc.js';
import { openStore } from '../../core/database.js';
import { BindingService, issueEnrollment } from '../../core/bindings.js';
import { startPluginSession, pluginWireText } from '../plugin-client.js';
import { invokeSourceTool } from '../source-tool.js';
import { digest } from '../../protocol/canonical.js';
import { privateDirectory } from '../../core/private-paths.js';
import { BridgeError } from '../../protocol/errors.js';
function infoOf(message) { return (message.info ?? {}); }
export function nativeUserMessageId(messages, text) {
    const message = messages.find(m => infoOf(m).role === 'user' && Array.isArray(m.parts) && m.parts.some(p => p?.type === 'text' && p.text === text));
    const id = message && (infoOf(message).messageId ?? infoOf(message).id);
    return typeof id === 'string' ? id : undefined;
}
export function nativeDeliveryState(snapshot, text, savedId) {
    const id = savedId ?? nativeUserMessageId(snapshot.messages, text);
    if (!id)
        return null;
    const completed = snapshot.messages.some(m => { const info = infoOf(m); return info.role === 'assistant' && (info.parentMessageId ?? info.parentID) === id && info.finish === 'stop' && !info.error && Array.isArray(m.parts) && m.parts.some(p => p?.type === 'text' && typeof p.text === 'string' && p.text.trim()); });
    return completed ? 'completed' : 'accepted';
}
function persistOutbox(p) {
    const tmp = p.file + '.' + randomUUID() + '.tmp', fd = openSync(tmp, 'wx', 0o600);
    try {
        writeSync(fd, JSON.stringify({ state: p.state, envelope: p.envelope, native_user_id: p.native_user_id }));
        fsyncSync(fd);
    }
    finally {
        closeSync(fd);
    }
    try {
        renameSync(tmp, p.file);
        const parent = openSync(dirname(p.file), 'r');
        try {
            fsyncSync(parent);
        }
        finally {
            closeSync(parent);
        }
    }
    finally {
        try {
            unlinkSync(tmp);
        }
        catch { /* Renamed atomically. */ }
    }
}
export async function startZCodeHost(options) {
    const root = realpathSync(options.root), profile = realpathSync(options.profile), rpc = new ZCodeRpc({ ...options, root, profile });
    try {
        await rpc.request('runtime/capabilities', {});
    }
    catch (error) {
        await rpc.close();
        throw error;
    }
    const generation = digest({ pid: rpc.pid, version: rpc.version, sha256: rpc.binarySha256, nonce: randomUUID() }), sessions = new Map(), pending = new Map();
    let closed = false, ticking, closing;
    const requests = new Set();
    let stateStore, server, timer;
    const close = () => {
        if (closing)
            return closing;
        closed = true;
        if (timer)
            clearInterval(timer);
        closing = (async () => {
            const failures = [];
            for (const p of pending.values())
                if (p.state === 'queued') {
                    p.state = 'cancelled';
                    try {
                        persistOutbox(p);
                    }
                    catch (error) {
                        failures.push(error);
                    }
                }
            const stopped = rpc.close();
            server?.closeAllConnections();
            const drained = await Promise.allSettled([stopped, ...requests, ...[...sessions.values()].flatMap(s => s.connecting ? [s.connecting] : []), ...(ticking ? [ticking] : [])]);
            if (drained[0]?.status === 'rejected')
                failures.push(drained[0].reason);
            for (const result of await Promise.allSettled([...sessions.values()].flatMap(s => s.handle ? [s.handle.close()] : [])))
                if (result.status === 'rejected')
                    failures.push(result.reason);
            try {
                if (server?.listening)
                    await new Promise(resolve => server.close(() => resolve()));
            }
            finally {
                stateStore?.close();
            }
            if (failures.length)
                throw new AggregateError(failures, 'ZCode shutdown cleanup failed');
        })();
        return closing;
    };
    try {
        const dir = privateDirectory(root, ['.session-bridge', 'zcode-hosts', generation]);
        stateStore = openStore(root);
        const persist = persistOutbox;
        const read = async (id) => { if (!sessions.has(id) || !rpc.alive || closed)
            throw new BridgeError('zcode_session_unavailable', 'Original ZCode session generation is unavailable', 'Reconnect this exact native host; no resume fallback', 3); const s = await rpc.request('session/read', { sessionId: id, messageLimit: 100 }); if (s.session.sessionId !== id || realpathSync(s.session.workspace.workspacePath) !== root)
            throw new Error('ZCode native identity or workspace mismatch'); return s; };
        const connect = async (session) => {
            await read(session.id);
            if (closed)
                throw new Error('ZCode host closed');
            if (session.handle)
                return session.handle;
            if (session.connecting)
                return session.connecting;
            session.connecting = (async () => {
                const store = openStore(root), setup = issueEnrollment(store), identity = { harness: 'zcode', host_id: hostname(), profile_id: digest(profile), native_session_id: session.id, project_id: store.project_id, runtime_generation: generation };
                store.close();
                const handle = await startPluginSession({ setup, native_proof: { binding_id: randomUUID(), identity, challenge_id: randomUUID(), response: randomUUID(), expires_at: new Date(Date.now() + 30000).toISOString() } }, { root, alias: session.alias, mode: 'managed', validateCurrent: () => !closed && rpc.alive && sessions.get(session.id) === session, deliver: async (envelope) => {
                        await read(session.id);
                        if (closed)
                            return { state: 'refused', reason: 'Original ZCode host closed' };
                        if (pending.has(envelope.message_id))
                            return { state: 'uncertain', reason: 'Original message already queued; reconcile without resending' };
                        if (Date.parse(envelope.expires_at) <= Date.now())
                            return { state: 'refused', reason: 'Task expired before native submission' };
                        const entry = { envelope, state: 'queued', file: join(dir, digest(envelope.message_id) + '.json') };
                        persist(entry);
                        pending.set(envelope.message_id, entry);
                        return { state: 'confirmed', native_receipt: 'zcode-local-queue:' + envelope.message_id };
                    } });
                if (closed || !rpc.alive) {
                    await handle.close();
                    throw new Error('ZCode host closed during enrollment');
                }
                session.handle = handle;
                return handle;
            })();
            try {
                return await session.connecting;
            }
            finally {
                session.connecting = undefined;
            }
        };
        const handleRequest = async (req, res) => {
            try {
                if (req.method !== 'POST' || req.url !== '/source') {
                    res.writeHead(404).end();
                    return;
                }
                const auth = req.headers.authorization?.replace(/^Bearer /, '') ?? '', session = [...sessions.values()].find(s => s.token.length === auth.length && timingSafeEqual(Buffer.from(s.token), Buffer.from(auth)));
                if (!session) {
                    res.writeHead(403).end();
                    return;
                }
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > 65536) {
                        res.writeHead(413).end();
                        return;
                    }
                    chunks.push(chunk);
                }
                const data = z.strictObject({ session_id: z.string(), request: z.unknown() }).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
                if (data.session_id !== session.id)
                    throw new Error('Native source mismatch');
                const h = await connect(session), result = await invokeSourceTool(h.connection_file, root, data.request, () => !closed && rpc.alive && sessions.get(session.id) === session);
                res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
            }
            catch (error) {
                res.writeHead(409, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: error instanceof BridgeError ? error.code : 'zcode_source_rejected', message: error instanceof BridgeError ? error.message : 'Native source or operation could not be verified' } }));
            }
        };
        server = createServer((req, res) => { const request = handleRequest(req, res); requests.add(request); void request.finally(() => requests.delete(request)); });
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        const address = server.address();
        if (!address || typeof address === 'string')
            throw new Error('ZCode connector address unavailable');
        const url = `http://127.0.0.1:${address.port}/source`;
        const tick = async () => {
            if (closed || ticking)
                return;
            ticking = (async () => {
                for (const p of pending.values()) {
                    if (closed)
                        break;
                    if (['completed', 'expired', 'cancelled'].includes(p.state))
                        continue;
                    const session = sessions.get(p.envelope.target.native_session_id);
                    if (!session?.handle)
                        continue;
                    try {
                        let snapshot = await read(session.id);
                        if (closed)
                            break;
                        const text = pluginWireText(p.envelope);
                        p.native_user_id ??= nativeUserMessageId(snapshot.messages, text);
                        // The native messages endpoint supports a complete history read. Reconcile beyond
                        // the UI tail without guessing from a later turn or inflating its fixed window.
                        if (p.state !== 'queued' && (!p.native_user_id || !snapshot.messages.some(m => (infoOf(m).parentMessageId ?? infoOf(m).parentID) === p.native_user_id && infoOf(m).finish === 'stop'))) {
                            const history = await rpc.request('session/messages', { sessionId: session.id });
                            if (closed)
                                break;
                            snapshot = { ...snapshot, messages: history.messages };
                            p.native_user_id ??= nativeUserMessageId(history.messages, text);
                        }
                        if (p.native_user_id)
                            persist(p);
                        const seen = nativeDeliveryState(snapshot, text, p.native_user_id);
                        if (seen) {
                            if (p.state !== 'accepted' && p.state !== 'completed')
                                await session.handle.publish(p.envelope, 'accepted');
                            if (seen === 'completed') {
                                await session.handle.publish(p.envelope, 'completed');
                                p.state = 'completed';
                            }
                            else
                                p.state = 'accepted';
                            persist(p);
                            continue;
                        }
                        if (p.state !== 'queued')
                            continue;
                        if (!new BindingService(stateStore).isUsable(session.handle.binding.binding_id) || stateStore.db.prepare('SELECT task_id FROM task_cancellations WHERE task_id=?').get(p.envelope.task_id)) {
                            p.state = 'cancelled';
                            persist(p);
                            continue;
                        }
                        if (Date.parse(p.envelope.expires_at) <= Date.now()) {
                            p.state = 'expired';
                            persist(p);
                            continue;
                        }
                        if (snapshot.projection.status !== 'idle')
                            continue;
                        if (closed)
                            break;
                        p.state = 'submitting';
                        persist(p);
                        try {
                            snapshot = await rpc.request('session/send', { sessionId: session.id, inputId: p.envelope.message_id, queryId: p.envelope.message_id, content: pluginWireText(p.envelope) });
                            p.native_user_id ??= nativeUserMessageId(snapshot.messages, text);
                            persist(p);
                            if (!closed && nativeDeliveryState(snapshot, text, p.native_user_id))
                                await session.handle.publish(p.envelope, 'accepted');
                        }
                        catch {
                            p.state = 'uncertain';
                            persist(p);
                        }
                    }
                    catch { /* Original host offline or busy. Preserve the same message, never resume/retry. */ }
                }
            })();
            try {
                await ticking;
            }
            finally {
                ticking = undefined;
            }
        };
        timer = setInterval(() => void tick(), 500);
        timer.unref();
        return { rpc, mode: 'managed', generation,
            async createSession(input) {
                if (closed || [...sessions.values()].some(s => s.alias === input.alias))
                    throw new Error('ZCode host closed or alias already in use');
                const id = 'sess_' + randomUUID(), session = { id, alias: input.alias, token: randomUUID() + randomUUID() };
                sessions.set(id, session);
                const mcp = join(dirname(fileURLToPath(import.meta.url)), 'mcp.js');
                try {
                    const snapshot = await rpc.request('session/create', { sessionId: id, workspace: { workspacePath: root, workspaceKey: digest(root) }, mode: input.mode, titleGenerationEnabled: false, ...(input.model ? { model: input.model, ...(input.model.options?.reasoningLevel ? { thoughtLevel: input.model.options.reasoningLevel } : {}) } : {}), mcpServers: [{ name: 'sessionbridge', command: process.execPath, args: [mcp], isolation: 'session', env: [{ name: 'SESSIONBRIDGE_ZCODE_URL', value: url }, { name: 'SESSIONBRIDGE_ZCODE_TOKEN', value: session.token }, { name: 'SESSIONBRIDGE_ZCODE_SESSION', value: id }, { name: 'SESSIONBRIDGE_ZCODE_PID', value: String(rpc.pid) }] }] });
                    if (snapshot.session.sessionId !== id)
                        throw new Error('Native creation returned another session');
                    return { id, alias: session.alias, mode: 'managed' };
                }
                catch (error) {
                    sessions.delete(id);
                    throw error;
                }
            },
            read,
            async prompt(id, text) { await read(id); if (closed)
                throw new Error('ZCode host closed'); return rpc.request('session/send', { sessionId: id, inputId: randomUUID(), content: text }); },
            connected() { return [...sessions.values()].filter(s => s.handle).map(s => s.handle.binding); },
            close, };
    }
    catch (error) {
        await close();
        throw error;
    }
}
//# sourceMappingURL=host.js.map