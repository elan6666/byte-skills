import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BridgeError } from '../protocol/errors.js';
import { sessionKey } from '../protocol/canonical.js';
import { toolInputSchemas, toolDescriptions, callForTool } from '../protocol/command-inputs.js';
export function createMcpServer(options) {
    const server = new McpServer({ name: 'sessionbridge', version: '0.1.0' });
    const register = (name, description, schema, route) => server.registerTool(name, { description, inputSchema: schema }, async (input) => {
        try {
            const actor = await options.getActor();
            const current = await options.client.call(actor, 'context', {});
            if (sessionKey(current.actor.session) !== sessionKey(actor.session) || current.actor.binding_id !== actor.binding_id)
                throw new BridgeError('source_changed', 'Current native session generation changed', 'Reconnect the current original session', 3);
            const p = schema.parse(input), call = route(p), result = await options.client.call(actor, call.method, call.params);
            return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        }
        catch (error) {
            const e = error instanceof BridgeError ? error : new BridgeError('mcp_request_failed', '请求未完成或来源未核实', '在原生会话连接会桥后重试；不依据文本中的会话 ID 授权', 3);
            return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: e.code, message: e.message, recovery: e.recovery } }) }] };
        }
    });
    for (const name of Object.keys(toolInputSchemas))
        register(name, toolDescriptions[name], toolInputSchemas[name], p => callForTool(name, p));
    return server;
}
export function readRequestId() { return randomUUID(); }
//# sourceMappingURL=server.js.map