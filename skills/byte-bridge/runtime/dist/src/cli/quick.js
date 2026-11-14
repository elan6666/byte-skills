import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ensureHubRoot } from '../core/hub.js';
import { openStore } from '../core/database.js';
import { BindingService } from '../core/bindings.js';
import { serviceStatus, stopService } from './service.js';
const exec = promisify(execFile);
const THREAD_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;
function codexHome() { return process.env.CODEX_HOME ?? join(homedir(), '.codex'); }
function walkRollouts() {
    const base = join(codexHome(), 'sessions');
    if (!existsSync(base))
        return [];
    const out = [];
    for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile())
            continue;
        if (!entry.name.startsWith('rollout-') || !entry.name.endsWith('.jsonl'))
            continue;
        // @ts-expect-error parentPath is provided by Node's recursive readdir
        const parent = String(entry.parentPath ?? entry.path ?? '');
        const full = parent ? join(parent, entry.name) : '';
        if (!full)
            continue;
        const match = THREAD_RE.exec(entry.name);
        if (!match || !match[1])
            continue;
        try {
            const info = statSync(full);
            out.push({ path: full, thread: match[1], updated: info.mtimeMs, size: info.size });
        }
        catch { /* skip */ }
    }
    return out.sort((a, b) => b.updated - a.updated);
}
function metaCwd(path) {
    try {
        const line = readFileSync(path, 'utf8').split('\n', 1)[0] ?? '';
        const value = JSON.parse(line);
        return value.payload?.cwd ?? '';
    }
    catch {
        return '';
    }
}
function readMessages(path) {
    try {
        const size = statSync(path).size;
        const raw = readFileSync(path, 'utf8');
        const body = size > 8_000_000 ? raw.slice(-6_000_000) : raw;
        const messages = [];
        for (const line of body.split('\n')) {
            if (!line.startsWith('{'))
                continue;
            try {
                const record = JSON.parse(line);
                if (record.type !== 'response_item' || record.payload?.type !== 'message')
                    continue;
                const text = (record.payload.content ?? []).map(part => part.text ?? '').join('').trim();
                if (text)
                    messages.push({ ts: record.timestamp ?? '', role: record.payload.role ?? '', text });
            }
            catch { /* skip malformed line */ }
        }
        return messages;
    }
    catch {
        return [];
    }
}
function threads(limit = 40) {
    const seen = new Set();
    const rows = [];
    for (const item of walkRollouts()) {
        if (seen.has(item.thread))
            continue;
        seen.add(item.thread);
        rows.push({ id: item.thread, cwd: metaCwd(item.path), updated: item.updated, path: item.path });
        if (rows.length >= limit)
            break;
    }
    return rows;
}
function findThread(target) {
    const all = threads(400);
    return all.find(row => row.id === target)
        ?? all.find(row => row.id.startsWith(target))
        ?? all.find(row => row.path.includes(target));
}
export async function listRows(query = '') {
    const rows = threads(40).map(row => ({
        harness: 'codex', target: row.id.slice(0, 8), id: row.id, updated: new Date(row.updated).toLocaleString('zh-CN', { hour12: false }), cwd: row.cwd || '(unknown)'
    }));
    try {
        const root = await ensureHubRoot();
        const store = openStore(root, { readOnly: true });
        try {
            const records = await new BindingService(store).resolve({ query });
            for (const record of records) {
                rows.push({ harness: record.identity.harness, target: record.alias, id: record.identity.native_session_id, updated: record.identity.runtime_generation.slice(0, 8), cwd: record.identity.project_id });
            }
        }
        finally {
            store.close();
        }
    }
    catch { /* hub may not be initialized yet */ }
    const needle = query.trim().toLowerCase();
    return needle ? rows.filter(row => [row.harness, row.target, row.id, row.cwd].some(field => field.toLowerCase().includes(needle))) : rows;
}
export function formatRows(rows) {
    const head = 'HARNESS  TARGET                                  ID          UPDATED                  CWD';
    const lines = rows.map(row => [row.harness.padEnd(8), row.target.slice(0, 38).padEnd(38), row.id.slice(0, 10).padEnd(11), row.updated.padEnd(24), row.cwd].join(' '));
    return [head, ...lines].join('\n');
}
async function codexQueue(target, text) {
    // Local resolution first: accepts full UUIDs and unique UUID prefixes, then lets Codex resolve names.
    target = findThread(target)?.id ?? target;
    const binary = process.env.BYTE_BRIDGE_CODEX_BIN ?? 'codex';
    const env = { ...process.env, CODEX_HOME: codexHome() };
    let stdout = '';
    try {
        const result = await exec(binary, ['queue', '--thread', target, '--message', text], { env, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
        stdout = result.stdout;
    }
    catch (error) {
        const failure = error;
        if (failure.code === 'ENOENT')
            throw new Error('找不到 codex CLI；请设置 BYTE_BRIDGE_CODEX_BIN 指向原生 codex 可执行文件');
        const detail = (failure.stderr ?? failure.stdout ?? failure.message ?? '').trim();
        throw new Error('投递失败：' + detail);
    }
    const match = /Queued message (\S+) for thread (\S+)/.exec(stdout);
    if (!match || !match[1] || !match[2])
        throw new Error('投递返回无法解析：' + stdout.trim());
    return { messageId: match[1], threadId: match[2] };
}
async function record(root, messageId, harness, target, text, state, reply) {
    const store = openStore(root);
    try {
        store.db.prepare('INSERT OR REPLACE INTO hub_messages(message_id,target,harness,text_sha256,created_at,state,reply_preview) VALUES (?,?,?,?,?,?,?)')
            .run(messageId, target, harness, createHash('sha256').update(text).digest('hex'), new Date().toISOString(), state, reply ? reply.slice(0, 400) : null);
    }
    finally {
        store.close();
    }
}
export async function waitForReply(threadId, needle, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    const started = Date.now();
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const candidates = walkRollouts().filter(item => item.thread === threadId && item.updated >= started - 5000);
        for (const candidate of candidates) {
            let seen = false;
            for (const message of readMessages(candidate.path)) {
                if (message.role === 'user' && message.text.includes(needle)) {
                    seen = true;
                    continue;
                }
                if (seen && message.role === 'assistant')
                    return message.text;
            }
        }
    }
    return '';
}
export async function say(target, text, options) {
    try {
        const { messageId, threadId } = await codexQueue(target, text);
        const root = await ensureHubRoot();
        await record(root, messageId, 'codex', threadId, text, 'queued');
        if (options.waitMs <= 0)
            return { ok: true, thread: threadId, delivery: messageId };
        const reply = await waitForReply(threadId, text, options.waitMs);
        if (reply) {
            await record(root, messageId, 'codex', threadId, text, 'completed', reply);
            return { ok: true, thread: threadId, delivery: messageId, reply };
        }
        return { ok: true, thread: threadId, delivery: messageId, error: '等待超时：消息已送达，目标尚未回复' };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
export function tail(target, count) {
    const found = findThread(target);
    if (!found)
        return { messages: [] };
    const assistant = readMessages(found.path).filter(message => message.role === 'assistant').map(message => message.text);
    return { thread: found.id, messages: assistant.slice(-count) };
}
export function deliveryId() { return randomUUID(); }
export async function stopHub(io) {
    const root = await ensureHubRoot();
    const status = await serviceStatus(root);
    if (status.state === 'stopped') {
        io.stdout('hub 未运行\n');
        return 0;
    }
    await stopService(root);
    io.stdout('hub 已停止\n');
    return 0;
}
export async function quickCommand(command, args, io) {
    const flags = args.filter(arg => arg.startsWith('--'));
    const positional = args.filter(arg => !arg.startsWith('--'));
    const asJson = flags.includes('--json');
    if (command === 'ls') {
        const rows = await listRows(positional[0] ?? '');
        io.stdout(asJson ? JSON.stringify(rows, null, 2) + '\n' : formatRows(rows) + '\n');
        return 0;
    }
    if (command === 'tail') {
        const target = positional[0];
        if (!target) {
            io.stderr('用法: byte-bridge tail <目标> [N]\n');
            return 4;
        }
        const count = Number(positional[1] ?? 3) || 3;
        const result = tail(target, count);
        if (!result.thread) {
            io.stderr('找不到目标: ' + target + '\n');
            return 3;
        }
        io.stdout(asJson ? JSON.stringify(result, null, 2) + '\n' : result.messages.join('\n---\n') + '\n');
        return 0;
    }
    const target = positional[0];
    const text = positional.slice(1).join(' ');
    if (!target || !text) {
        io.stderr('用法: byte-bridge say <目标> "消息" [--wait=秒] [--json]\n');
        return 4;
    }
    const waitFlag = flags.find(flag => flag === '--wait' || flag.startsWith('--wait='));
    const waitMs = waitFlag ? (waitFlag.includes('=') ? Number(waitFlag.split('=')[1]) : 120) * 1000 : 0;
    const outcome = await say(target, text, { waitMs });
    if (asJson)
        io.stdout(JSON.stringify(outcome, null, 2) + '\n');
    else {
        if (outcome.ok)
            io.stdout('已投递 ' + (outcome.delivery ?? '') + ' -> ' + (outcome.thread ?? target) + '\n');
        if (outcome.reply)
            io.stdout('\n=== 回复 ===\n' + outcome.reply + '\n');
        if (outcome.error)
            io.stdout('\n' + outcome.error + '\n');
    }
    return outcome.ok ? (outcome.error && outcome.error.startsWith('等待超时') ? 3 : 0) : 3;
}
//# sourceMappingURL=quick.js.map