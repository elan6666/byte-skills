import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { sourceToolSchema } from '../source-tool.js';
const exec = promisify(execFile);
export async function startZCodeMcp() {
    const url = process.env.SESSIONBRIDGE_ZCODE_URL, token = process.env.SESSIONBRIDGE_ZCODE_TOKEN, id = process.env.SESSIONBRIDGE_ZCODE_SESSION, owner = Number(process.env.SESSIONBRIDGE_ZCODE_PID);
    if (!url || !token || !id || !Number.isSafeInteger(owner) || owner <= 1)
        throw new Error('ZCode original runtime context missing');
    const address = new URL(url);
    if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || address.pathname !== '/source')
        throw new Error('Native ZCode source endpoint invalid');
    let pid = process.ppid, found = false;
    for (let i = 0; i < 16 && pid > 1; i++) {
        if (pid === owner) {
            found = true;
            break;
        }
        pid = Number((await exec('ps', ['-p', String(pid), '-o', 'ppid='], { timeout: 3000 })).stdout.trim());
    }
    if (!found)
        throw new Error('ZCode source is not a descendant of the original runtime');
    const server = new McpServer({ name: 'sessionbridge', version: '0.1.0' });
    server.registerTool('sessionbridge_request', { description: '会桥原生来源工具。先 method=context 和 sessions；派任务、监督、回报使用同一工具。角色设置不会创建任务。不要提供来源身份。', inputSchema: sourceToolSchema }, async (input) => {
        try {
            const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: id, request: sourceToolSchema.parse(input) }), signal: AbortSignal.timeout(25000), redirect: 'error' });
            const text = await response.text();
            return { isError: !response.ok, content: [{ type: 'text', text }] };
        }
        catch {
            return { isError: true, content: [{ type: 'text', text: 'Original ZCode bridge unavailable; inspect status before retrying. Do not repeat an uncertain task.' }] };
        }
    });
    await server.connect(new StdioServerTransport());
}
void startZCodeMcp().catch(() => { process.stderr.write('SessionBridge ZCode native source rejected.\n'); process.exitCode = 3; });
//# sourceMappingURL=mcp.js.map