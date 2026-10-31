import { setTimeout as delay } from 'node:timers/promises';
import { observeRun } from '../supervision/runs.js';
export function supervise(service, actor, request) { return service.armSupervision(actor, request); }
export async function watchRun(identity, options) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 3600000)
        throw new Error('watch requires a bounded positive timeout');
    const deadline = Date.now() + options.timeoutMs;
    let result = await observeRun(identity);
    while (result.status === 'running' && Date.now() < deadline && !options.signal?.aborted) {
        await delay(Math.min(options.pollMs ?? 250, Math.max(1, deadline - Date.now())), undefined, { signal: options.signal }).catch(() => { });
        if (options.signal?.aborted)
            break;
        result = await observeRun(identity);
    }
    return result;
}
//# sourceMappingURL=supervise.js.map