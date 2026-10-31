import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {processBirth} from '../../cli/service.js';
export interface AcpOptions {binary:string;args:string[];root:string;env:NodeJS.ProcessEnv;timeoutMs?:number}
interface Packet {id?:number|string;method?:string;params?:Record<string,unknown>;result?:Record<string,unknown>;error?:{code:number}}
const methods=new Set(['initialize','session/new','session/prompt','session/set_mode','session/set_config_option']);
const exec=promisify(execFile);
/** A private, explicitly started ACP owner. Never loads/resumes external sessions. */
export class AcpClient {
 private child:ChildProcessWithoutNullStreams|null=null;private serial=0;private closed=false;private birth:string|null=null;private closing:Promise<void>|undefined;
 private pending=new Map<number,{method:string;sessionId?:string;resolve:(r:Record<string,unknown>)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private settlement=new Set<(method:string,sessionId:string|undefined)=>void>();
 private sessions=new Set<string>();readonly trace:string[]=[];readonly notifications:Packet[]=[];
 private ownedMembers=new Map<number,string>();
 private sessionAttempted=false;
 get pid(){return this.child?.pid??0;}get alive(){return !this.closed && Boolean(this.child?.pid && this.child.exitCode===null && this.child.signalCode===null);}
 constructor(private options:AcpOptions){}
 hasPendingPrompt(sessionId:string){return [...this.pending.values()].some(p=>p.method==='session/prompt' && p.sessionId===sessionId);}
 onSettlement(listener:(method:string,sessionId:string|undefined)=>void){this.settlement.add(listener);return ()=>this.settlement.delete(listener);}
 private fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('ACP owner unavailable; outcome uncertain; do not resend'));}this.pending.clear();}
 async initialize(){
  if(this.closed)throw new Error('ACP closed');if(this.child)throw new Error('ACP already initialized');
  this.child=spawn(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'runner.js'),this.options.binary,...this.options.args],{cwd:this.options.root,env:this.options.env,stdio:'pipe',detached:true});
  this.child.once('error',()=>this.fail());this.child.once('exit',()=>this.fail());
  this.birth=await processBirth(this.pid);let buffer='';
  this.child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();if(Buffer.byteLength(buffer)>8*1024*1024){this.fail();void this.close();return;}
   for(let i;(i=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.trim())continue;
    try{const m=JSON.parse(line) as Packet;
     if(m.method && m.id!==undefined){
      // Permissions remain with the native application/user, never this connector.
      const result=m.method==='session/request_permission'?{jsonrpc:'2.0',id:m.id,result:{outcome:{outcome:'cancelled'}}}:{jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Client capability not available'}};
      this.child!.stdin.write(JSON.stringify(result)+'\n');continue;
     }
     if(m.method==='sessionbridge/runtime_exit'){this.fail();void this.close();continue;}
     if(m.method){this.notifications.push(m);if(this.notifications.length>2048)this.notifications.shift();continue;}
     const p=typeof m.id==='number'?this.pending.get(m.id):undefined;if(!p)continue;
     this.pending.delete(m.id as number);clearTimeout(p.timer);
     for(const listener of this.settlement)listener(p.method,p.sessionId);
     if(m.error)p.reject(new Error('Native ACP refused request, code '+m.error.code));else p.resolve(m.result??{});
    }catch{this.fail();void this.close();}
   }
  });
  this.child.stderr.resume();this.child.stdin.on('error',()=>{this.fail();void this.close();});
  return this.request('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'SessionBridge',version:'0.1.0'}});
 }
 async request(method:string,params:Record<string,unknown>):Promise<Record<string,unknown>>{
  if(!methods.has(method))throw new Error('ACP method forbidden: '+method);
  if(this.closed)throw new Error('ACP closed');if(!this.alive)throw new Error('ACP owner unavailable');
  if(method==='session/new' && this.sessionAttempted)throw new Error('Only one native session attempt per ACP process; use another isolated host');
  if(method.startsWith('session/') && method!=='session/new' && (typeof params.sessionId!=='string' || !this.sessions.has(params.sessionId)))throw new Error('ACP session is not owned by this original runtime');
  const id=++this.serial,line=JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n';if(Buffer.byteLength(line)>1024*1024)throw new Error('ACP request too large');this.trace.push(method);
  if(method==='session/new')this.sessionAttempted=true;
  const result=await new Promise<Record<string,unknown>>((resolve,reject)=>{const timer=setTimeout(()=>{if(method!=='session/prompt')this.pending.delete(id);reject(new Error('ACP outcome uncertain; reconcile original task; do not resend'));},this.options.timeoutMs??120000);this.pending.set(id,{method,sessionId:typeof params.sessionId==='string'?params.sessionId:undefined,resolve,reject,timer});this.child!.stdin.write(line);});
  if(method==='session/new'){if(typeof result.sessionId!=='string' || !result.sessionId || this.sessions.has(result.sessionId))throw new Error('ACP native session identity invalid');this.sessions.add(result.sessionId);}
  return result;
 }
 private async ownedGroup(){
  if(!this.pid)return [];
  const {stdout}=await exec('ps',['-axo','pid=,pgid=,stat=,lstart='],{timeout:3000});
  const members=stdout.split('\n').flatMap(line=>{const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);return m && Number(m[2])===this.pid && !m[3]!.includes('Z')?[{pid:Number(m[1]),birth:m[4]!}]:[];});
  const anchored=members.some(m=>this.ownedMembers.get(m.pid)===m.birth) || (this.birth!==null && await processBirth(this.pid)===this.birth);
  if(!anchored)return [];for(const m of members)this.ownedMembers.set(m.pid,m.birth);return members;
 }
 close(){return this.closing??=(async()=>{
  this.closed=true;this.fail();const child=this.child;if(!child)return;let group=await this.ownedGroup();child.stdin.end();
  for(let n=0;n<10 && child.exitCode===null && child.signalCode===null;n++)await delay(50);
  for(const signal of ['SIGTERM','SIGKILL'] as const){group=await this.ownedGroup();if(!group.length)break;try{process.kill(-this.pid,signal);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}for(let n=0;n<20 && group.length;n++){await delay(50);group=await this.ownedGroup();}}
  if(group.length)throw new Error('Owned native ACP group did not stop');
 })();}
}
