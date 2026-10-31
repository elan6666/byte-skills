import { execFileSync } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { sourceToolSchema } from '../source-tool.js';
import { processBirth } from '../../cli/service.js';
const url = process.env.SESSIONBRIDGE_ACP_URL, token = process.env.SESSIONBRIDGE_ACP_TOKEN, owner = Number(process.env.SESSIONBRIDGE_ACP_PID), birth = process.env.SESSIONBRIDGE_ACP_BIRTH;
async function main() {
    if (!url || !token || !birth || !Number.isSafeInteger(owner) || owner < 2)
        throw new Error('Original ACP source unavailable');
    const address = new URL(url);
    if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || address.pathname !== '/source')
        throw new Error('Invalid private endpoint');
    let pid = process.ppid, found = false;
    for (let n = 0; n < 16 && pid > 1; n++) {
        if (pid === owner) {
            found = true;
            break;
        }
        pid = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8', timeout: 2000 }).trim());
    }
    if (!found || await processBirth(owner) !== birth)
        throw new Error('Native ACP owner changed');
    const server = new McpServer({ name: 'sessionbridge', version: '0.1.0' });
    server.registerTool('sessionbridge_request', { description: 'Use method=context or sessions first. Delegate with delegate_task and report real artifacts with report_result. Native source identity is supplied by the original ACP session, never by arguments.', inputSchema: sourceToolSchema }, async (input) => {
        if (await processBirth(owner) !== birth)
            throw new Error('Original ACP owner closed');
        try {
            const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(sourceToolSchema.parse(input)), redirect: 'error', signal: AbortSignal.timeout(25000) });
            return { isError: !r.ok, content: [{ type: 'text', text: await r.text() }] };
        }
        catch {
            return { isError: true, content: [{ type: 'text', text: 'Original bridge unavailable. Reconcile uncertain writes; do not blindly repeat.' }] };
        }
    });
    await server.connect(new StdioServerTransport());
}
void main().catch(() => { process.stderr.write('SessionBridge native ACP source rejected.\n'); process.exitCode = 3; });
//# sourceMappingURL=mcp.js.map