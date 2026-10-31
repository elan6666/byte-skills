import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BridgeError } from '../../protocol/errors.js';
const exec = promisify(execFile);
// Each entry is certified against the real bundled protocol, never a semver range.
export const SUPPORTED_CODEX_VERSIONS = ['0.163.0-alpha.11', '0.163.0-alpha.11.2', '0.164.0-alpha.11.1', '0.166.0-alpha.5.1'];
export const CURRENT_CODEX_VERSION = SUPPORTED_CODEX_VERSIONS[3];
export async function validateSupportedCodexBinary(path) {
    const result = await exec(path, ['--version'], { timeout: 10_000, maxBuffer: 64 * 1024 });
    const version = result.stdout.trim().replace(/^codex-cli\s+/, '');
    if (!SUPPORTED_CODEX_VERSIONS.some(v => v === version))
        throw new BridgeError('version_drift', 'Codex version is not certified: ' + version, 'Retest this exact desktop version in isolated sessions before connecting', 3);
    return validateCodexBinary(path, version);
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