import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZCodeRpc } from './rpc.js';
const probes = new Map();
/** No session/create or model call: only a bounded, isolated native handshake. */
export async function probeZCodeRuntime(binary) {
    binary = realpathSync(binary);
    const hash = () => createHash('sha256').update(readFileSync(binary)).digest('hex');
    const before = hash(), key = binary + ':' + before;
    let pending = probes.get(key);
    if (!pending) {
        pending = (async () => {
            const profile = mkdtempSync(join(tmpdir(), 'byte-zcode-compat-')), rpc = new ZCodeRpc({ binary, profile, root: profile });
            try {
                await rpc.request('runtime/capabilities', {});
                if (!rpc.compatibility || rpc.binarySha256 !== before || hash() !== before)
                    throw new Error('ZCode artifact changed during compatibility probe; retry after the native update finishes');
                return rpc.compatibility;
            }
            finally {
                await rpc.close();
                rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
            }
        })();
        probes.set(key, pending);
    }
    try {
        const result = await pending;
        if (hash() !== before)
            throw new Error('ZCode artifact changed after compatibility probe');
        return result;
    }
    catch (error) {
        probes.delete(key);
        throw error;
    }
}
//# sourceMappingURL=compatibility.js.map