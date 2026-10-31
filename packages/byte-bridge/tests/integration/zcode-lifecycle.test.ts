import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {ZCodeRpc} from '../../src/adapters/zcode/rpc.js';
import {nativeDeliveryState,startZCodeHost} from '../../src/adapters/zcode/host.js';
import {initProject} from '../../src/cli/init.js';
function alive(pid:number){try{process.kill(pid,0);return true;}catch{return false;}}
async function fixture(t:{after:(fn:()=>Promise<void>)=>void},behavior:string){
 const root=mkdtempSync('/tmp/sb-zcode-lifecycle-'),profile=join(root,'profile'),binary=join(root,'glm','zcode.cjs');
 mkdirSync(profile);mkdirSync(join(root,'glm'));mkdirSync(join(root,'config','provider'),{recursive:true});writeFileSync(join(root,'config','provider','zcode-builtin.json'),'{}');
 writeFileSync(binary,`const fs=require('node:fs'),rl=require('node:readline');if(process.argv.includes('--version')){console.log('0.17.0');process.exit(0);}fs.writeFileSync('owned-parent',String(process.pid));${behavior}`);
 t.after(async()=>{for(const file of ['owned-parent','owned-child']){if(existsSync(join(root,file))){const pid=Number(readFileSync(join(root,file),'utf8'));try{process.kill(pid,'SIGKILL');}catch{/* Test-owned fixture already exited. */}}}rmSync(root,{recursive:true,force:true});});
 return {root,profile,binary};
}
test('zcode_failed_capabilities_cleans_the_owned_runtime',{timeout:15000},async t=>{
 const f=await fixture(t,`rl.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);console.log(JSON.stringify({id:q.id,error:{code:-32601}}));});setInterval(()=>{},1000);`);await initProject(f.root,{dryRun:false});
 await assert.rejects(()=>startZCodeHost(f),/refused/);const pid=Number(readFileSync(join(f.root,'owned-parent'),'utf8'));await delay(100);assert.equal(alive(pid),false,'capability failure must not leave the native runtime alive');
});
test('zcode_close_cleans_owned_descendants_after_parent_exits_on_eof',{timeout:15000},async t=>{
 const f=await fixture(t,`const c=require('node:child_process').spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync('owned-child',String(c.pid));rl.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);console.log(JSON.stringify({id:q.id,result:{historyFirst:true}}));}).on('close',()=>process.exit(0));`);
 const rpc=new ZCodeRpc(f);t.after(()=>rpc.close());await rpc.request('runtime/capabilities',{});const child=Number(readFileSync(join(f.root,'owned-child'),'utf8'));await delay(150);await rpc.close();await delay(100);assert.equal(alive(rpc.pid),false);assert.equal(alive(child),false,'native MCP or tool descendants must be cleaned even after parent EOF');
});
const user=(id:string,text:string)=>({info:{role:'user',messageId:id},parts:[{type:'text',text}]});
const reply=(parent:string,text:string,finish='stop',error?:string)=>({info:{role:'assistant',messageId:'a-'+parent,parentMessageId:parent,finish,...(error?{error}:{} )},parts:[{type:'text',text}]});
test('zcode_completion_is_attributed_to_the_exact_successful_native_input',()=>{
 const state=(messages:Record<string,unknown>[])=>({projection:{status:'idle'},messages});
 assert.equal(nativeDeliveryState(state([user('one','target'),reply('one',''),user('two','other'),reply('two','unrelated')]),'target'),'accepted');
 assert.equal(nativeDeliveryState(state([user('one','target'),reply('one','partial','error','failure')]),'target'),'accepted');
 assert.equal(nativeDeliveryState(state([user('one','target'),reply('one','tools','tool-calls')]),'target'),'accepted');
 assert.equal(nativeDeliveryState(state([user('one','target'),reply('one','done')]),'target'),'completed');
 assert.equal(nativeDeliveryState(state([reply('one','target'),reply('two','unrelated')]),'target'),null);
});

test('zcode_saved_input_id_reconciles_when_the_original_user_has_left_the_tail',()=>{
 const snapshot={projection:{status:'idle'},messages:[reply('one','own final'),...Array.from({length:110},(_,i)=>user('later-'+i,'other'))]};
 assert.equal(nativeDeliveryState(snapshot,'old wire text','one'),'completed');
 assert.equal(nativeDeliveryState(snapshot,'old wire text','another'),'accepted');
});
test('zcode_post_capability_initialization_failure_cleans_owned_runtime',{timeout:15000},async t=>{
 const f=await fixture(t,`rl.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);console.log(JSON.stringify({id:q.id,result:{historyFirst:true}}));});setInterval(()=>{},1000);`);
 await assert.rejects(()=>startZCodeHost(f));const pid=Number(readFileSync(join(f.root,'owned-parent'),'utf8'));assert.equal(alive(pid),false);
});
test('zcode_capability_timeout_cleans_owned_runtime',{timeout:30000},async t=>{
 const f=await fixture(t,`rl.createInterface({input:process.stdin}).on('line',()=>{});setInterval(()=>{},1000);`);await initProject(f.root,{dryRun:false});
 await assert.rejects(()=>startZCodeHost(f),/uncertain/);const pid=Number(readFileSync(join(f.root,'owned-parent'),'utf8'));assert.equal(alive(pid),false);
});
test('zcode_version_probe_uses_only_the_dedicated_profile',{timeout:10000},async t=>{
 const f=await fixture(t,`rl.createInterface({input:process.stdin}).on('line',line=>{const q=JSON.parse(line);console.log(JSON.stringify({id:q.id,result:{historyFirst:true}}));}).on('close',()=>process.exit(0));`);
 const content=readFileSync(f.binary,'utf8').replace("console.log('0.17.0');process.exit(0);","fs.writeFileSync('version-home',process.env.HOME);console.log('0.17.0');process.exit(0);");writeFileSync(f.binary,content);
 const rpc=new ZCodeRpc(f);t.after(()=>rpc.close());await rpc.request('runtime/capabilities',{});assert.equal(readFileSync(join(f.root,'version-home'),'utf8'),realpathSync(f.profile));await rpc.close();
});
