import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {runCli} from '../../src/cli/main.js';
import {sourceToolSchema} from '../../src/adapters/source-tool.js';
async function cli(args:string[]){let out='',err='';const code=await runCli(args,{stdin:'',stdout:s=>{out+=s;},stderr:s=>{err+=s;},isTTY:false});return {code,out,err};}
test('describe_reads_the_live_contract_without_a_project_or_native_source',async t=>{
 const root=mkdtempSync('/tmp/sb-contract-offline-');t.after(()=>rmSync(root,{recursive:true,force:true}));
 const r=await cli(['describe','--query','request.delegate','--json','--project',root]);assert.equal(r.code,0,r.err);
 const doc=JSON.parse(r.out);assert.equal(doc.schema_version,1);assert.equal(doc.contracts.length,1);assert.equal(doc.contracts[0].id,'request.delegate');
 assert.ok(doc.contracts[0].schema.required.includes('target'));assert.equal(doc.contracts[0].examples[0].input.target.query,'worker');assert.deepEqual(readdirSync(root),[]);
});
test('unknown_contract_is_explicit_and_does_not_fall_back_to_another_operation',async()=>{
 const r=await cli(['describe','--query','request.not-real','--json']);assert.equal(r.code,4);assert.equal(JSON.parse(r.err).error.code,'unknown_contract');assert.equal(r.out,'');
});
test('native_source_tool_rejects_wrong_parameter_shapes_before_any_dispatch',()=>{
 const invalid=[{method:'context',params:{actor:{native_session_id:'forged'}}},{method:'configure_roles',params:{request_id:'r',main:'current',supervisor:{query:'reviewer'}}},{method:'delegate_task',params:{request_id:'r',target:{binding_id:'invented'}}},{method:'acknowledge_task',params:{task_id:'t',action:'plan_next'}},{method:'acknowledge_task',params:{task_id:'t',action:'verify'}},{method:'report_result',params:{task_id:'t',summary:'done',artifact_paths:[],actor:'forged'}}];
 for(const input of invalid)assert.equal(sourceToolSchema.safeParse(input).success,false,JSON.stringify(input));
});
test('native_source_tool_accepts_documented_conditional_fields_and_offset_deadlines',()=>{
 assert.equal(sourceToolSchema.safeParse({method:'get_task_status',params:{}}).success,true);
 assert.equal(sourceToolSchema.safeParse({method:'acknowledge_task',params:{task_id:'t'}}).success,true);
 assert.equal(sourceToolSchema.safeParse({method:'acknowledge_task',params:{task_id:'t',action:'plan_next',next_action_id:'continue-1',next_instruction:'verify integration',next_argv:['python3','verify/continue.py'],next_artifact_paths:['output/continued.json']}}).success,true);
});

import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseRequest} from '../../src/cli/request.js';
test('all_discovered_examples_validate_at_their_actual_runtime_boundary',async()=>{
 const r=await cli(['describe','--json']);assert.equal(r.code,0,r.err);
 const doc=JSON.parse(r.out);assert.ok(doc.contracts.length>20);
 for(const entry of doc.contracts){assert.ok(entry.examples.length>0,entry.id);for(const example of entry.examples){
  if(entry.id.startsWith('request.'))assert.doesNotThrow(()=>parseRequest(example.input),entry.id);
  if(entry.id.startsWith('tool.'))assert.equal(sourceToolSchema.safeParse({method:entry.id==='tool.list_sessions'?'sessions':entry.id.slice(5),params:example.input}).success,true,entry.id);
 }}
});
test('contract_checker_rejects_stale_generated_examples_and_nested_plugin_copies_without_rewriting',t=>{
 const root=mkdtempSync('/tmp/sb-contract-check-');t.after(()=>rmSync(root,{recursive:true,force:true}));cpSync('skills',join(root,'skills'),{recursive:true});
 const run=(...args:string[])=>spawnSync(process.execPath,['scripts/check-command-contracts.mjs','--root',root,...args],{encoding:'utf8'});
 let result=run('--write');assert.equal(result.status,0,result.stderr);
 for(const host of ['codex','claude','pi','hermes','dsh','zcode','kimi','opencode']){mkdirSync(join(root,'plugins',host),{recursive:true});cpSync(join(root,'skills'),join(root,'plugins',host,'skills'),{recursive:true});}
 result=run();assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'','Check diagnostics must not corrupt npm pack --json stdout');
 const nested=join(root,'plugins','pi','skills','sessionbridge-do','references','workflow.md'),original=readFileSync(nested,'utf8');writeFileSync(nested,original+'\nstale-contract\n');
 result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/pi.*workflow\.md/);assert.equal(readFileSync(nested,'utf8'),original+'\nstale-contract\n');writeFileSync(nested,original);
 const generated=join(root,'skills','sessionbridge-do','references','commands.generated.md'),fresh=readFileSync(generated,'utf8');writeFileSync(generated,fresh.replace('"query": "worker"','"binding_id": "wrong-field"'));
 result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/generated|重新生成/);assert.notEqual(readFileSync(generated,'utf8'),fresh);
});

import {actionInputSchema} from '../../src/return/native-action.js';
import {callForTool} from '../../src/protocol/command-inputs.js';
test('continuation_contract_requires_the_previously_fixed_next_action_id',()=>{
 const input={task_id:'task',purpose:'continuation',argv:['python3','verify/continue.py'],artifact_paths:['output/continued.json']};
 assert.equal(actionInputSchema.safeParse(input).success,false);assert.equal(actionInputSchema.safeParse({...input,next_action_id:'next-1'}).success,true);
});
test('flat_tool_routing_preserves_exact_selection_and_does_not_leak_flat_fields',()=>{
 const route=callForTool('delegate_task',{request_id:'ctx-native',target_query:'binding-selected',target_harness:'zcode',target_profile:'profile',goal:'read source',acceptance:['real file'],read_paths:['src'],write_paths:['output'],deadline_at:'2099-01-01T08:00:00+08:00'});
 assert.deepEqual(route,{method:'request',params:{request_id:'ctx-native',operation:'delegate',target:{query:'binding-selected',harness:'zcode',profile_id:'profile'},goal:'read source',acceptance:['real file'],read_paths:['src'],write_paths:['output'],deadline_at:'2099-01-01T08:00:00+08:00'}});
 assert.deepEqual(callForTool('configure_roles',{request_id:'ctx-role',supervisor_query:'reviewer'}),{method:'request',params:{request_id:'ctx-role',operation:'assign_roles',main:'current',supervisor:{query:'reviewer'}}});
});
