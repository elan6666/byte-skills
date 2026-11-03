import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat, mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BridgeError } from '../../protocol/errors.js';
import { requireMinimumVersion } from '../version-policy.js';
const exec = promisify(execFile);
// Historical regression versions; new connections check the actual protocol schema.
export const SUPPORTED_CODEX_VERSIONS = ['0.163.0-alpha.11', '0.163.0-alpha.11.2', '0.164.0-alpha.11.1', '0.166.0-alpha.5.1'];
export const CURRENT_CODEX_VERSION = SUPPORTED_CODEX_VERSIONS[3];
const checkedSchemas = new Map();
const requiredMethods = { initialize: ['clientInfo', 'capabilities'], 'thread/read': ['threadId', 'includeTurns'], 'thread/queue/add': ['threadId', 'clientUserMessageId', 'input'], 'thread/queue/list': ['threadId', 'limit', 'cursor'], 'thread/turns/list': ['threadId', 'limit', 'itemsView', 'cursor'] };
export function checkCodexProtocolSchema(raw) {
    const schema = raw;
    if (!Array.isArray(schema?.oneOf))
        throw new BridgeError('codex_protocol_missing', 'Codex protocol schema has no request methods', 'Use an app-server build exposing the queue/history protocol', 3);
    for (const [method, supplied] of Object.entries(requiredMethods)) {
        const entry = schema.oneOf.find(row => row.properties?.method?.enum?.includes(method) || row.properties?.method?.const === method);
        const ref = entry?.properties?.params?.$ref, definition = ref?.startsWith('#/definitions/') ? schema.definitions?.[ref.slice('#/definitions/'.length)] : undefined;
        if (!entry || !definition || !supplied.every(name => name in (definition.properties ?? {})) || definition.required?.some(name => !supplied.includes(name)))
            throw new BridgeError('codex_protocol_missing', 'Codex queue/history interface is incompatible: ' + method, 'Use a runtime exposing the required method and arguments; no message was queued', 3);
    }
}
async function checkBinaryProtocol(binary, sha256) {
    const key = binary + ':' + sha256;
    let pending = checkedSchemas.get(key);
    if (!pending) {
        pending = (async () => {
            const directory = await mkdtemp(join(tmpdir(), 'byte-codex-protocol-'));
            try {
                const profile = join(directory, 'profile');
                await mkdir(profile);
                const env = { PATH: process.env.PATH, HOME: directory, CODEX_HOME: profile };
                await exec(binary, ['app-server', 'generate-json-schema', '--experimental', '--out', directory], { env, timeout: 15000, maxBuffer: 65536 });
                checkCodexProtocolSchema(JSON.parse(await readFile(join(directory, 'ClientRequest.json'), 'utf8')));
            }
            finally {
                await rm(directory, { recursive: true, force: true });
            }
        })();
        checkedSchemas.set(key, pending);
    }
    try {
        await pending;
    }
    catch (error) {
        checkedSchemas.delete(key);
        throw error;
    }
}
export async function validateSupportedCodexBinary(path) {
    const result = await exec(path, ['--version'], { timeout: 10_000, maxBuffer: 64 * 1024 });
    const version = result.stdout.trim().replace(/^codex-cli\s+/, '');
    requireMinimumVersion('Codex', version, '0.163.0');
    const proof = await validateCodexBinary(path, version);
    await checkBinaryProtocol(await realpath(path), proof.sha256);
    return proof;
}
export async function validateCodexBinary(path, expectedVersion) {
    const binary = await realpath(path);
    if (!(await stat(binary)).isFile())
        throw new BridgeError('invalid_binary', 'Codex binary is not a file', 'Choose the current desktop bundled executable', 3);
    const result = await exec(binary, ['--version'], { timeout: 10_000, maxBuffer: 64 * 1024 });
    const version = result.stdout.trim().replace(/^codex-cli\s+/, ''), expected = expectedVersion.replace(/^codex-cli\s+/, '');
    if (version !== expected)
        throw new BridgeError('version_drift', 'Codex version drift: expected ' + expected + ' but found ' + version, 'Retest the updated desktop binary before connecting real storage', 3);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(binary))
        hash.update(chunk);
    return { version, sha256: hash.digest('hex'), source: binary.includes('.app/Contents/') ? 'desktop_bundle' : 'explicit_binary' };
}
export async function readCodexOwner(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new BridgeError('invalid_native_owner', 'Invalid native owner process', 'Reconnect from the original native host', 3);
    try {
        const [birth, command] = await Promise.all([exec('ps', ['-p', String(pid), '-o', 'lstart='], { timeout: 3000, maxBuffer: 4096 }), exec('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 3000, maxBuffer: 4096 })]);
        if (!birth.stdout.trim() || !command.stdout.trim())
            throw new Error('Owner not found');
        return { pid, started_at: birth.stdout.trim(), executable: await realpath(command.stdout.trim()) };
    }
    catch {
        throw new BridgeError('native_owner_offline', 'Original native owner is offline or cannot be identified', 'Reconnect the original application; the writer will not replace it', 3);
    }
}
//# sourceMappingURL=version.js.map