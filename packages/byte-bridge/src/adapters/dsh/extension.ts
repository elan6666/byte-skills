import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { invokeSourceTool, sourceToolJsonSchema } from '../source-tool.js';
import { openStore } from '../../core/database.js';
import { issueEnrollment } from '../../core/bindings.js';
import { digest } from '../../protocol/canonical.js';
import type { Envelope } from '../../protocol/types.js';
import { pluginWireText, startPluginSession, type PluginHandle } from '../plugin-client.js';
import { enqueueOnOriginalAgent } from './native.js';

export interface DshSessionConfig {
 session_id:string;
 root:string;
 /** Exact native cwd, explicitly pinned when the chat works above the project. */
 cwd?:string;
 alias?:string;
}
export type DshAutoSessions = 'auto';
export interface DshPluginConfig { sessions:readonly DshSessionConfig[]|DshAutoSessions; root?:string }

export async function installDsh(ctx:Context, config:DshPluginConfig, makeMessage:(envelope:Envelope,text:string)=>UserMessage):Promise<()=>Promise<void>> {
 const profile=ctx.get('profileContext') as ProfileContext|undefined;
 if(!profile || profile.startedBundles.some(name=>/sdk|headless/.test(name)) || !profile.startedBundles.some(name=>/web-app|desktop/.test(name)))throw new Error('Native Web/Desktop profile proof required; a new SDK is managed');
 const auto=config.sessions==='auto';
 if(!auto && (!Array.isArray(config.sessions) || new Set(config.sessions.map(s=>s.session_id)).size!==config.sessions.length))throw new Error('Configure unique original DSH sessions explicitly');
 // Single-machine hub: "auto" enrolls every original agent in this host, no session list required.
 const hubRoot=realpathSync(config.root ?? process.env.BYTE_BRIDGE_HOME ?? join(homedir(),'.byte-bridge'));
 const {ensureHubRoot}=await import('../../core/hub.js');await ensureHubRoot();
 const selected=auto?null:new Map((config.sessions as readonly DshSessionConfig[]).map(s=>[s.session_id,{...s,root:realpathSync(s.root),cwd:realpathSync(s.cwd??s.root)}]));
 const pick=(agent:Agent):{root:string;cwd:string;alias:string}|undefined=>{
  if(selected){const s=selected.get(String(agent.id));return s?{root:s.root,cwd:s.cwd,alias:s.alias??'dsh'}:undefined;}
  const cwd=agent.session.header.cwd;if(!cwd)return undefined;return {root:hubRoot,cwd:realpathSync(cwd),alias:'dsh:'+String(agent.id).slice(-6)};
 };
 const byAgent=new Map<Agent,{handle:PluginHandle;root:string}>(), pending=new Map<Agent,Promise<void>>();
 let closed=false;
 const current=(agent:Agent,cwd:string)=>!closed && ctx.agents.get(agent.id)===agent && Boolean(agent.session.header.cwd) && realpathSync(agent.session.header.cwd!)===cwd && ctx.remoteAccess.allows({kind:'session',id:agent.id});
 const connect=async(agent:Agent):Promise<void>=>{
  const s=pick(agent);
  if(!s || byAgent.has(agent) || !current(agent,s.cwd))return;
  if(pending.has(agent))return pending.get(agent);
  const operation=(async()=>{
   const store=openStore(s.root),generation=randomUUID(),setup=issueEnrollment(store),identity={harness:'dsh',host_id:hostname(),profile_id:digest(realpathSync(profile.dir)),native_session_id:String(agent.id),project_id:store.project_id,runtime_generation:generation};store.close();
   const handle=await startPluginSession({setup,native_proof:{binding_id:randomUUID(),identity,challenge_id:randomUUID(),response:randomUUID(),expires_at:new Date(Date.now()+30000).toISOString()}},{root:s.root,alias:s.alias??'dsh',validateCurrent:()=>current(agent,s.cwd),deliver:async envelope=>enqueueOnOriginalAgent({ctx,agent,sessionId:agent.id,generation,makeMessage},envelope)});
   if(!current(agent,s.cwd)){await handle.close();return;}
   byAgent.set(agent,{handle,root:s.root});
  })();
  pending.set(agent,operation);
  try{await operation;}finally{pending.delete(agent);}
 };
 const disposeCreated=ctx.on('agent/created',async({agent})=>{await connect(agent);});
 const disposeAgent=ctx.on('agent/disposed',async({agent})=>{const entry=byAgent.get(agent);byAgent.delete(agent);await entry?.handle.close();});
 const disposeEvents=ctx.on('session/event',(session,event)=>{
  if(event.type!=='user/message' || event.data.source.kind!=='sessionbridge')return;
  const agent=ctx.agents.get(session.id),entry=agent && byAgent.get(agent);
  if(!entry)return;
  const messageId=event.data.source.message_id,store=openStore(entry.root);
  try{
   const row=store.db.prepare('SELECT envelope_json FROM deliveries WHERE message_id=?').get(messageId);
   if(row){const e=JSON.parse(String(row.envelope_json)) as Envelope;if(e.target.runtime_generation===entry.handle.binding.identity.runtime_generation && event.data.content.length===1 && event.data.content[0]?.type==='text' && event.data.content[0].text===pluginWireText(e))void entry.handle.publish(e,'accepted').catch(()=>{});}
  }finally{store.close();}
 });
 const call=async(agent:Agent|undefined,raw:unknown)=>{
  if(!agent)throw new Error('An original native Agent is required');
  const entry=byAgent.get(agent),s=pick(agent);
  if(!entry || !s || !current(agent,s.cwd))throw new Error('This original native Agent is not connected');
  return invokeSourceTool(entry.handle.connection_file,entry.root,raw,()=>current(agent,s.cwd));
 };
 const definition:ToolDefinition={name:'sessionbridge_request',description:'调用当前原生会话的会桥接口。先 context/sessions，角色设置 configure_roles；只接受业务参数，不接受来源身份。',parameters:sourceToolJsonSchema as ToolDefinition['parameters'],output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},execute:async(raw,exec)=>call(exec.agent,raw)};
 const disposeTool=ctx.tools.register(definition);
 const dispose=async()=>{
  closed=true;disposeTool();disposeCreated();disposeAgent();disposeEvents();
  await Promise.allSettled(pending.values());
  await Promise.all([...byAgent.values()].map(e=>e.handle.close()));byAgent.clear();
 };
 try{
  if(selected){for(const id of selected.keys()){const agent=ctx.agents.get(id as SessionId);if(agent)await connect(agent);}}
  return dispose;
 }catch(error){await dispose();throw error;}
}