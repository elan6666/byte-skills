import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BridgeError } from '../protocol/errors.js';
import { digest } from '../protocol/canonical.js';
import { skillCommand } from '../cli/runtime.js';
import { harnessGuidance } from '../adapters/guidance.js';
export const HARNESSES = ['codex', 'claude', 'pi', 'hermes', 'dsh', 'zcode', 'kimi', 'opencode'];
export const SKILLS = ['sessionbridge-do', 'session-bridge-delegate', 'session-bridge-supervise', 'session-bridge-return'];
export function bytesHash(text) { return createHash('sha256').update(text).digest('hex'); }
export function packageRoot() { let dir = dirname(fileURLToPath(import.meta.url)); for (let i = 0; i < 6; i++) {
    const path = join(dir, 'package.json');
    if (existsSync(path) && ['@byte-skills/bridge', '@sessionbridge/local'].includes(JSON.parse(readFileSync(path, 'utf8')).name))
        return realpathSync(dir);
    dir = dirname(dir);
} throw new Error('SessionBridge package root is unavailable'); }
export function installLocations(root, harness, scope) {
    const plugin = harness === 'pi' ? join(root, scope === 'user' ? '.pi/agent/extensions/sessionbridge' : '.pi/extensions/sessionbridge') : harness === 'hermes' && scope === 'user' ? join(root, '.hermes/plugins/sessionbridge') : join(root, '.session-bridge-plugins', harness);
    const skills = harness === 'claude' ? join(root, '.claude/skills') : harness === 'hermes' ? join(root, '.hermes/skills') : join(root, '.agents/skills');
    return { plugin, skills };
}
export function safeInstallPath(root, path) { const rel = relative(root, path); if (!rel || rel === '..' || rel.startsWith('../') || isAbsolute(rel))
    return false; let current = path; while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current)
        return false;
    current = parent;
} const actual = realpathSync(current), base = relative(root, actual); return !isAbsolute(base) && base !== '..' && !base.startsWith('../') && !lstatSync(current).isSymbolicLink(); }
export function readJsonConfig(path) { if (!existsSync(path))
    return {}; if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile())
    throw new Error('Config must be a regular file'); const value = JSON.parse(readFileSync(path, 'utf8')); if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Config must be a JSON object'); return value; }
export function entryAt(value, key) { const entries = value[key]; if (entries === undefined)
    return undefined; if (!entries || typeof entries !== 'object' || Array.isArray(entries))
    throw new Error('MCP config entry map must be an object'); return entries.sessionbridge; }
