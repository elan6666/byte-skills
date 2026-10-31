import { hostname } from 'node:os';
import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { DeliveryOutcome } from '../protocol/types.js';
import { digest } from '../protocol/canonical.js';
import { parseEnvelope } from '../protocol/schema.js';
import { openStore } from '../core/database.js';
import { issueEnrollment } from '../core/bindings.js';
import { JsonLines,encodeFrame } from '../transport/framing.js';
import { startPluginSession,type PluginHandle } from './plugin-client.js';
import { checkRuntime } from '../cli/runtime.js';
import {invokeSourceTool} from './source-tool.js';
const initialize=z.strictObject({type:z.literal('initialize'),root:z.string().min(1),harness:z.enum(['hermes','dsh','opencode']),session_id:z.string().min(1),profile:z.string().min(1),generation:z.string().min(1),alias:z.string().min(1),lifetime_seconds:z.number().int().min(1).max(3600).optional(),intake:z.literal('native_tool_pull').optional()});
const outcome=z.discriminatedUnion('state',[z.strictObject({state:z.literal('confirmed'),native_receipt:z.string().min(1)}),z.strictObject({state:z.enum(['refused','uncertain']),reason:z.string().min(1)})]);
// Private stdio child of an enabled native plugin, not a public MCP enrollment endpoint.
export function runPluginHost():void{
 checkRuntime(process.version);
 const frames=new JsonLines(),pending=new Map<string,(value:DeliveryOutcome)=>void>();let handle:PluginHandle|undefined,started=false,closed=false,projectRoot='';
 const write=(value:unknown)=>process.stdout.write(encodeFrame(value));
 const close=async()=>{if(closed)return;closed=true;for(const resolve of pending.values())resolve({state:'uncertain',reason:'Native host disconnected; reconcile without resending'});pending.clear();await handle?.close();process.stdin.destroy();};
 const receive=async(raw:unknown)=>{
  if(!started){started=true;const input=initialize.parse(raw),root=realpathSync(input.root),profile=realpathSync(input.profile),store=openStore(root);
   projectRoot=root;const setup=issueEnrollment(store),identity={harness:input.harness,host_id:hostname(),profile_id:digest(profile),native_session_id:input.session_id,project_id:store.project_id,runtime_generation:input.generation};store.close();
   const expires=input.lifetime_seconds?new Date(Date.now()+input.lifetime_seconds*1000).toISOString():undefined;
   const connected=await startPluginSession({setup,native_proof:{binding_id:randomUUID(),identity,challenge_id:randomUUID(),response:randomUUID(),expires_at:new Date(Date.now()+30000).toISOString()}},{root,alias:input.alias,...(expires?{expires_at:expires}:{}),...(input.intake?{capabilities:[{name:input.intake,supported:true,evidence:'native-tool-context-session-id',constraints:['Explicit native plugin and active bounded wait','No arbitrary idle wake; native permissions unchanged']}]}:{}),validateCurrent:()=>!closed && (!expires || Date.parse(expires)>Date.now()),deliver:envelope=>new Promise<DeliveryOutcome>(resolve=>{
    const id=randomUUID();const timer=setTimeout(()=>{pending.delete(id);resolve({state:'uncertain',reason:'Native host outcome timed out; do not resend'});},4000);
    pending.set(id,value=>{clearTimeout(timer);pending.delete(id);resolve(value);});write({type:'deliver',id,envelope});
   })});
   if(closed){await connected.close();return;}handle=connected;write({type:'ready',binding_id:handle.binding.binding_id,identity:handle.binding.identity,connection_file:handle.connection_file});return;
  }
  const packet=z.discriminatedUnion('type',[
   z.strictObject({type:z.literal('outcome'),id:z.string().min(1),outcome}),
   z.strictObject({type:z.literal('observation'),id:z.string().optional(),envelope:z.unknown(),state:z.enum(['accepted','completed'])}),
   z.strictObject({type:z.literal('source'),id:z.string().min(1),request:z.unknown()})
  ]).parse(raw);
  if(packet.type==='observation'){if(!handle)throw new Error('Native plugin is not ready');try{await handle.publish(parseEnvelope(packet.envelope),packet.state);if(packet.id)write({type:'response',id:packet.id,result:{state:'published'}});}catch(error){if(packet.id)write({type:'response',id:packet.id,error:'native_observation_rejected'});else throw error;}return;}
  if(packet.type==='source'){if(!handle)throw new Error('Native plugin is not ready');try{const result=await invokeSourceTool(handle.connection_file,projectRoot,packet.request,()=>!closed);write({type:'response',id:packet.id,result});}catch{write({type:'response',id:packet.id,error:'source_request_rejected'});}return;}
  pending.get(packet.id)?.(packet.outcome);
 };
 process.stdin.on('data',chunk=>{try{for(const raw of frames.push(Buffer.from(chunk)))void receive(raw).catch(()=>{process.stderr.write('SessionBridge native plugin context rejected.\n');void close();});}catch{void close();}});
 process.stdin.once('end',()=>void close());process.stdin.on('error',()=>void close());process.stdout.on('error',()=>void close());process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
}
if(process.argv[1] && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)runPluginHost();
