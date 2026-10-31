import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
const modulePath='../../src/adapters/zcode/'+'intake.js';
test('zcode_attachment_identity_comes_from_exact_native_tool_evidence_not_text',async t=>{
 const {resolveNativeChallenge}=await import(modulePath),root=mkdtempSync('/tmp/sb-zcode-proof-');t.after(()=>rmSync(root,{recursive:true,force:true}));const project=join(root,'project');mkdirSync(project);const file=join(root,'native.sqlite'),db=new DatabaseSync(file);t.after(()=>db.close());
 db.exec('CREATE TABLE session(id TEXT,directory TEXT,time_archived INTEGER,time_deleted INTEGER);CREATE TABLE message(id TEXT,session_id TEXT,data TEXT);CREATE TABLE part(id TEXT,session_id TEXT,message_id TEXT,time_created INTEGER,data TEXT)');
 db.prepare('INSERT INTO session VALUES (?,?,NULL,NULL)').run('native-one',project);db.prepare('INSERT INTO message VALUES (?,?,?)').run('assistant','native-one',JSON.stringify({role:'assistant'}));
 const challenge=randomUUID(),put=(id:string,session:string,data:unknown)=>db.prepare('INSERT INTO part VALUES (?,?,?,?,?)').run(id,session,'assistant',Date.now(),JSON.stringify(data));
 put('wrong-tool','native-one',{type:'text',text:challenge});assert.equal(resolveNativeChallenge(file,project,challenge),null);
 put('wrong-suffix','native-one',{type:'tool',tool:'mcp__other__sessionbridgeXattach',state:{input:{challenge},status:'running'}});assert.equal(resolveNativeChallenge(file,project,challenge),null);
 put('native-call','native-one',{type:'tool',tool:'mcp__sessionbridge__sessionbridge_attach',state:{input:{challenge},status:'running'}});
 const before=statSync(file).mtimeMs;assert.equal(resolveNativeChallenge(file,project,challenge).session_id,'native-one');assert.equal(statSync(file).mtimeMs,before);assert.equal(resolveNativeChallenge(file,root,challenge),null);
 db.prepare('UPDATE session SET time_archived=1').run();assert.equal(resolveNativeChallenge(file,project,challenge),null);
});
test('zcode_attachment_refuses_non_native_external_processes',async()=>{
 const {originalZCodeOwner}=await import(modulePath);await assert.rejects(()=>originalZCodeOwner(),/native|original|原生/i);
});

