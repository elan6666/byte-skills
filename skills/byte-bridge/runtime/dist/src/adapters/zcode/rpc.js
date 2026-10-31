import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeError } from '../../protocol/errors.js';
const exec = promisify(execFile);
export const DEFAULT_ZCODE_BINARY = '/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
export const ZCODE_METHODS = new Set(['runtime/capabilities', 'session/create', 'session/read', 'session/send', 'session/messages', 'session/events', 'session/subscribe']);
export class ZCodeRpc {
    options;
    child = null;
    ready = null;
    serial = 0;
    closed = false;
    closing = null;
    ownedMembers = new Map();
    pending = new Map();
    trace = [];
    notifications = [];
    version = '';
    binarySha256 = '';
    constructor(options) {
        this.options = options;
    }
    get pid() { return this.child?.pid ?? 0; }
    get alive() { return !this.closed && Boolean(this.child && this.child.exitCode === null && this.child.signalCode === null); }
    fail(error) { for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(error);
    } this.pending.clear(); }
    start() {
        if (this.ready)
            return this.ready;
        this.ready = (async () => {
            if (this.closed)
                throw new Error('ZCode runtime closed');
            const profile = realpathSync(this.options.profile);
            if (profile === realpathSync(homedir()))
                throw new BridgeError('zcode_profile_not_isolated', 'ZCode host requires an isolated profile home', 'Choose a dedicated profile directory; the active user home is never launched', 3);
            const binary = realpathSync(this.options.binary);
            const builtin = join(dirname(binary), '../config/provider/zcode-builtin.json');
            if (!existsSync(builtin))
                throw new BridgeError('zcode_resources_missing', 'ZCode bundled provider resource is missing', 'Use the complete desktop-bundled runtime, not a copied script', 3);
            const env = {};
            for (const k of ['PATH', 'LANG', 'TMPDIR', 'USER', 'LOGNAME'])
                if (process.env[k])
                    env[k] = process.env[k];
            Object.assign(env, { HOME: profile, USERPROFILE: profile, ZCODE_DATA_BASE_DIR: profile, ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: realpathSync(builtin), ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(profile, '.zcode/v2/provider_config.json'), ZCODE_STORAGE_DIR: join(profile, '.zcode/cli'), ZCODE_LOG_DIR: join(profile, '.zcode/cli/logs') });
            const version = (await exec(process.execPath, [binary, '--version'], { timeout: 10000, env, cwd: this.options.root })).stdout.trim();
            if (version !== '0.17.0')
                throw new BridgeError('zcode_version_drift', 'Uncertified ZCode version: ' + version, 'Retest this exact native runtime in isolated sessions', 3);
            this.version = version;
            this.binarySha256 = createHash('sha256').update(readFileSync(binary)).digest('hex');
            if (this.closed)
                throw new Error('ZCode runtime closed');
            this.child = spawn(process.execPath, [binary, 'app-server', '--stdio'], { cwd: this.options.root, env, stdio: 'pipe', detached: true });
            await this.captureOwnedGroup(true);
            let buffer = Buffer.alloc(0);
            this.child.stdout.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                if (buffer.length > 16 * 1024 * 1024) {
                    this.fail(new Error('ZCode frame too large'));
                    void this.close();
                    return;
                }
                let end;
                while ((end = buffer.indexOf(10)) >= 0) {
                    const line = buffer.subarray(0, end);
                    buffer = buffer.subarray(end + 1);
                    if (!line.length)
                        continue;
                    try {
                        const m = JSON.parse(line.toString('utf8'));
                        if (m.method && m.id !== undefined) {
                            this.child.stdin.write(JSON.stringify(m.method === 'session/requestRuntimePreferences' ? { id: m.id, result: { nativeSearchEnhancementsEnabled: false, memoryEnabled: false, toolSearchMode: 'off', askUserQuestionAutoResolutionEnabled: false } } : { id: m.id, error: { code: -32601, message: 'SessionBridge does not approve native permissions' } }) + '\n');
                            continue;
                        }
                        if (m.method) {
                            this.notifications.push(m);
                            if (this.notifications.length > 64)
                                this.notifications.shift();
                            continue;
                        }
                        const p = m.id === undefined ? undefined : this.pending.get(m.id);
                        if (!p)
                            continue;
                        clearTimeout(p.timer);
                        this.pending.delete(m.id);
                        if (m.error)
                            p.reject(new BridgeError('zcode_rpc_refused', 'Native ZCode RPC refused, code ' + m.error.code, 'Inspect original runtime state; no resume or retry was attempted', 3));
                        else
                            p.resolve(m.result);
                    }
                    catch {
                        this.fail(new Error('Invalid ZCode native frame'));
                        void this.close();
                    }
                }
            });
            this.child.stderr.resume();
            this.child.stdin.on('error', () => this.fail(new Error('ZCode input closed; reconcile uncertain writes')));
            this.child.once('error', () => this.fail(new Error('ZCode runtime failed to start')));
            this.child.once('exit', () => this.fail(new Error('ZCode runtime exited; reconnect a new generation')));
        })();
        return this.ready;
    }
    async request(method, params) {
        if (!ZCODE_METHODS.has(method))
            throw new Error('ZCode method forbidden: ' + method);
        if (this.closed)
            throw new Error('ZCode runtime closed');
        await this.start();
        if (!this.alive)
            throw new Error('ZCode original runtime unavailable');
        this.trace.push(method);
        const id = ++this.serial, line = JSON.stringify({ id, method, params }) + '\n';
        if (Buffer.byteLength(line) > 1024 * 1024)
            throw new Error('ZCode request too large');
        return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new BridgeError('zcode_timeout', 'Native ZCode outcome uncertain', 'Reconcile the original message ID; do not resend', 5)); }, 20000); this.pending.set(id, { resolve, reject, timer }); this.child.stdin.write(line); });
    }
    async captureOwnedGroup(initial = false) {
        const pid = this.child?.pid;
        if (!pid)
            return [];
        const { stdout } = await exec('ps', ['-axo', 'pid=,pgid=,stat=,lstart='], { timeout: 3000 });
        const members = stdout.split('\n').flatMap(line => { const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/); return m && Number(m[2]) === pid && !m[3].includes('Z') ? [{ pid: Number(m[1]), birth: m[4] }] : []; });
        const anchored = members.some(m => this.ownedMembers.get(m.pid) === m.birth) || (initial && members.some(m => m.pid === pid));
        if (!anchored)
            return [];
        for (const m of members)
            this.ownedMembers.set(m.pid, m.birth);
        return members.map(m => m.pid);
    }
    close() {
        if (this.closing)
            return this.closing;
        this.closed = true;
        this.fail(new Error('ZCode runtime closed'));
        this.closing = (async () => {
            // start may still be validating a version. It must not spawn after close returns.
            await this.ready?.catch(() => { });
            const c = this.child;
            if (!c)
                return;
            let members = await this.captureOwnedGroup();
            c.stdin.end();
            for (let n = 0; n < 10 && members.length; n++) {
                await delay(100);
                members = await this.captureOwnedGroup();
            }
            for (const signal of ['SIGTERM', 'SIGKILL']) {
                if (!members.length)
                    break;
                // A member with the same PID and birth time anchors this original detached group.
                try {
                    process.kill(-c.pid, signal);
                }
                catch (error) {
                    if (error.code !== 'ESRCH')
                        throw error;
                }
                for (let n = 0; n < 10 && members.length; n++) {
                    await delay(100);
                    members = await this.captureOwnedGroup();
                }
            }
            if (members.length)
                throw new Error('Owned ZCode process group did not stop');
        })();
        return this.closing;
    }
}
//# sourceMappingURL=rpc.js.map