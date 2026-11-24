import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { runDaemon } from './daemon.js';
import { processBirth } from './service.js';
import { projectEndpoint } from '../core/endpoint.js';
import { privateWrite } from '../install/apply.js';
const root = realpathSync(process.argv[2]), seconds = Number(process.argv[3]);
if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)
    throw new Error('Invalid service lifetime');
// 0 means a permanent hub: no expiry timer, expires_at is parked far in the future.
const expires = seconds === 0 ? Date.UTC(9999, 11, 31, 23, 59, 59) : Date.now() + seconds * 1000;
let core, stopping = false;
async function stop() { if (stopping)
    return; stopping = true; if (timer)
    clearInterval(timer); await core?.close(); }
const timer = seconds === 0 ? null : setInterval(() => { if (Date.now() >= expires)
    void stop(); }, Math.min(1000, seconds * 1000));
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
try {
    core = await runDaemon(root);
    if (stopping) {
        await core.close();
    }
    else {
        const endpoint = projectEndpoint(root);
        const record = { pid: process.pid, started_at: await processBirth(process.pid), nonce: endpoint.nonce, root, expires_at: new Date(expires).toISOString() };
        privateWrite(join(root, '.session-bridge', 'service.json'), JSON.stringify(record) + '\n');
        process.send?.({ state: 'ready', ...record });
    }
}
catch {
    if (timer)
        clearInterval(timer);
    await core?.close();
    process.send?.({ state: 'failed' });
    process.exitCode = 3;
}
//# sourceMappingURL=service-worker.js.map