import {existsSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {ZCodeRpc} from '../../src/adapters/zcode/rpc.js';
import {initProject} from '../../src/cli/init.js';
import {runDaemon} from '../../src/cli/daemon.js';
import {zcodeModel} from '../helpers/zcode-model.js';
import {openStore} from '../../src/core/database.js';
const binary='/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs';
test('zcode_warm_existing_native_session_attaches_via_its_own_tool_history',{skip:!existsSync(binary),timeout:45000},async t=>{
 const root=realpathSync(mkdtempSync('/tmp/sb-zcode-existing-')),profile=join(root,'home');mkdirSync(profile);await initProject(root,{dryRun:false});const model=await zcodeModel(profile,'attached'),rpc=new ZCodeRpc({root,profile,binary});let core=await runDaemon(root);
 t.after(async()=>{await rpc.close();await core.close();await model.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const id='sess_'+randomUUID(),mcp=fileURLToPath(new URL('../../src/adapters/zcode/attached-mcp.js',import.meta.url));
 await rpc.request('session/create',{sessionId:id,workspace:{workspacePath:root,workspaceKey:'isolated-intake-test'},mode:'yolo',titleGenerationEnabled:false,mcpServers:[{name:'sessionbridge',command:process.execPath,args:[mcp],isolation:'workspace',env:[{name:'SESSIONBRIDGE_PROJECT',value:root},{name:'HOME',value:profile}]}]});
 const nativeRead=()=>rpc.request('session/read',{sessionId:id,messageLimit:50}) as Promise<{projection:{status:string};messages:unknown[]}>;
 await rpc.request('session/send',{sessionId:id,inputId:randomUUID(),content:'WARM existing session without using tools'});
 for(let n=0;n<200;n++){const s=await nativeRead();if(s.projection.status==='idle' && s.messages.length)break;await delay(100);}
 const before=openStore(root);assert.equal(before.db.prepare('SELECT COUNT(*) n FROM bindings').get()!.n,0);before.close();const originalPid=rpc.pid;await rpc.request('session/send',{sessionId:id,inputId:randomUUID(),content:'CONNECT the already opened native session using sessionbridge_attach challenge handshake'});
 let binding:Record<string,unknown>|undefined;for(let n=0;n<120;n++){const store=openStore(root);binding=store.db.prepare("SELECT mode,identity_json FROM bindings WHERE active=1").get();store.close();if(binding)break;await delay(100);}
 assert.ok(binding,'Original native MCP tool handshake did not produce a binding');assert.equal(binding.mode,'attached');assert.equal(JSON.parse(String(binding.identity_json)).native_session_id,id);assert.equal(rpc.pid,originalPid);
 const call=async(sessionId:string,name:string,input:Record<string,unknown>)=>{
  const done=(s:{projection:{status:string};messages:unknown[]})=>{const last=s.messages.at(-1) as {info?:{role?:string;finish?:string}}|undefined;return s.projection.status==='idle' && last?.info?.role==='assistant' && last.info.finish==='stop';};
  for(let n=0;n<150;n++){const prior=await rpc.request('session/read',{sessionId,messageLimit:50}) as {projection:{status:string};messages:unknown[]};if(done(prior) || (prior.projection.status==='idle' && !prior.messages.length))break;if(n===149)throw new Error('Original native turn still busy before fixture send');await delay(100);}
  const marker='CALL_'+randomUUID()+' NATIVE_CALL:'+JSON.stringify({name,input});await rpc.request('session/send',{sessionId,inputId:randomUUID(),content:marker});
  for(let n=0;n<150;n++){const s=await rpc.request('session/read',{sessionId,messageLimit:50}) as {projection:{status:string};messages:unknown[]};if(done(s) && JSON.stringify(s.messages).includes(JSON.stringify(marker).slice(1,-1)))return s;await delay(100);}throw new Error('Native fixture did not settle');
 };
 const context=await call(id,'sessionbridge_request',{request:{method:'context',params:{}}});assert.ok(JSON.stringify(context).includes('native_session_id'),JSON.stringify(context));
 const peer='sess_'+randomUUID();await rpc.request('session/create',{sessionId:peer,workspace:{workspacePath:root,workspaceKey:'isolated-intake-test'},mode:'yolo',titleGenerationEnabled:false,mcpServers:[{name:'sessionbridge',command:process.execPath,args:[mcp],isolation:'workspace',env:[{name:'SESSIONBRIDGE_PROJECT',value:root},{name:'HOME',value:profile}]}]});
 const denied=await call(peer,'sessionbridge_request',{request:{method:'context',params:{}}});assert.match(JSON.stringify(denied),/Connect original native intake first/);
 await call(peer,'sessionbridge_attach',{alias:'peer-worker'});const both=openStore(root);const ids=both.db.prepare('SELECT identity_json FROM bindings WHERE active=1').all().map(r=>JSON.parse(String(r.identity_json)).native_session_id).sort();both.close();assert.deepEqual(ids,[id,peer].sort());const shared=openStore(root);const generations=shared.db.prepare('SELECT identity_json FROM bindings WHERE active=1').all().map(r=>JSON.parse(String(r.identity_json)).runtime_generation);shared.close();assert.equal(new Set(generations).size,1,'Sessions must share one actual MCP generation for this regression');
 const params={operation:'delegate',request_id:randomUUID(),target:{query:'zcode-attached'},goal:'cancel-before-native-pull',acceptance:['transport fixture only'],read_paths:['.'],write_paths:['output'],deadline_at:new Date(Date.now()+60000).toISOString()};
 await call(peer,'sessionbridge_request',{request:{method:'request',params}});const taskStore=openStore(root);const task=taskStore.db.prepare("SELECT task_id FROM tasks WHERE json_extract(input_json,'$.goal')='cancel-before-native-pull'").get();taskStore.close();assert.ok(task);
 const cancellation=await call(peer,'sessionbridge_request',{request:{method:'request',params:{operation:'cancel_pending',request_id:randomUUID(),task_id:task.task_id}}});const cancelledStore=openStore(root);assert.ok(cancelledStore.db.prepare('SELECT task_id FROM task_cancellations WHERE task_id=?').get(String(task.task_id)),JSON.stringify(cancellation));cancelledStore.close();
 const cancelled=await call(id,'sessionbridge_wait',{timeout_seconds:1});assert.ok(!JSON.stringify(cancelled).includes('cancel-before-native-pull'),'Cancelled queued work was delivered to the original model');
 await core.close();core=await runDaemon(root);assert.equal(rpc.pid,originalPid);const afterRestart=await call(peer,'sessionbridge_request',{request:{method:'context',params:{}}});assert.match(JSON.stringify(afterRestart),new RegExp(peer));
 const empty=await call(id,'sessionbridge_wait' ,{timeout_seconds:1});assert.match(JSON.stringify(empty),/empty/);
 const leaseStore=openStore(root);const actualLease=leaseStore.db.prepare("SELECT expires_at FROM bindings WHERE active=1 AND json_extract(identity_json,'$.native_session_id')=?").get(id);leaseStore.close();assert.ok(Date.parse(String(actualLease?.expires_at))-Date.now()<=900000,'Native binding outlives the authorized intake');
 await call(id,'sessionbridge_detach',{});const remaining=openStore(root);assert.deepEqual(remaining.db.prepare('SELECT identity_json FROM bindings WHERE active=1').all().map(r=>JSON.parse(String(r.identity_json)).native_session_id),[peer]);remaining.close();
 const stale=await call(id,'sessionbridge_request',{request:{method:'context',params:{}}});assert.match(JSON.stringify(stale),/Connect original native intake first/);
});
