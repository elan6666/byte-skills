import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HARNESSES,planInstall} from '../../src/install/plan.js';
import {AcpClient} from '../../src/adapters/acp/client.js';

test('Kimi Code and OpenCode are installable without activating or editing providers',async t=>{
 const root=mkdtempSync('/tmp/sb-mainstream-install-');t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const harness of ['kimi','opencode']){
  assert.ok((HARNESSES as readonly string[]).includes(harness));
  const plan=await planInstall({harness,scope:'project',targetRoot:root});
  assert.equal(plan.config,null);assert.ok(plan.files.some(f=>f.path.endsWith('SKILL.md')));
  assert.ok(plan.next_steps.some(s=>s.includes('managed') && s.includes('ACP')));
 }
});

function fixture(t:{after:(f:()=>Promise<void>|void)=>void},timeoutMs=1000){
 const root=mkdtempSync('/tmp/sb-acp-');t.after(()=>rmSync(root,{recursive:true,force:true}));const script=join(root,'agent.mjs');
 writeFileSync(script,`import readline from 'node:readline';let calls=0;for await(const l of readline.createInterface({input:process.stdin})){const m=JSON.parse(l);if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentInfo:{name:'fixture',version:'1'},agentCapabilities:{loadSession:true}}}));else if(m.method==='session/new')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{sessionId:'original-'+(++calls)}}));else if(m.method==='session/prompt'){if(m.params.prompt[0].text==='permission'){console.log(JSON.stringify({jsonrpc:'2.0',id:'approval',method:'session/request_permission',params:{sessionId:m.params.sessionId,options:[{optionId:'yes',kind:'allow_once'}]}}));}else if(m.params.prompt[0].text==='hang'){}else console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{stopReason:'end_turn'}}));}else if(m.id==='approval')console.log(JSON.stringify({jsonrpc:'2.0',method:'fixture/permission',params:m.result}));}`);
 const client=new AcpClient({binary:process.execPath,args:[script],root,env:{PATH:process.env.PATH},timeoutMs});t.after(()=>client.close());return client;
}
test('ACP preserves native session ID and rejects loading or cancelling another owner',async t=>{
 const client=fixture(t);await client.initialize();
 assert.equal((await client.request('session/new',{cwd:'/tmp',mcpServers:[]})).sessionId,'original-1');
 await assert.rejects(client.request('session/new',{cwd:'/tmp',mcpServers:[]}),/one native session/);
 await assert.rejects(client.request('session/load',{sessionId:'other'}),/forbidden/);
 await assert.rejects(client.request('session/cancel',{sessionId:'other'}),/forbidden/);
 assert.equal((await client.request('session/prompt',{sessionId:'original-1',prompt:[{type:'text',text:'ok'}]})).stopReason,'end_turn');
 await client.close();assert.equal(client.alive,false);
 await assert.rejects(client.request('session/new',{}),/closed/);
});
test('ACP declines native permission requests instead of approving tools',async t=>{
 const client=fixture(t);await client.initialize();await client.request('session/new',{cwd:'/tmp',mcpServers:[]});
 const prompt=client.request('session/prompt',{sessionId:'original-1',prompt:[{type:'text',text:'permission'}]}).catch(()=>{});
 await new Promise(r=>setTimeout(r,150));
 const seen=client.notifications.find(n=>n.method==='fixture/permission');
 assert.deepEqual(seen?.params,{outcome:{outcome:'cancelled'}});await client.close();await prompt;
});
test('ACP timeout is uncertain and never automatically resubmits a prompt',async t=>{
 const client=fixture(t,150);await client.initialize();await client.request('session/new',{cwd:'/tmp',mcpServers:[]});
 await assert.rejects(client.request('session/prompt',{sessionId:'original-1',prompt:[{type:'text',text:'hang'}]}),/uncertain/);
 assert.equal(client.trace.filter(m=>m==='session/prompt').length,1);
});
test('ACP missing executable is a bounded failure without an uncaught child error',async()=>{
 const client=new AcpClient({binary:'/nonexistent/sessionbridge-agent',args:[],root:'/tmp',env:{},timeoutMs:150});
 try{await assert.rejects(client.initialize(),/unavailable|uncertain/);}finally{await client.close();}
});
test('ACP uncertain session creation cannot be retried in the same native process',async t=>{
 const root=mkdtempSync('/tmp/sb-acp-new-');t.after(()=>rmSync(root,{recursive:true,force:true}));const script=join(root,'agent.mjs');
 writeFileSync(script,`import readline from 'node:readline';for await(const l of readline.createInterface({input:process.stdin})){const m=JSON.parse(l);if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1}}));}`);
 const c=new AcpClient({binary:process.execPath,args:[script],root,env:{PATH:process.env.PATH},timeoutMs:400});t.after(()=>c.close());await c.initialize();
 await assert.rejects(c.request('session/new',{cwd:root,mcpServers:[]}),/uncertain/);
 await assert.rejects(c.request('session/new',{cwd:root,mcpServers:[]}),/one native session/);assert.equal(c.trace.filter(m=>m==='session/new').length,1);
});
test('ACP unexpected native exit leaves no process-group descendants',async t=>{
 const root=mkdtempSync('/tmp/sb-acp-group-');t.after(()=>rmSync(root,{recursive:true,force:true}));const script=join(root,'agent.mjs');
 writeFileSync(script,`import readline from 'node:readline';import{spawn}from'node:child_process';for await(const l of readline.createInterface({input:process.stdin})){const m=JSON.parse(l);if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1}}));else if(m.method==='session/new'){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{sessionId:'original',descendant:child.pid}}));process.exit(0);}}`);
 const c=new AcpClient({binary:process.execPath,args:[script],root,env:{PATH:process.env.PATH},timeoutMs:1000});t.after(()=>c.close());await c.initialize();const result=await c.request('session/new',{cwd:root,mcpServers:[]}),pid=result.descendant as number;
 t.after(()=>{try{process.kill(pid,'SIGKILL');}catch{/* already cleaned */}});await new Promise(r=>setTimeout(r,100));await c.close();
 let alive=true;try{process.kill(pid,0);}catch{alive=false;}assert.equal(alive,false,'native descendant survived original owner exit');
});
test('ACP prompt timeout remains busy until the exact late native response arrives',async t=>{
 const root=mkdtempSync('/tmp/sb-acp-late-');t.after(()=>rmSync(root,{recursive:true,force:true}));const script=join(root,'agent.mjs');
 writeFileSync(script,`import readline from 'node:readline';for await(const l of readline.createInterface({input:process.stdin})){const m=JSON.parse(l);if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1}}));else if(m.method==='session/new')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{sessionId:'original'}}));else if(m.method==='session/prompt')setTimeout(()=>console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{stopReason:'end_turn'}})),400);}`);
 const c=new AcpClient({binary:process.execPath,args:[script],root,env:{PATH:process.env.PATH},timeoutMs:200});t.after(()=>c.close());await c.initialize();await c.request('session/new',{cwd:root,mcpServers:[]});
 await assert.rejects(c.request('session/prompt',{sessionId:'original',prompt:[{type:'text',text:'work'}]}),/uncertain/);assert.equal(c.hasPendingPrompt('original'),true);
 await new Promise(r=>setTimeout(r,300));assert.equal(c.hasPendingPrompt('original'),false);assert.equal(c.trace.filter(m=>m==='session/prompt').length,1);
});
test('ACP group stops when its connector owner exits without close',async t=>{
 const root=mkdtempSync('/tmp/sb-acp-owner-exit-');t.after(()=>rmSync(root,{recursive:true,force:true}));const agent=join(root,'agent.mjs'),owner=join(root,'owner.mjs');
 writeFileSync(agent,`import readline from 'node:readline';import{spawn}from'node:child_process';for await(const l of readline.createInterface({input:process.stdin})){const m=JSON.parse(l);const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,descendant:child.pid}}));}setInterval(()=>process.stderr.write('native-log\\n'),10);`);
 writeFileSync(owner,`import{AcpClient}from ${JSON.stringify(pathToFileURL(resolve('dist/src/adapters/acp/client.js')).href)};const c=new AcpClient({binary:process.execPath,args:[${JSON.stringify(agent)}],root:${JSON.stringify(root)},env:{PATH:process.env.PATH}});const init=await c.initialize();console.log(JSON.stringify({group:c.pid,descendant:init.descendant}));process.exit(0);`);
 const {spawn}=await import('node:child_process');const child=spawn(process.execPath,[owner],{stdio:['ignore','pipe','ignore']});let output='';child.stdout.on('data',c=>output+=c);await new Promise<void>(r=>child.once('exit',()=>r()));const ids=JSON.parse(output.trim()),group=ids.group as number,descendant=ids.descendant as number;assert.ok(Number.isSafeInteger(descendant) && descendant>1);
 t.after(()=>{try{process.kill(-group,'SIGKILL');}catch{/* cleaned */}});await new Promise(r=>setTimeout(r,1000));let alive=true;try{process.kill(group,0);}catch{alive=false;}assert.equal(alive,false,'private runner remained after connector exit');let descendantAlive=true;try{process.kill(descendant,0);}catch{descendantAlive=false;}assert.equal(descendantAlive,false,'native descendant survived stderr EPIPE after connector exit');
});
