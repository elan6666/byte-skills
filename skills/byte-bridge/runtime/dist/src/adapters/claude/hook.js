import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
const _sbDebug = (message) => { if (!process.env.SESSIONBRIDGE_DEBUG)
    return; try {
    appendFileSync(process.env.SESSIONBRIDGE_DEBUG, new Date().toISOString() + ' [' + process.pid + '] ' + message + '\n');
}
catch { /* debug only */ } };
import { privateDirectory } from '../../core/private-paths.js';
import { openStore, transaction } from '../../core/database.js';
import { BindingService, issueEnrollment } from '../../core/bindings.js';
import { digest } from '../../protocol/canonical.js';
import { createSourceConnection, claudeSignal, nativeIndexPath, readSourcePointer } from '../../core/connections.js';
import { readCodexOwner } from '../codex/version.js';
import { startClaudeChild } from './child-helper.js';
import { setTimeout as delay } from 'node:timers/promises';
import { assertClaudeStartup, endClaudeStartup, reserveClaudeStartup, withClaudeStartup } from './startup.js';
import { requireMinimumVersion } from '../version-policy.js';
function diagnostic(input, state, reason) { try {
    const root = realpathSync(input.cwd), dir = privateDirectory(root, ['.session-bridge', 'native-diagnostics']);
    writeFileSync(join(dir, 'claude-' + digest(input.session_id) + '.json'), JSON.stringify({ state, reason, session_id_sha256: digest(input.session_id), at: new Date().toISOString() }), { mode: 0o600 });
}
catch { /* Diagnostics never change native execution. */ } }
async function resolveNativeOwner(pid) {
    _sbDebug('resolve pid=' + pid);
    let owner;
    try {
        owner = await readCodexOwner(pid);
    }
    catch (error) {
        _sbDebug('readOwner failed pid=' + pid + ' ' + error.message.slice(0, 80));
    }
    if (owner && /(?:claude|claude\.exe)$/.test(owner.executable))
        return owner;
    try {
        const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 3000 }).trim();
        _sbDebug('cmd pid=' + pid + ' ' + command.slice(0, 120));
        const candidate = command.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, '') ?? '';
        let shim = null;
        if (candidate.includes('/')) {
            if (/(?:^|\/)claude(?:\.js|\.cjs)?$/.test(candidate) && existsSync(candidate))
                shim = candidate;
        }
        else if (/^claude(?:\.js|\.cjs)?$/.test(candidate)) {
            try {
                const found = execFileSync('which', [candidate.replace(/\.(?:js|cjs)$/, '')], { encoding: 'utf8', timeout: 3000 }).trim();
                if (found && existsSync(found))
                    shim = found;
            }
            catch { /* not on PATH */ }
        }
        const token = shim;
        if (token && existsSync(token)) {
            const shim = token.replace(/^['"]|['"]$/g, '');
            const started = owner?.started_at ?? execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 3000 }).trim();
            return { pid, started_at: started, executable: shim };
        }
    }
    catch { /* keep looking up the tree */ }
    return owner ?? null;
}
async function nativeOwner() {
    let pid = process.ppid;
    for (let i = 0; i < 12 && pid > 1; i++) {
        const owner = await resolveNativeOwner(pid);
        if (owner && /(?:claude|claude\.exe)$/.test(owner.executable))
            return owner;
        try {
            pid = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8', timeout: 3000 }).trim());
            _sbDebug('next pid=' + pid);
        }
        catch {
            _sbDebug('ppid failed');
            break;
        }
    }
    throw new Error('Original Claude owner is unavailable');
}
async function child(input) {
    _sbDebug('child:enter owner=' + String(Boolean(input.owner)) + ' token=' + String(Boolean(input.startup_token)));
    const root = realpathSync(input.cwd), store = openStore(root), socket = process.env.CLAUDE_CODE_MESSAGING_SOCKET;
    if (!socket || !input.owner || !input.startup_token) {
        store.close();
        throw new Error('Native inbox, owner or startup unavailable');
    }
    const token = input.startup_token;
    try {
        const original = await resolveNativeOwner(input.owner.pid);
        if (!original || digest(original) !== digest(input.owner))
            throw new Error('Native owner changed');
        const version = execFileSync(original.executable, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim().split(' ')[0];
        requireMinimumVersion('Claude', version, '2.1.306');
        const profile = realpathSync(process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME, '.claude')), signal = claudeSignal(socket), generation = digest({ signal, session_id: input.session_id, owner: original });
        const identity = { harness: 'claude', host_id: hostname(), profile_id: digest(profile), native_session_id: input.session_id, project_id: store.project_id, runtime_generation: generation };
        assertClaudeStartup(store, signal, token);
        const current = () => { try {
            assertClaudeStartup(store, signal, token);
            return readSourcePointer(root, nativeIndexPath(root, signal))?.binding_id === proof.binding_id;
        }
        catch {
            return false;
        } };
        const setup = issueEnrollment(store), proof = { binding_id: randomUUID(), challenge_id: randomUUID(), response: randomUUID(), identity, expires_at: new Date(Date.now() + 86400000).toISOString() };
        const handle = await startClaudeChild({ setup, native_proof: proof }, { root, host: { session_id: input.session_id, profile_id: identity.profile_id, runtime_generation: generation, transcript_path: input.transcript_path, cwd: root, version, owner: original }, validateCurrent: current });
        let source;
        try {
            await new BindingService(store).enroll(setup, handle.binding, () => assertClaudeStartup(store, signal, token));
            source = withClaudeStartup(store, signal, token, () => createSourceConnection(store, handle.binding, signal));
        }
        catch (error) {
            await handle.close();
            throw error;
        }
        const reference = JSON.parse(handle.binding.endpoint_ref);
        writeFileSync(reference.reference_file + '.ready', JSON.stringify({ binding_id: handle.binding.binding_id, session_id: input.session_id, connection_file: source.connection_file }), { mode: 0o600 });
        let closing = false;
        const close = async () => { if (closing)
            return; closing = true; clearInterval(watch); source.close(); await handle.close(); store.close(); process.exitCode = 0; };
        const watch = setInterval(() => { try {
            if (!current() || digest(claudeSignal(socket)) !== digest(signal))
                void close();
        }
        catch {
            void close();
        } }, 1000);
        watch.unref();
        process.once('SIGTERM', () => void close());
        process.once('SIGINT', () => void close());
    }
    catch (error) {
        store.close();
        throw error;
    }
}
export async function claudeSessionStart(input) {
    _sbDebug('start:' + String(input.hook_event_name) + ' socket=' + String(Boolean(process.env.CLAUDE_CODE_MESSAGING_SOCKET)) + ' token=' + String(Boolean(process.env.CLAUDE_CODE_MESSAGING_TOKEN)) + ' transcript=' + String(Boolean(input.transcript_path)));
    if (!['SessionStart', 'SessionEnd', 'UserPromptSubmit'].includes(input.hook_event_name) || !input.session_id)
        return;
    if (!process.env.CLAUDE_CODE_MESSAGING_SOCKET) {
        diagnostic(input, 'blocked', 'native_messaging_socket_unavailable');
        return;
    }
    try {
        readFileSync(join(input.cwd, '.session-bridge', 'project.json'));
    }
    catch {
        return;
    }
    const signal = claudeSignal(process.env.CLAUDE_CODE_MESSAGING_SOCKET), store = openStore(input.cwd);
    let reservation;
    try {
        const prior = readSourcePointer(store.root, nativeIndexPath(store.root, signal)), service = new BindingService(store), binding = prior ? service.get(prior.binding_id) : null;
        if (input.hook_event_name === 'SessionEnd') {
            endClaudeStartup(store, signal, input.session_id);
            if (binding?.identity.native_session_id === input.session_id)
                store.db.prepare('UPDATE bindings SET active=0 WHERE binding_id=?').run(binding.binding_id);
            return;
        }
        if (input.hook_event_name === 'UserPromptSubmit' && binding && service.isUsable(binding.binding_id) && binding.identity.native_session_id !== input.session_id) {
            diagnostic(input, 'blocked', 'native_prompt_session_changed');
            return;
        }
        if (binding?.identity.native_session_id === input.session_id && service.isUsable(binding.binding_id))
            return;
        reservation = reserveClaudeStartup(store, signal, input.session_id, input.hook_event_name);
        if (reservation.start && binding)
            transaction(store, () => { assertClaudeStartup(store, signal, reservation.token); store.db.prepare('UPDATE bindings SET active=0 WHERE binding_id=?').run(binding.binding_id); });
    }
    finally {
        store.close();
    }
    _sbDebug('reserved start=' + String(reservation?.start));
    if (!input.transcript_path || !process.env.CLAUDE_CODE_MESSAGING_TOKEN || !reservation)
        return;
    if (reservation.start) {
        _sbDebug('spawn:begin');
        diagnostic(input, 'starting', 'native_inbox_available');
        const owner = await nativeOwner(), checkStore = openStore(input.cwd);
        try {
            assertClaudeStartup(checkStore, signal, reservation.token);
        }
        finally {
            checkStore.close();
        }
        const processChild = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child'], { cwd: input.cwd, env: process.env, stdio: ['pipe', 'ignore', 'ignore'], detached: true });
        processChild.stdin.end(JSON.stringify({ ...input, owner, startup_token: reservation.token }));
        processChild.unref();
        _sbDebug('spawn:pid=' + String(processChild.pid));
    }
    // A warm conversation already has a transcript. Wait for its private child so
    // the first model tool after native /reload-plugins sees the new connection.
    // SessionStart stays nonblocking because the native first transcript write can
    // happen only after that hook returns.
    if (input.hook_event_name === 'UserPromptSubmit') {
        const readyStore = openStore(input.cwd);
        try {
            const end = Date.now() + 5000;
            while (Date.now() < end) {
                const pointer = readSourcePointer(readyStore.root, nativeIndexPath(readyStore.root, signal)), binding = pointer ? new BindingService(readyStore).get(pointer.binding_id) : null;
                if (binding?.identity.native_session_id === input.session_id && new BindingService(readyStore).isUsable(binding.binding_id))
                    return;
                await delay(50);
            }
            diagnostic(input, 'blocked', 'native_child_not_ready');
        }
        finally {
            readyStore.close();
        }
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    let parsedInput;
    try {
        const raw = readFileSync(0, 'utf8');
        if (Buffer.byteLength(raw) > 65536)
            throw new Error('Oversized hook context');
        const input = JSON.parse(raw);
        parsedInput = input;
        if (process.argv.includes('--child'))
            await child(input);
        else
            await claudeSessionStart(input);
    }
    catch (error) {
        _sbDebug('ERR ' + (error instanceof Error ? (error.stack ?? error.message) : String(error)));
        try {
            if (parsedInput)
                diagnostic(parsedInput, 'failed', error instanceof Error ? error.message.slice(0, 200) : 'native_child_failed');
        }
        catch { /* stdin already consumed */ }
        process.stderr.write('SessionBridge: native child enrollment unavailable; run doctor before delegating.\n');
        process.exitCode = 1;
    }
}
//# sourceMappingURL=hook.js.map