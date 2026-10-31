import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { BindingService } from '../../core/bindings.js';
import { BridgeError } from '../../protocol/errors.js';
import { encodeFrame, JsonLines } from '../../transport/framing.js';
export function readPrivateReference(store, binding) {
    const endpoint = JSON.parse(binding.endpoint_ref);
    const path = endpoint.reference_file, rel = relative(store.root, path);
    if (endpoint.kind !== 'claude_child' || !rel.startsWith('.session-bridge/') || isAbsolute(rel) || realpathSync(path) !== path)
        throw new Error('Invalid helper reference');
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid()))
        throw new Error('Helper reference is not private');
    const ref = JSON.parse(readFileSync(path, 'utf8'));
    if (ref.binding_id !== binding.binding_id || typeof ref.capability !== 'string' || typeof ref.socket !== 'string')
        throw new Error('Helper reference identity mismatch');
    return ref;
}
export async function callHelper(ref, operation, payload) {
    const id = randomUUID(), request = encodeFrame({ id, capability: ref.capability, operation, payload });
    return new Promise((resolve, reject) => {
        const peer = createConnection(ref.socket), frames = new JsonLines();
        let done = false;
        const finish = (error, result) => { if (done)
            return; done = true; clearTimeout(timer); peer.destroy(); if (error)
            reject(error);
        else
            resolve(result); };
        const timer = setTimeout(() => finish(new BridgeError('helper_timeout', 'Native child helper did not reply', 'Reconcile the existing delivery; do not resend', 5)), 5000);
        peer.once('connect', () => peer.end(request));
        peer.on('error', () => finish(new BridgeError('helper_offline', 'Native child helper is unavailable', 'Reconnect from the original native session', 3)));
        peer.on('data', chunk => { try {
            for (const raw of frames.push(chunk)) {
                const msg = raw;
                if (msg.id !== id)
                    throw new Error('Mismatched helper response');
                finish(msg.error ? new Error(msg.error) : null, msg.result);
            }
        }
        catch (error) {
            finish(error);
        } });
        peer.once('end', () => { if (!done)
            finish(new Error('Incomplete helper reply')); });
    });
}
export function createRegisteredHelperClient(store) {
    const bindings = new BindingService(store);
    return { list: () => bindings.resolve({ query: '', harness: 'claude' }), call: async (id, operation, payload) => {
            const binding = bindings.get(id);
            if (!binding || !bindings.isUsable(id) || binding.identity.harness !== 'claude')
                throw new Error('Native binding is unavailable');
            return callHelper(readPrivateReference(store, binding), operation, payload);
        } };
}
//# sourceMappingURL=inbox.js.map