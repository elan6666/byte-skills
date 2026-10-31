import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { runDaemon } from './daemon.js';
import { processBirth } from './service.js';
import { projectEndpoint } from '../core/endpoint.js';
import { privateWrite } from '../install/apply.js';
const root = realpathSync(process.argv[2]), seconds = Number(process.argv[3]);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400)
    throw new Error('Invalid service lifetime');
const expires = Date.now() + seconds * 1000;
let core, stopping = false;
async function stop() { if (stopping)
    return; stopping = true; clearInterval(timer); await core?.close(); }
const timer = setInterval(() => { if (Date.now() >= expires)
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
    clearInterval(timer);
    await core?.close();
    process.send?.({ state: 'failed' });
    process.exitCode = 3;
}
//# sourceMappingURL=service-worker.js.map