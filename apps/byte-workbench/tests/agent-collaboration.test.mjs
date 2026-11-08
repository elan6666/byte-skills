import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readBoard,writeBoard,changeBoard,emptyBoard,validateBoard} from '../../../skills/byte-plan/scripts/workboard.mjs';
import {createAgent,agentDocument,agentContext,bindAgent,saveOrg,listAgents} from '../../../skills/byte-plan/scripts/agents.mjs';
import {readyTasks,prepareTask,reconcileTask,resumeTask} from '../../../skills/byte-plan/scripts/collaboration.mjs';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'byte-agents-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
const identity=(harness='codex',id='main')=>({harness,native_session_id:id,host_id:'host',profile_id:'native-profile',project_id:'project',runtime_generation:'generation'});
function setup(t,{harness='zcode',id='worker',requestId='native-request'}={}){
 const root=fixture(t),source=identity(),target=identity(harness,id),context={identity:source,request_id:requestId};
 createAgent(root,'analyst',{content:'# 分析员\n负责检查输入、制作交付物并回报证据。'});bindAgent(root,'analyst',target);
 const task={id:'analyze',title:'检查输入',objective:'处理选定输入并输出核验报告',status:'todo',agentId:'analyst',participants:[],acceptance:['独立核验报告'],inputs:['data/input.json'],outputs:['reports/result.json'],readPaths:['data/'],writePaths:['reports/'],steps:[{id:'work',title:'完成核验',status:'todo',evidence:[]}]};
 writeBoard(root,readBoard(root).revision,b=>changeBoard(b,'task',task));
 const sessions={sessions:[{binding_id:'binding-worker',identity:target,active:true,expires_at:'2099-01-01T00:00:00Z'}]};
 return {root,source,target,context,task,sessions,prepare:()=>prepareTask(root,task.id,context,sessions,{deadlineAt:'2098-01-01T00:00:00Z'})};
}
function bridgeRecord(f,p,state='result_reported'){
 const {target,operation,request_id,...scope}=p.request;
 return {task_id:'bridge-original',state,input:{...scope,source:f.source,target:f.target,return_to:f.source}};
}
test('unconfigured projects stay unchanged and ordinary boards remain compatible',t=>{
 const root=fixture(t);assert.deepEqual(readBoard(root),emptyBoard());assert.deepEqual(listAgents(root),[]);assert.equal(readyTasks(root).ready.length,0);assert.equal(existsSync(join(root,'.byte-os')),false);validateBoard(emptyBoard());
});
test('editable agent documents persist independently of chat bindings; create never overwrites',t=>{
 const root=fixture(t);createAgent(root,'研究员',{content:'# 研究员\n阅读论文。'});assert.equal(listAgents(root)[0].session,null);
 assert.throws(()=>createAgent(root,'研究员'),/EEXIST/);const path=join(root,'.byte-os/agents/研究员.md');writeFileSync(path,'# 新职责\n由用户定制。');
 const source=identity('dsh','session-1');bindAgent(root,'研究员',source);assert.match(agentContext(root,{actor:{session:source}}).agents[0].content,/由用户定制/);
 bindAgent(root,'研究员',identity('codex','replacement'));assert.equal(agentContext(root,source).agents.length,0);assert.equal(agentDocument(root,'研究员').title,'新职责');bindAgent(root,'研究员',null);assert.equal(listAgents(root)[0].session,null);
});
test('document paths cannot escape or replace user files through links',t=>{
 const root=fixture(t),outside=fixture(t);assert.throws(()=>createAgent(root,'../escape'),/stable agent ID/);
 mkdirSync(join(root,'.byte-os'));symlinkSync(outside,join(root,'.byte-os/agents'));assert.throws(()=>createAgent(root,'worker'),/Linked path/);assert.equal(existsSync(join(outside,'worker.md')),false);
});
test('ORG is an optional derived view and preserves manual edits',t=>{
 const root=fixture(t);createAgent(root,'reviewer');saveOrg(root);assert.match(readFileSync(join(root,'.byte-os/ORG.md'),'utf8'),/agents\/reviewer.md/);saveOrg(root,'docs/agents.md');assert.match(readFileSync(join(root,'docs/agents.md'),'utf8'),/\.\.\/\.byte-os\/agents\/reviewer.md/);
 writeFileSync(join(root,'.byte-os/ORG.md'),'# User overview');assert.throws(()=>saveOrg(root),/Preserve/);assert.equal(readFileSync(join(root,'.byte-os/ORG.md'),'utf8'),'# User overview');
 saveOrg(root,'docs/generated.md');writeFileSync(join(root,'docs/generated.md'),readFileSync(join(root,'docs/generated.md'),'utf8')+'edited');assert.throws(()=>saveOrg(root,'docs/generated.md'),/Preserve/);
});
for(const harness of ['codex','zcode','dsh','claude'])test('generic handoff prepares for '+harness+' without sending or redispatching',t=>{
 const f=setup(t,{harness}),prepared=f.prepare();assert.equal(prepared.route,'bridge');assert.equal(prepared.request.target.query,'binding-worker');assert.equal(prepared.request.target.harness,harness);assert.match(prepared.request.goal,/Role document snapshot/);assert.ok(prepared.request.read_paths.includes('.byte-os/agents/analyst.md'));assert.deepEqual(prepared.request.write_paths,['reports/']);assert.equal(readBoard(f.root).items[0].status,'todo');
 const repeated=f.prepare();assert.equal(repeated.route,'recover');assert.deepEqual(repeated.statusParams,{for_request:'native-request'});assert.equal(repeated.request,undefined);
});
test('exact native context, unique active binding and bounded task contract are needed',t=>{
 const f=setup(t);const opts={deadlineAt:'2098-01-01T00:00:00Z'};
 assert.throws(()=>prepareTask(f.root,'analyze',{identity:{harness:'codex'}},f.sessions,opts),/complete native/);
 assert.throws(()=>prepareTask(f.root,'analyze',f.context,{sessions:[...f.sessions.sessions,{...f.sessions.sessions[0],binding_id:'duplicate',identity:{...f.target,runtime_generation:'other-generation'}}]},opts),/one active/);
 assert.throws(()=>prepareTask(f.root,'analyze',f.context,{sessions:[]},opts),/one active/);
 assert.throws(()=>prepareTask(f.root,'analyze',f.context,f.sessions,{deadlineAt:'2000-01-01T00:00:00Z'}),/future/);assert.equal(readBoard(f.root).items[0].handoff,undefined);
});
test('source chat uses local role context instead of delegating to itself',t=>{
 const f=setup(t,{harness:'codex',id:'main'});assert.equal(f.prepare().route,'local');assert.equal(readBoard(f.root).items[0].handoff,undefined);
});
test('dependency cycles fail; worker report stays review until main accepts real evidence',t=>{
 const f=setup(t);writeBoard(f.root,readBoard(f.root).revision,b=>changeBoard(b,'task',{...f.task,id:'follow-up',dependsOn:['analyze']}));
 assert.deepEqual(readyTasks(f.root).ready.map(t=>t.id),['analyze']);assert.throws(()=>writeBoard(f.root,readBoard(f.root).revision,b=>b.items[0].dependsOn=['follow-up']),/cycle/);
 const p=f.prepare(),record=bridgeRecord(f,p);reconcileTask(f.root,'analyze',record,{review:true,receipt:{request_id:'native-request',task_id:'bridge-original'}});assert.equal(readBoard(f.root).items[0].status,'review');assert.deepEqual(readyTasks(f.root).ready,[]);
 writeBoard(f.root,readBoard(f.root).revision,b=>{const task=b.items[0];task.steps[0].status='done';task.steps[0].evidence=['reports/result.json#independent-main-check'];task.status='done';});
 assert.deepEqual(readyTasks(f.root).ready.map(t=>t.id),['follow-up']);assert.equal(reconcileTask(f.root,'analyze',record,{review:true}).status,'done');
});
test('unrelated receipts and changed scopes cannot be linked; original task is preserved',t=>{
 const f=setup(t),p=f.prepare(),record=bridgeRecord(f,p,'running');reconcileTask(f.root,'analyze',record,{receipt:{request_id:'native-request',task_id:'bridge-original'}});assert.equal(readBoard(f.root).items[0].bridgeTaskId,'bridge-original');assert.equal(f.prepare().statusParams.task_id,'bridge-original');
 assert.throws(()=>reconcileTask(f.root,'analyze',record,{review:true}),/no reported/);
 assert.throws(()=>reconcileTask(f.root,'analyze',{...record,task_id:'different'}),/original Bridge/);
 assert.throws(()=>reconcileTask(f.root,'analyze',{...record,input:{...record.input,write_paths:['.']}}),/does not match/);
 assert.throws(()=>reconcileTask(f.root,'analyze',{...record,input:{...record.input,target:{...f.target,runtime_generation:'new'}}}),/does not match/);
});
test('workflow-engine projects retain their existing transitions and task ownership',t=>{
 const f=setup(t),folder=join(f.root,'.byte-os/coordination');mkdirSync(folder);const state=JSON.stringify({overall_outcome:{workflow:{engine:'byte-workflow/v1',revision:4}},owner_session:'codex:main'});writeFileSync(join(folder,'state.json'),state);const before=readBoard(f.root).revision;
 assert.equal(f.prepare().route,'workflow');assert.equal(readyTasks(f.root).route,'workflow');assert.deepEqual(readyTasks(f.root).ready,[]);assert.equal(readBoard(f.root).revision,before);assert.equal(readFileSync(join(folder,'state.json'),'utf8'),state);
});
test('two project types can use the same real CLI with custom roles and task contracts',t=>{
 for(const [role,objective] of [['developer','修复并测试模块'],['researcher','检查数据并提交研究报告']]){
  const root=fixture(t),script=new URL('../../../skills/byte-plan/scripts/agents.mjs',import.meta.url).pathname;
  const run=spawnSync(process.execPath,[script,'--project',root,'--action','create','--id',role,'--title',objective],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).title,objective);
  const list=spawnSync(process.execPath,[script,'--project',root,'--action','list'],{encoding:'utf8'});assert.equal(list.status,0,list.stderr);assert.equal(JSON.parse(list.stdout).agents[0].id,role);
 }
});