export async function planInstall(options) {
    if (!HARNESSES.includes(options.harness) || !['project', 'user'].includes(options.scope))
        throw new BridgeError('install_target_invalid', '请选择受支持的应用和 project/user 安装范围', '运行 install --harness NAME --scope project --project PATH', 4);
    const root = realpathSync(options.targetRoot), core = packageRoot(), locations = installLocations(root, options.harness, options.scope), files = [], conflicts = [];
    let previous = null;
    const marker = join(root, '.session-bridge-install', options.harness + '-' + options.scope + '.json');
    if (existsSync(marker)) {
        const pointer = JSON.parse(readFileSync(marker, 'utf8'));
        if (safeInstallPath(root, pointer.receipt_file) && pointer.receipt_file.startsWith(join(root, '.session-bridge-install') + '/') && existsSync(pointer.receipt_file)) {
            const prior = JSON.parse(readFileSync(pointer.receipt_file, 'utf8'));
            if (prior.state === 'installed' && prior.plan.harness === options.harness && prior.plan.scope === options.scope && prior.plan.targetRoot === root)
                previous = { receipt_file: pointer.receipt_file, owned_files: prior.owned_files, config_owned: prior.config_owned, config_value_sha256: prior.plan.config ? digest(prior.plan.config.value) : null };
        }
    }
    const add = (path, content) => { if (!safeInstallPath(root, path))
        throw new BridgeError('unsafe_install_path', '安装目标链接指向范围之外', '选择普通项目目录；不会跟随链接修改全局配置', 3); const before = existsSync(path) ? bytesHash(readFileSync(path)) : null; files.push({ path, content, before_sha256: before }); };
    const tree = (source, dest) => { for (const entry of readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name === '.sessionbridge-runtime.json')
            continue;
        const path = join(source, entry.name), target = join(dest, entry.name);
        if (entry.isSymbolicLink())
            throw new Error('Package payload contains an unexpected symlink');
        if (entry.isDirectory())
            tree(path, target);
        else if (entry.isFile())
            add(target, readFileSync(path, 'utf8'));
    } };
    tree(join(core, 'plugins', options.harness), locations.plugin);
    for (const name of SKILLS)
        tree(join(core, 'skills', name), join(locations.skills, name));
    add(join(locations.plugin, '.sessionbridge-runtime.json'), JSON.stringify({ protocol_version: 1, core_root: core, node_bin: process.execPath }, null, 2) + '\n');
    if (options.harness === 'opencode') {
        const path = join(root, options.scope === 'user' ? '.config/opencode/plugins/sessionbridge.js' : '.opencode/plugins/sessionbridge.js');
        add(path, `import {tool} from '@opencode-ai/plugin';\nimport {createOpenCodeBridge} from ${JSON.stringify('file://' + join(locations.plugin, 'index.mjs'))};\nexport default async function(context){return createOpenCodeBridge(context,tool); }\n`);
    }
    let config = null;
    if (options.harness === 'claude') {
        const path = join(root, '.mcp.json');
        if (!safeInstallPath(root, path))
            throw new Error('Unsafe project MCP config');
        const current = readJsonConfig(path), prior = entryAt(current, 'mcpServers'), value = { command: process.execPath, args: [join(locations.plugin, 'scripts/mcp.mjs'), '--project', root] };
        config = { path, key: 'mcpServers', value, before_sha256: prior === undefined ? null : digest(prior) };
        if (prior !== undefined && digest(prior) !== digest(value) && !(previous?.config_owned && previous.config_value_sha256 === digest(prior)))
            conflicts.push(path + ':mcpServers.sessionbridge');
    }
    for (const file of files)
        if (file.before_sha256 !== null && file.before_sha256 !== bytesHash(file.content) && !previous?.owned_files.some(old => old.path === file.path && old.sha256 === file.before_sha256))
            conflicts.push(file.path);
    return { harness: options.harness, scope: options.scope, targetRoot: root, packageRoot: core, files, config, previous, next_steps: [`原生 Skill 用法：${skillCommand(options.harness)}`, harnessGuidance(options.harness).activation, harnessGuidance(options.harness).tool, harnessGuidance(options.harness).limit, '安装文件不等于会话已接入；运行 preflight，再由原生 context、精确目标和实际任务核对。受阻时仅修复 Bridge 原生接入，不改走 CUA 或另一个消息渠道。'], conflicts };
}
export function activeInstallOwners(root) {
    const owners = [];
    for (const harness of HARNESSES)
        for (const scope of ['project', 'user']) {
            const marker = join(root, '.session-bridge-install', harness + '-' + scope + '.json');
            if (!existsSync(marker))
                continue;
            try {
                const pointer = JSON.parse(readFileSync(marker, 'utf8'));
                if (!safeInstallPath(root, pointer.receipt_file) || !pointer.receipt_file.startsWith(join(root, '.session-bridge-install') + '/'))
                    continue;
                const receipt = JSON.parse(readFileSync(pointer.receipt_file, 'utf8'));
                if (receipt.state === 'installed' && receipt.plan.targetRoot === root && Array.isArray(receipt.owned_files))
                    owners.push(receipt);
            }
            catch { /* Invalid receipt does not claim a user file. */ }
        }
    return owners;
}
//# sourceMappingURL=plan.js.map