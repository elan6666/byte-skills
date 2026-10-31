import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { startServer } from '../../src/transport/server.js';
import { BridgeClient } from '../../src/transport/client.js';
import { issueSessionCapability } from '../../src/transport/auth.js';
import { BindingService } from '../../src/core/bindings.js';
import { deliveryLab } from '../helpers/delivery-lab.js';
import { join } from 'node:path';
import { mkdtempSync,rmSync } from 'node:fs';
test('mcp_and_cli_share_scope',async t=>{
 const f=await deliveryLab(t),dir=mkdtempSync('/tmp/sb-mcp-'),actor={...f.actor,scope:{...f.actor.scope,operations:[...f.actor.scope.operations,'context','sessions']}},token=issueSessionCapability(f.store,actor),server=await startServer({root:f.root,socketPath:join(dir,'core.sock')});const bridge=new BridgeClient({socketPath:server.address,token});let actorReads=0;const mcp=createMcpServer({client:bridge,getActor:()=>{actorReads++;return actor;}}),client=new Client({name:'scope-test',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();await mcp.connect(st);await client.connect(ct);
 t.after(async()=>{await client.close();await mcp.close();await server.close();rmSync(dir,{recursive:true,force:true});});
 const listed=await client.listTools();assert.equal(listed.tools.length,10);const ack=listed.tools.find(tool=>tool.name==='acknowledge_task')!.inputSchema;assert.ok(ack.properties?.task_id);assert.ok(ack.properties?.action);assert.ok(ack.anyOf);const malformed=await client.callTool({name:'acknowledge_task',arguments:{task_id:'t',action:'verify'}});assert.equal(malformed.isError,true);assert.equal(actorReads,0);const okay=await client.callTool({name:'list_sessions',arguments:{query:''}});assert.notEqual(okay.isError,true);await new BindingService(f.store).revoke(actor,actor.binding_id);await assert.rejects(()=>bridge.call(actor,'sessions',{}));const denied=await client.callTool({name:'list_sessions',arguments:{query:''}});assert.equal(denied.isError,true);assert.equal(actorReads,2);
});

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {sourceToolSchema,sourceToolJsonSchema} from '../../src/adapters/source-tool.js';
test('native_source_mcp_exposes_an_object_contract_and_checks_conditional_inputs',async t=>{
 const server=new McpServer({name:'native-contract-test',version:'1'});let calls=0;
 server.registerTool('sessionbridge_request',{inputSchema:sourceToolSchema},async()=>{calls++;return {content:[{type:'text',text:'accepted'}]};});
 const client=new Client({name:'contract-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();await server.connect(st);await client.connect(ct);
 t.after(async()=>{await client.close();await server.close();});
 const schema=(await client.listTools()).tools[0]!.inputSchema;assert.equal(schema.type,'object');assert.ok(schema.properties?.method);assert.ok(schema.properties?.params);assert.ok(schema.anyOf);
 assert.equal(sourceToolJsonSchema.type,'object');
 const invalid=await client.callTool({name:'sessionbridge_request',arguments:{method:'acknowledge_task',params:{task_id:'t',action:'verify'}}});assert.equal(invalid.isError,true);assert.equal(calls,0);
 const valid=await client.callTool({name:'sessionbridge_request',arguments:{method:'acknowledge_task',params:{task_id:'t'}}});assert.notEqual(valid.isError,true);assert.equal(calls,1);
});
