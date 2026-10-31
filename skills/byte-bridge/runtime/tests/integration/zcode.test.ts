import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,mkdtempSync,mkdirSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { ZCodeRpc } from '../../src/adapters/zcode/rpc.js';
const binary='/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
test('zcode_native_transport_uses_original_runtime_and_rejects_unknown_methods',{skip:!existsSync(binary),timeout:30000},async t=>{
 const root=mkdtempSync('/tmp/sb-zcode-');mkdirSync(join(root,'home'));mkdirSync(join(root,'workspace'));
 const rpc=new ZCodeRpc({binary,profile:join(root,'home'),root:join(root,'workspace')});
 t.after(async()=>{await rpc.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const capability=await rpc.request('runtime/capabilities',{}) as {historyFirst:boolean};assert.equal(capability.historyFirst,true);
 await assert.rejects(()=>rpc.request('session/resume',{sessionId:'not-ours'}),/forbidden/);
 await assert.rejects(()=>rpc.request('session/stop',{sessionId:'not-ours'}),/forbidden/);
 const pid=rpc.pid;assert.ok(pid>0);await rpc.request('runtime/capabilities',{});assert.equal(rpc.pid,pid);
 await rpc.close();await assert.rejects(()=>rpc.request('runtime/capabilities',{}),/closed/);
});

import {nativeDeliveryState,startZCodeHost} from '../../src/adapters/zcode/host.js';
import {zcodeModel} from '../helpers/zcode-model.js';
import {initProject} from '../../src/cli/init.js';
import {runDaemon} from '../../src/cli/daemon.js';
import {setTimeout as delay} from 'node:timers/promises';
test('zcode_empty_assistant_is_not_a_completed_delivery',()=>{
 const messages=[{info:{role:'user',messageId:'one'},parts:[{type:'text',text:'exact'}]},{info:{role:'assistant'},parts:[]}];
 assert.equal(nativeDeliveryState({projection:{status:'idle'},messages},'exact'),'accepted');
 assert.equal(nativeDeliveryState({projection:{status:'idle'},messages},'different'),null);
});
test('zcode_warm_original_session_connects_through_its_native_mcp_only',{skip:!existsSync(binary),timeout:45000},async t=>{
 const root=mkdtempSync('/tmp/sb-zcode-host-'),profile=join(root,'profile');mkdirSync(profile);await initProject(root,{dryRun:false});const model=await zcodeModel(profile),core=await runDaemon(root),host=await startZCodeHost({root,profile,binary});
 t.after(async()=>{await host.close();await core.close();await model.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const session=await host.createSession({alias:'worker',mode:'yolo',model:{providerId:'fixture',modelId:'glm-5.3-flash',options:{reasoningLevel:'low'}}});
 const finish=async()=>{for(let n=0;n<100;n++){const snapshot=await host.read(session.id);if(snapshot.projection.status==='idle' && JSON.stringify(snapshot.messages).includes('FIXTURE_REPLY'))return;await delay(100);}throw new Error('Native fixture did not finish');};
 await host.prompt(session.id,'WARM');await finish();assert.equal(host.connected().length,0);
 await host.prompt(session.id,'CONNECT');for(let n=0;n<100 && !host.connected().length;n++)await delay(100);
 const binding=host.connected()[0];assert.equal(binding?.identity.native_session_id,session.id);assert.equal(binding?.mode,'managed');assert.equal(binding?.alias,'worker');
 await assert.rejects(()=>host.read('unowned-session'),/unavailable/);await assert.rejects(()=>host.createSession({alias:'worker',mode:'yolo'}),/alias/);
 await host.close();await assert.rejects(()=>host.read(session.id),/unavailable/);
});

import {openStore} from '../../src/core/database.js';
import {randomUUID} from 'node:crypto';
test('zcode_same_host_busy_queue_reconciles_once_without_resuming_or_interrupting',{skip:!existsSync(binary),timeout:45000},async t=>{
 const root=mkdtempSync('/tmp/sb-zcode-pair-'),profile=join(root,'profile');mkdirSync(profile);await initProject(root,{dryRun:false});const model=await zcodeModel(profile),core=await runDaemon(root),host=await startZCodeHost({root,profile,binary});
 t.after(async()=>{model.release();await host.close();await core.close();await model.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const main=await host.createSession({alias:'main',mode:'yolo'}),worker=await host.createSession({alias:'worker',mode:'yolo'});
 const wait=async(check:()=>Promise<boolean>)=>{for(let n=0;n<150;n++){if(await check())return;await delay(100);}throw new Error('Native pair condition timed out');};
 for(const s of [main,worker]){await host.prompt(s.id,'CONNECT');await wait(async()=>host.connected().some(b=>b.identity.native_session_id===s.id) && (await host.read(s.id)).projection.status==='idle');}
 await host.prompt(worker.id,'HOLD');await wait(async()=>(await host.read(worker.id)).projection.status==='running');
 const params={operation:'delegate',request_id:randomUUID(),target:{query:'worker'},goal:'Native protocol fixture task',acceptance:['transport fixture only'],read_paths:['.'],write_paths:['output'],deadline_at:new Date(Date.now()+60000).toISOString()};
 await host.prompt(main.id,'CALL_SOURCE:'+JSON.stringify({method:'request',params}));const store=openStore(root);t.after(()=>store.close());
 await wait(async()=>Number(store.db.prepare('SELECT COUNT(*) AS n FROM deliveries').get()?.n)===1);
 await delay(800);const before=await host.read(worker.id);assert.equal(before.messages.some(m=>JSON.stringify(m).includes('Native protocol fixture task')),false);
 model.release();await wait(async()=>(await host.read(worker.id)).messages.some(m=>JSON.stringify(m).includes('Native protocol fixture task')));
 // Simulate the UI's fixed history tail moving beyond this message. Native
 // history reconciliation must still use the observed input ID, never later text.
 const originalRead=host.rpc.request.bind(host.rpc);let hidden=0;
 host.rpc.request=async(method,params)=>{const result=await originalRead(method,params);if(method==='session/read' && (params as {sessionId?:string}).sessionId===worker.id && hidden++<5){const snapshot=result as {messages:Record<string,unknown>[]};snapshot.messages=[];}return result;};
 const id=String(store.db.prepare('SELECT message_id FROM deliveries').get()?.message_id);
 try{await wait(async()=>Boolean(store.db.prepare("SELECT seq FROM plugin_observations WHERE message_id=? AND json_extract(observation_json,'$.state')='completed'").get(id)));}catch(error){t.diagnostic(JSON.stringify((await host.read(worker.id)).messages.map(m=>({info:m.info,textParts:Array.isArray(m.parts)?m.parts.filter(p=>p.type==='text').length:0}))));throw error;}
 host.rpc.request=originalRead;assert.ok(host.rpc.trace.includes('session/messages'));const snapshot=await host.read(worker.id);assert.equal(snapshot.messages.filter(m=>JSON.stringify(m).includes('[SessionBridge external agent data')).length,1);
 assert.equal(host.rpc.trace.some(m=>['session/resume','session/stop'].includes(m)),false);
 assert.equal(Number(store.db.prepare('SELECT COUNT(*) AS n FROM deliveries').get()?.n),1);
 await wait(async()=>(await host.read(main.id)).projection.status==='idle');
 await host.prompt(worker.id,'HOLD again');await wait(async()=>(await host.read(worker.id)).projection.status==='running');
 await host.prompt(main.id,'CALL_SOURCE:'+JSON.stringify({method:'request',params:{...params,request_id:randomUUID(),goal:'cancel-before-native-send'}}));
 await wait(async()=>Number(store.db.prepare('SELECT COUNT(*) AS n FROM tasks').get()?.n)===2);
 const task=store.db.prepare("SELECT task_id FROM tasks WHERE json_extract(input_json,'$.goal')='cancel-before-native-send'").get();
 await wait(async()=>(await host.read(main.id)).projection.status==='idle');
 await host.prompt(main.id,'CALL_SOURCE:'+JSON.stringify({method:'request',params:{operation:'cancel_pending',request_id:randomUUID(),task_id:String(task?.task_id)}}));
 await wait(async()=>Boolean(store.db.prepare('SELECT task_id FROM task_cancellations WHERE task_id=?').get(String(task?.task_id))));
 model.release();await wait(async()=>(await host.read(worker.id)).projection.status==='idle');await delay(1200);
 assert.equal((await host.read(worker.id)).messages.some(m=>JSON.stringify(m).includes('cancel-before-native-send')),false);
});
test('zcode_attached_capability_requires_bounded_native_pull_instead_of_arbitrary_idle_wake',async()=>{
 const {createPluginAdapter}=await import('../../src/adapters/plugin-client.js');
 const report=await createPluginAdapter('zcode',{list:async()=>[],call:async()=>{throw new Error('unused');}}).probe();
 assert.equal(report.modes.managed?.supported,true);assert.equal(report.modes.attached?.supported,true);assert.match(report.modes.attached!.constraints.join(' '),/native MCP plugin/);assert.match(report.modes.attached!.constraints.join(' '),/bounded active sessionbridge_wait/);assert.match(report.modes.attached!.constraints.join(' '),/No arbitrary idle wake/);
});
test('zcode_managed_host_refuses_the_active_user_home_profile',{skip:!existsSync(binary),timeout:10000},async()=>{
 const temp=mkdtempSync('/tmp/sb-zcode-home-'),before=process.env.HOME;process.env.HOME=temp;
 const rpc=new ZCodeRpc({binary,profile:temp,root:temp});
 try{await assert.rejects(()=>rpc.request('runtime/capabilities',{}),/isolated|独立/);assert.equal(rpc.pid,0);}finally{await rpc.close();process.env.HOME=before;rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
test('zcode_close_is_a_barrier_for_a_delayed_tick',{skip:!existsSync(binary),timeout:45000},async t=>{
 const root=mkdtempSync('/tmp/sb-zcode-close-'),profile=join(root,'profile');mkdirSync(profile);await initProject(root,{dryRun:false});const model=await zcodeModel(profile),core=await runDaemon(root),host=await startZCodeHost({root,profile,binary});
 t.after(async()=>{model.release();await host.close();await core.close();await model.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const main=await host.createSession({alias:'main',mode:'yolo'}),worker=await host.createSession({alias:'worker',mode:'yolo'});
 const wait=async(check:()=>Promise<boolean>)=>{for(let n=0;n<150;n++){if(await check())return;await delay(100);}throw new Error('Close barrier fixture timed out');};
 for(const s of [main,worker]){await host.prompt(s.id,'CONNECT');await wait(async()=>host.connected().some(b=>b.identity.native_session_id===s.id) && (await host.read(s.id)).projection.status==='idle');}
 await host.prompt(worker.id,'HOLD');await wait(async()=>(await host.read(worker.id)).projection.status==='running');
 await host.prompt(main.id,'CALL_SOURCE:'+JSON.stringify({method:'request',params:{operation:'delegate',request_id:randomUUID(),target:{query:'worker'},goal:'must-not-send-after-close',acceptance:['shutdown barrier'],read_paths:['.'],write_paths:['output'],deadline_at:new Date(Date.now()+60000).toISOString()}}));
 const store=openStore(root);t.after(()=>store.close());await wait(async()=>Number(store.db.prepare('SELECT COUNT(*) AS n FROM deliveries').get()?.n)===1);
 const original=host.rpc.request.bind(host.rpc);let release!:()=>void,blocked=false;const gate=new Promise<void>(r=>{release=r;});
 host.rpc.request=async(method,params)=>{const result=await original(method,params);if(method==='session/read' && (params as {sessionId?:string}).sessionId===worker.id && !blocked){blocked=true;await gate;(result as {projection:{status:string}}).projection.status='idle';}return result;};
 await wait(async()=>blocked);const sends=host.rpc.trace.filter(m=>m==='session/send').length,closing=host.close();release();model.release();await closing;
 assert.equal(host.rpc.trace.filter(m=>m==='session/send').length,sends);assert.equal(Number(store.db.prepare('SELECT COUNT(*) AS n FROM bindings WHERE active=1').get()?.n),0);
});
test('zcode_close_revokes_enrollment_that_finishes_during_shutdown',{skip:!existsSync(binary),timeout:30000},async t=>{
 const root=mkdtempSync('/tmp/sb-zcode-enroll-close-'),profile=join(root,'profile');mkdirSync(profile);await initProject(root,{dryRun:false});const model=await zcodeModel(profile),core=await runDaemon(root),host=await startZCodeHost({root,profile,binary});
 const {BindingService}=await import('../../src/core/bindings.js');const original=BindingService.prototype.enroll;let release!:()=>void,blocked=false;const gate=new Promise<void>(r=>{release=r;});
 BindingService.prototype.enroll=async function(...args:Parameters<typeof original>){blocked=true;await gate;return original.apply(this,args);};
 t.after(async()=>{release();BindingService.prototype.enroll=original;await host.close();await core.close();await model.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const session=await host.createSession({alias:'closing',mode:'yolo'});await host.prompt(session.id,'CONNECT');for(let n=0;n<100 && !blocked;n++)await delay(100);assert.equal(blocked,true);
 const closing=host.close();release();await closing;const store=openStore(root);try{assert.equal(Number(store.db.prepare('SELECT COUNT(*) AS n FROM bindings WHERE active=1').get()?.n),0);assert.equal(host.connected().length,0);}finally{store.close();}
});
