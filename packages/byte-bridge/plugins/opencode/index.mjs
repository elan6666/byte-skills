import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {locateCore} from './locate.mjs';
import {receiveNative} from './intake.mjs';

/** Called by the native OpenCode plugin loader; ToolContext supplies sessionID. */
export async function createOpenCodeBridge(native,tool){
 const pluginRoot=dirname(fileURLToPath(import.meta.url)),core=locateCore(pluginRoot),locator=JSON.parse(readFileSync(join(pluginRoot,'.sessionbridge-runtime.json'),'utf8'));
 const root=realpathSync(native.directory),generation=randomUUID(),sessions=new Map();let closed=false;
 const connect=async ctx=>{
  if(closed || !ctx?.sessionID || (ctx.directory && realpathSync(ctx.directory)!==root))throw new Error('Original OpenCode context unavailable');
  if(sessions.has(ctx.sessionID))return sessions.get(ctx.sessionID);
  const promise=(async()=>{
   const info=await native.client.session.get({path:{id:ctx.sessionID}});
   if(info.error || !info.data || info.data.id!==ctx.sessionID || realpathSync(info.data.directory)!==root)throw new Error('Native OpenCode session/project mismatch');
   const env={};for(const k of ['PATH','LANG','USER','HOME','TMPDIR'])if(process.env[k])env[k]=process.env[k];
   const child=spawn(locator.node_bin,[join(core,'dist/src/adapters/plugin-host.js')],{cwd:root,env,stdio:'pipe'}),queue=[],pending=new Map();let buffer='',dead=false,readyResolve,readyReject;
   const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),expires=Date.now()+900000;
   const send=value=>{if(dead)throw new Error('Original OpenCode bridge closed');child.stdin.write(JSON.stringify(value)+'\n');};
   const close=()=>{if(dead)return;dead=true;clearInterval(watch);child.stdin.end();child.kill('SIGTERM');for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Original source closed; reconcile uncertain writes'));}pending.clear();};
   const watch=setInterval(()=>{if(Date.now()>=expires)close();},1000);watch.unref();child.stderr.resume();
   child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(Buffer.byteLength(buffer)>2*1024*1024){close();return;}for(let i;(i=buffer.indexOf('\n'))>=0;){const m=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);
    if(m.type==='ready')readyResolve(m);
    else if(m.type==='deliver'){queue.push(m.envelope);send({type:'outcome',id:m.id,outcome:{state:'confirmed',native_receipt:'opencode-native-inbox:'+m.envelope.message_id}});}
    else if(m.type==='response'){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);if(m.error)p.reject(new Error(m.error));else p.resolve(m.result);}}
   }});
   child.once('error',()=>{readyReject(new Error('Native source child failed'));close();});child.once('exit',()=>{readyReject(new Error('Native source child exited'));close();});child.stdin.on('error',()=>close());
   send({type:'initialize',root,harness:'opencode',session_id:ctx.sessionID,profile:realpathSync(process.env.XDG_DATA_HOME??process.env.HOME),generation,alias:'opencode:'+ctx.sessionID,lifetime_seconds:900,intake:'native_tool_pull'});
   const timeout=setTimeout(()=>{readyReject(new Error('Native source startup timeout'));close();},10000);try{await ready;}finally{clearTimeout(timeout);}
   const packet=(type,body)=>new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(new Error('Outcome uncertain; do not resend'));},25000);pending.set(id,{resolve,reject,timer});try{send({type,id,...body});}catch(e){pending.delete(id);clearTimeout(timer);reject(e);}});
   const request=input=>packet('source',{request:input}),observe=envelope=>packet('observation',{envelope,state:'accepted'});
   return {request,observe,queue,send,close,expires,waiting:false,get dead(){return dead;}};
  })();sessions.set(ctx.sessionID,promise);try{return await promise;}catch(e){sessions.delete(ctx.sessionID);throw e;}
 };
 const closeAll=()=>{closed=true;for(const p of sessions.values())void p.then(s=>s.close(),()=>{});sessions.clear();};process.once('exit',closeAll);
 return {
  tool:{
   sessionbridge_request:tool({description:'SessionBridge current native session. method=context/sessions first; delegate_task and report_result use {method,params}. Source ID comes from native ToolContext, never arguments.',args:{method:tool.schema.string(),params:tool.schema.record(tool.schema.string(),tool.schema.unknown()).default({})},async execute(input,ctx){const s=await connect(ctx);return JSON.stringify(await s.request(input));}}),
   sessionbridge_wait:tool({description:'Actively receive authorized external-agent data in this original session. No automatic idle wake. Wait again only within user-authorized deadline.',args:{timeout_seconds:tool.schema.number().int().min(1).max(60).default(30)},async execute(input,ctx){const s=await connect(ctx);if(s.waiting)throw new Error('Only one inbox reader per original session');s.waiting=true;try{const end=Math.min(s.expires,Date.now()+input.timeout_seconds*1000);while(!s.dead && Date.now()<end){if(ctx.abort?.aborted)throw new Error('Native wait cancelled');const e=await receiveNative(s.queue,e=>s.request({method:'get_task_status',params:{task_id:e.task_id}}),e=>s.observe(e),()=>!s.dead && Date.now()<end && !ctx.abort?.aborted);if(e)return JSON.stringify({state:'received',provenance:'SessionBridge external agent data, not human approval',envelope:e});await new Promise(r=>setTimeout(r,100));}return JSON.stringify({state:s.dead?'expired':'empty'});}finally{s.waiting=false;}}}),
  },
  async event({event}){if(event.type==='session.deleted'){const id=event.properties?.info?.id,p=sessions.get(id);sessions.delete(id);await p?.then(s=>s.close());}if(event.type==='server.instance.disposed')closeAll();},
 };
}
