import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync,readFileSync,writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runCli} from '../../src/cli/main.js';
async function cli(args:string[],stdin=''){let out='',err='';const code=await runCli(args,{stdin,stdout:s=>{out+=s;},stderr:s=>{err+=s;},isTTY:false});return {code,out,err,value:out?JSON.parse(out):null};}
test('setup_dry_run_is_readonly_and_explains_connection_modes',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-plan-');t.after(()=>rmSync(root,{recursive:true,force:true}));
 const r=await cli(['setup','--harness','codex','--with','zcode','--project',root,'--dry-run','--json']);assert.equal(r.code,0,r.err);assert.equal(r.value.state,'planned');assert.deepEqual(readdirSync(root),[]);assert.equal(r.value.harnesses.zcode.attached,'requires_native_plugin');assert.equal(r.value.models_started,0);
});
test('setup_reuses_one_bounded_service_and_stop_requires_the_original_process',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-');t.after(async()=>{await cli(['service','stop','--project',root]);rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const args=['setup','--harness','codex','--project',root,'--stdin','--json'],input=JSON.stringify({lifetime_seconds:30});
 const first=await cli(args,input);assert.equal(first.value?.service.state,'started',first.err);assert.equal(first.value.models_started,0);assert.equal(first.value.connection.state,'needs_connection');
 const doctor=await cli(['doctor','--project',root,'--json']);assert.equal(doctor.value.service,'running');assert.equal(doctor.value.source,'unavailable');assert.equal(first.value.targets_ready.codex,false);
 const second=await cli(args,input);assert.equal(second.value.service.state,'reused',second.err);assert.equal(second.value.service.pid,first.value.service.pid);
 const path=join(root,'.session-bridge','service.json'),original=readFileSync(path,'utf8'),record=JSON.parse(original);writeFileSync(path,JSON.stringify({...record,started_at:'different-process'}),{mode:0o600});
 const refused=await cli(['service','stop','--project',root,'--json']);assert.equal(refused.code,3);writeFileSync(path,original,{mode:0o600});
 const planned=await cli(['service','stop','--dry-run','--project',root,'--json']);assert.equal(planned.value.state,'planned');assert.equal((await cli(['service','status','--project',root])).value.state,'running');
 const stopped=await cli(['service','stop','--project',root,'--json']);assert.equal(stopped.code,0,stopped.err);assert.equal(stopped.value.state,'stopped');
});
test('setup_rejects_unknown_configuration_before_creating_project_state',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-invalid-');t.after(()=>rmSync(root,{recursive:true,force:true}));const r=await cli(['setup','--harness','codex','--project',root,'--stdin'],'{"lifetime_seconds":30,"actor":"forged"}');assert.equal(r.code,4);assert.deepEqual(readdirSync(root),[]);
});
test('setup_owned_service_expires_without_a_permanent_monitor',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-ttl-');t.after(async()=>{await cli(['service','stop','--project',root]);rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const result=await cli(['setup','--harness','codex','--project',root,'--stdin'],'{"lifetime_seconds":1}');assert.equal(result.value?.service.state,'started',result.err);
 let state='';for(let n=0;n<35;n++){await delay(100);state=(await cli(['service','status','--project',root])).value?.state;if(state==='stopped')break;}assert.equal(state,'stopped');
});
test('service_status_detects_a_frozen_owned_coordinator_instead_of_claiming_ready',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-frozen-');let pid=0;
 t.after(async()=>{if(pid)try{process.kill(pid,'SIGCONT');}catch{}await cli(['service','stop','--project',root]);rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const result=await cli(['setup','--harness','codex','--project',root,'--stdin'],'{"lifetime_seconds":30}');pid=result.value.service.pid;
 try{process.kill(pid,'SIGSTOP');const frozen=await cli(['service','status','--project',root]);assert.equal(frozen.value.state,'unresponsive');assert.equal(frozen.value.owned,true);}finally{process.kill(pid,'SIGCONT');}
});
test('setup_installs_multiple_harnesses_without_stale_shared_Skill_plans',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-multi-');t.after(async()=>{await cli(['service','stop','--project',root]);rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const r=await cli(['setup','--harness','zcode','--with','codex','--project',root,'--stdin'],'{"lifetime_seconds":30}');assert.ok(r.value,r.err);assert.deepEqual(r.value.installations.map((x:{harness:string})=>x.harness),['zcode','codex']);assert.equal(r.value.service.state,'started');
});

test('setup_refuses_a_service_log_symlink_without_touching_its_target',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-log-');t.after(async()=>{await cli(['service','stop','--project',root]);rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const outside=join(root,'outside.txt');writeFileSync(outside,'keep');mkdirSync(join(root,'.session-bridge'),{mode:0o700});symlinkSync(outside,join(root,'.session-bridge','service.log'));
 const result=await cli(['setup','--harness','codex','--project',root,'--stdin'],'{"lifetime_seconds":30}');assert.equal(result.code,3);assert.equal(readFileSync(outside,'utf8'),'keep');
});

test('bounded_worker_does_not_inherit_parent_eval_runtime_flags',async t=>{
 const root=mkdtempSync('/tmp/sb-setup-flags-');t.after(async()=>{await cli(['service','stop','--project',root]);rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const {initProject}=await import('../../src/cli/init.js');await initProject(root,{dryRun:false});
 const {spawnSync}=await import('node:child_process'),{pathToFileURL}=await import('node:url');
 const url=pathToFileURL(join(process.cwd(),'dist/src/cli/service.js')).href;
 const r=spawnSync(process.execPath,['--input-type=module','--eval',`import {ensureService} from ${JSON.stringify(url)}; await ensureService(${JSON.stringify(root)},30);`],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);
});
