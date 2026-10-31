import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {locateCore} from '../locate.mjs';
const core=locateCore(dirname(dirname(fileURLToPath(import.meta.url))));
const {createZCodeAttachedMcp}=await import(pathToFileURL(join(core,'dist/src/adapters/zcode/attached-mcp.js')).href);
const {StdioServerTransport}=await import(pathToFileURL(join(core,'node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js')).href);
const mcp=await createZCodeAttachedMcp(process.env.SESSIONBRIDGE_PROJECT??process.cwd());
process.once('SIGTERM',()=>void mcp.close());process.once('SIGINT',()=>void mcp.close());process.stdin.once('end',()=>void mcp.close());
await mcp.server.connect(new StdioServerTransport());