test('an interrupted preparation resumes only the immutable request in its original source',t=>{
 const f=setup(t),p=f.prepare();
 assert.throws(()=>reconcileTask(f.root,'analyze',bridgeRecord(f,p)),/for_request receipt/);
 assert.throws(()=>resumeTask(f.root,'analyze',{identity:f.target},null),/original native source/);
 const restored=resumeTask(f.root,'analyze',f.context,{state:'executed',result:null});assert.deepEqual(restored.request,p.request);
 const found=resumeTask(f.root,'analyze',f.context,{request_id:'native-request',task_id:'bridge-original',message_id:'message-original'});assert.equal(found.route,'recover');assert.equal(found.messageId,'message-original');assert.equal(found.request,undefined);
});

test('CLI prepares, restores and reviews one original task using native-shaped observations',t=>{
 const f=setup(t),script=new URL('../../../skills/byte-plan/scripts/collaboration.mjs',import.meta.url).pathname;
 const files={context:f.context,sessions:f.sessions};for(const [name,data]of Object.entries(files))writeFileSync(join(f.root,name+'.json'),JSON.stringify(data));
 const cli=(...args)=>{const run=spawnSync(process.execPath,[script,'--project',f.root,...args],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);};
 const p=cli('--action','prepare','--id','analyze','--context',join(f.root,'context.json'),'--sessions',join(f.root,'sessions.json'),'--deadline','2098-01-01T00:00:00Z');assert.equal(p.route,'bridge');
 writeFileSync(join(f.root,'missing.json'),JSON.stringify({state:'executed',result:null}));
 const resumed=cli('--action','resume','--id','analyze','--context',join(f.root,'context.json'),'--input',join(f.root,'missing.json'));assert.deepEqual(resumed.request,p.request);
 writeFileSync(join(f.root,'status.json'),JSON.stringify({state:'executed',result:bridgeRecord(f,p)}));writeFileSync(join(f.root,'receipt.json'),JSON.stringify({state:'executed',result:{request_id:'native-request',task_id:'bridge-original'}}));
 const reviewed=cli('--action','review','--id','analyze','--input',join(f.root,'status.json'),'--receipt',join(f.root,'receipt.json'));assert.equal(reviewed.items[0].status,'review');assert.equal(reviewed.items[0].bridgeTaskId,'bridge-original');assert.deepEqual(cli('--action','ready').pendingReview,['analyze']);
});
