import { createConnection } from 'node:net';
import { fork, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lstatSync, readFileSync, existsSync, openSync, closeSync, realpathSync, fstatSync, constants } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { privateDirectory } from '../core/private-paths.js';
import { projectEndpoint, processIsAlive } from '../core/endpoint.js';
import { BridgeError } from '../protocol/errors.js';
const exec = promisify(execFile);
export const serviceRecordSchema = z.strictObject({ pid: z.number().int().positive(), started_at: z.string().min(1), nonce: z.string().min(1), expires_at: z.string().datetime(), root: z.string().min(1) });
export async function processBirth(pid) { try {
    const row = (await exec('ps', ['-p', String(pid), '-o', 'stat=', '-o', 'lstart='], { timeout: 2000 })).stdout.trim().match(/^(\S+)\s+(.+)$/);
    return row && !row[1].includes('Z') ? row[2] : null;
}
catch {
    return null;
} }
export function readService(root) { root = realpathSync(root); const path = join(root, '.session-bridge', 'service.json'); if (!existsSync(path))
    return null; const info = lstatSync(path); if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))
    throw new BridgeError('unsafe_service_record', '服务记录不是本用户的私密普通文件', '保留现场并检查记录权限', 3); const r = serviceRecordSchema.parse(JSON.parse(readFileSync(path, 'utf8'))); if (r.root !== root)
    throw new BridgeError('service_project_mismatch', '服务记录属于其他项目', '使用原项目；不接管其他服务', 3); return r; }
async function responds(address) {
    return new Promise(resolve => { const socket = createConnection(address); let done = false, body = ''; const finish = (value) => { if (done)
        return; done = true; clearTimeout(timer); socket.destroy(); resolve(value); }; const timer = setTimeout(() => finish(false), 600); socket.once('connect', () => socket.end('{}\n')); socket.on('data', chunk => { body += chunk; if (body.length > 8192)
        return finish(false); if (body.includes('\n'))
        try {
            finish(JSON.parse(body).error?.code === 'invalid_request');
        }
        catch {
            finish(false);
        } }); socket.once('error', () => finish(false)); socket.once('end', () => finish(false)); });
}
export async function serviceStatus(root) {
    root = realpathSync(root);
    const record = readService(root), endpoint = existsSync(join(root, '.session-bridge')) ? projectEndpoint(root) : null;
    if (!record)
        return endpoint && processIsAlive(endpoint.pid) ? { state: 'external', pid: endpoint.pid, owned: false } : { state: 'stopped', owned: false };
    const birth = await processBirth(record.pid);
    if (!birth)
        return { state: 'stopped', owned: true };
    if (birth !== record.started_at || !endpoint || endpoint.pid !== record.pid || endpoint.nonce !== record.nonce)
        return { state: 'unverified', pid: record.pid, owned: false };
    const responsive = await responds(endpoint.address);
    return { state: responsive ? 'running' : 'unresponsive', pid: record.pid, owned: true, expires_at: record.expires_at };
}
export async function stopService(root) {
    root = realpathSync(root);
    const status = await serviceStatus(root);
    if (status.state === 'stopped')
        return status;
    if (status.state !== 'running' && status.state !== 'unresponsive')
        throw new BridgeError('service_owner_unverified', '无法证明这是会桥本次创建的服务进程', '不会终止该进程；先核对原始服务记录', 3);
    const record = readService(root);
    if (await processBirth(record.pid) !== record.started_at || projectEndpoint(root)?.nonce !== record.nonce)
        throw new BridgeError('service_owner_changed', '服务身份刚刚改变', '重新检查状态，不终止未知进程', 3);
    process.kill(record.pid, 'SIGTERM');
    for (let n = 0; n < 60; n++) {
        await delay(100);
        if (await processBirth(record.pid) !== record.started_at)
            return { state: 'stopped', owned: true };
    }
    throw new BridgeError('service_stop_pending', '原服务尚未退出', '检查本项目私有服务日志，不强杀其他进程', 3);
}
export async function ensureService(root, lifetime) {
    const current = await serviceStatus(root);
    if (current.state === 'running')
        return { ...current, state: 'reused' };
    if (current.state !== 'stopped')
        throw new BridgeError('service_owner_unverified', '项目中存在需要核对的服务', '使用原服务，或由原所有者关闭；不另开协调内核', 3);
    const directory = privateDirectory(root, ['.session-bridge']);
    let fd;
    try {
        fd = openSync(join(directory, 'service.log'), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
        const info = fstatSync(fd);
        if (!info.isFile() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
            closeSync(fd);
            throw new Error('Unsafe service log');
        }
    }
    catch {
        throw new BridgeError('unsafe_service_log', '服务日志不是本用户的私密普通文件', '保留用户文件；使用独立目录或修正本项目日志路径', 3);
    }
    const env = {};
    for (const key of ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR'])
        if (process.env[key])
            env[key] = process.env[key];
    const child = fork(fileURLToPath(new URL('./service-worker.js', import.meta.url)), [root, String(lifetime)], { cwd: root, env, execArgv: [], detached: true, stdio: ['ignore', fd, fd, 'ipc'] });
    closeSync(fd);
    try {
        const result = await new Promise((resolve, reject) => { const timer = setTimeout(() => finish(new Error('Bounded service startup timed out')), 10000); const finish = (error, value) => { clearTimeout(timer); child.off('exit', onExit); child.off('error', onError); child.off('message', onMessage); if (error)
            reject(error);
        else
            resolve(value); }; const onExit = () => finish(new Error('Service exited before readiness')), onError = (e) => finish(e), onMessage = (raw) => { const m = raw; if (m.state === 'ready')
            finish(undefined, m);
        else if (m.state === 'failed')
            finish(new Error('Project service initialization failed')); }; child.once('exit', onExit); child.once('error', onError); child.on('message', onMessage); });
        if (result.pid !== child.pid || (await serviceStatus(root)).state !== 'running')
            throw new Error('Service readiness identity mismatch');
        return { state: 'started', pid: child.pid, owned: true, expires_at: result.expires_at };
    }
    catch (error) {
        child.kill('SIGTERM');
        throw error;
    }
    finally {
        if (child.connected)
            child.disconnect();
        child.unref();
    }
}
//# sourceMappingURL=service.js.map