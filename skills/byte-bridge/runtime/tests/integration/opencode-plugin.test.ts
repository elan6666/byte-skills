import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {initProject} from '../../src/cli/init.js';
import {runDaemon} from '../../src/cli/daemon.js';
test('native OpenCode child binds each source request to its own session, rejects spoofing',async t=>{
 const root=mkdtempSync('/tmp/sb-opencode-plugin-');t.after(()=>rmSync(root,{recursive:true,force:true}));await initProject(root,{dryRun:false});const core=await runDaemon(root);t.after(()=>core.close());
 for(const id of ['session-A','session-B']){
  const c=spawn(process.execPath,[resolve('dist/src/adapters/plugin-host.js')],{cwd:root,env:{PATH:process.env.PATH},stdio:'pipe'});t.after(()=>{c.kill();});let buffer='';const queue:Record<string,unknown>[]=[],waiters:((v:Record<string,unknown>)=>void)[]=[];
  c.stderr.resume();c.stdout.on('data',chunk=>{buffer+=chunk;for(let n;(n=buffer.indexOf('\n'))>=0;){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);const w=waiters.shift();if(w)w(m);else queue.push(m);}});
  const next=()=>new Promise<Record<string,unknown>>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('native child response timeout')),1500);const done=(r:Record<string,unknown>)=>{clearTimeout(timer);resolve(r);};const m=queue.shift();if(m)done(m);else waiters.push(done);});
  const send=(m:unknown)=>c.stdin.write(JSON.stringify(m)+'\n');
  send({type:'initialize',harness:'opencode',root,profile:root,session_id:id,generation:'one-runtime',alias:id,lifetime_seconds:60,intake:'native_tool_pull'});
  assert.equal((await next()).type,'ready');
  send({type:'source',id:'read',request:{method:'context',params:{}}});const r=await next();assert.equal(r.type,'response');assert.ok(JSON.stringify(r.result).includes(id));assert.ok(!JSON.stringify(r.result).includes(id==='session-A'?'session-B':'session-A'));
  send({type:'source',id:'spoof',request:{method:'context',params:{source:'session-other'}}});assert.equal((await next()).error,'source_request_rejected');
  c.stdin.end();await new Promise<void>(resolve=>c.once('exit',()=>resolve()));
 }
});
