import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync,chmodSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runCli} from '../../src/cli/main.js';
import {initProject} from '../../src/cli/init.js';
import {openStore} from '../../src/core/database.js';
import {BindingService,issueEnrollment} from '../../src/core/bindings.js';
import {harnessGuidance} from '../../src/adapters/guidance.js';
import {HARNESSES} from '../../src/install/plan.js';
import type {BindingRecord} from '../../src/protocol/types.js';

async function cli(args:string[]){let out='',err='';const code=await runCli(args,{stdin:'',stdout:s=>{out+=s;},stderr:s=>{err+=s;},isTTY:false});return {code,out,err,value:out?JSON.parse(out):null};}
function root(t:{after:(fn:()=>void)=>void}){const p=mkdtempSync('/tmp/byte-bridge-preflight-');t.after(()=>rmSync(p,{recursive:true,force:true}));return p;}
test('all installed harnesses have one Bridge-only native activation route',()=>{
 for(const name of HARNESSES){const g=harnessGuidance(name);assert.ok(g.attached || g.managed);assert.ok(g.activation);assert.ok(g.tool);assert.ok(g.limit);}
 assert.equal(harnessGuidance('kimi').attached,null);assert.equal(harnessGuidance('hermes').attached,'canonical_gateway_tui');assert.equal(harnessGuidance('zcode').managed,'app_server');
});
test('preflight on an empty project creates no files, services or sessions',async t=>{
 const p=root(t),r=await cli(['preflight','--harness','codex','--with','claude,opencode,zcode,dsh,hermes','--project',p,'--json']);
 assert.equal(r.code,0,r.err);assert.equal(r.value.state,'needs_setup');assert.equal(r.value.transport,'byte-bridge');assert.equal(r.value.other_delivery_routes_allowed,false);assert.equal(r.value.native_context_verified,false);assert.equal(r.value.peers.length,5);assert.deepEqual(readdirSync(p),[]);
});
test('invalid harness fails before any initialization',async t=>{
 const p=root(t),r=await cli(['preflight','--with','hermess','--project',p]);assert.equal(r.code,4);assert.match(r.err,/unsupported_harness/);assert.deepEqual(readdirSync(p),[]);
});
test('preflight reports exact ambiguous targets without claiming execution or changing private state',async t=>{
 const p=root(t);await initProject(p,{dryRun:false});const s=openStore(p);let a:BindingRecord;
 try{for(const id of ['one','two']){
  a={binding_id:id,identity:{harness:'zcode',host_id:'host',profile_id:'profile',native_session_id:id,project_id:s.project_id,runtime_generation:'gen'},alias:'writer',mode:'managed',capabilities:[],endpoint_ref:'private-secret-endpoint',expires_at:new Date(Date.now()+60000).toISOString(),active:true};
  await new BindingService(s).enroll(issueEnrollment(s),a);
 }}finally{s.close();}
 const db=join(p,'.session-bridge/bridge.sqlite'),hash=()=>createHash('sha256').update(readFileSync(db)).digest('hex'),before=hash();chmodSync(db,0o640);const mode=statSync(db).mode;
 const r=await cli(['preflight','--harness','codex','--with','zcode','--query','writer','--project',p]);
 assert.equal(r.code,0,r.err);assert.equal(r.value.peers[0].state,'needs_selection');assert.equal(r.value.peers[0].candidates.length,2);assert.equal(r.value.task_execution_verified,false);assert.ok(!r.out.includes('private-secret-endpoint'));assert.equal(hash(),before);assert.equal(statSync(db).mode,mode);
 const exact=await cli(['preflight','--harness','codex','--with','zcode','--query','one','--project',p]);assert.equal(exact.value.peers[0].candidates.length,1);assert.equal(exact.value.peers[0].candidates[0].binding_id,'one');
});
test('readonly store refuses to migrate an older database',async t=>{
 const p=root(t);await initProject(p,{dryRun:false});const s=openStore(p);s.db.exec('PRAGMA user_version=1');s.close();
 assert.throws(()=>openStore(p,{readOnly:true}),/schema upgrade/);const db=join(p,'.session-bridge/bridge.sqlite'),before=readFileSync(db);
 const r=await cli(['preflight','--with','claude','--project',p]);assert.equal(r.value.state_error,'schema_upgrade_required');assert.deepEqual(readFileSync(db),before);
});
