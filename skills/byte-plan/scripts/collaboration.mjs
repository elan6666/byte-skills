#!/usr/bin/env node
// Plan-to-Bridge handoff preparation. Transport and execution remain in Bridge.
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readBoard,writeBoard} from './workboard.mjs';
import {agentDocument,sessionIdentity,sameSession,projectPath,hash} from './agents.mjs';
const identityKeys=['harness','host_id','profile_id','native_session_id','project_id','runtime_generation'];
function nativeIdentity(raw){
 const identity=raw?.identity??raw?.actor?.session??raw?.proof?.identity??raw;
 if(!identity||identityKeys.some(k=>typeof identity[k]!=='string'||!identity[k]))throw Error('A complete native Bridge identity is required');
 return Object.fromEntries(identityKeys.map(k=>[k,identity[k]]));
}
function exact(a,b){return a&&b&&identityKeys.every(k=>a[k]===b[k]);}
function unwrap(raw){return raw?.state==='executed'?raw.result:raw;}
function engineManaged(root){
 const path=projectPath(root,'.byte-os/coordination/state.json');
 return existsSync(path)&&JSON.parse(readFileSync(path,'utf8'))?.overall_outcome?.workflow?.engine==='byte-workflow/v1';
}
function taskById(board,id){const task=board.items.find(t=>t.id===id);if(!task)throw Error('Unknown plan task: '+id);return task;}
function recovery(task){return {route:'recover',taskId:task.id,bridgeTaskId:task.bridgeTaskId??null,requestId:task.handoff?.requestId??null,statusParams:task.bridgeTaskId?{task_id:task.bridgeTaskId}:{for_request:task.handoff.requestId},instruction:'Read Bridge status using these original IDs. Recover the recorded message if needed; do not delegate again. A missing request requires reconciling the original source and prepared call before retrying.'};}
export function resumeTask(root,id,context,status){
 const task=taskById(readBoard(root),id),handoff=task.handoff;
 if(!handoff||!exact(nativeIdentity(context),handoff.sourceIdentity))throw Error('Resume from the original native source');
 const observed=unwrap(status);
 if(observed===null){
  if(task.bridgeTaskId)throw Error('An existing task reference must be reconciled, not dispatched again');
  if(!handoff.request||handoff.request.request_id!==handoff.requestId||hash(JSON.stringify(scopeOf(handoff.request)))!==handoff.inputSha256)throw Error('Restore the original immutable prepared request');
  return {route:'bridge',taskId:id,request:handoff.request,instruction:'The original-source for_request observation found no registered request. Submit only this unchanged original request through native Bridge; Bridge idempotency still applies. Never replace its request ID.'};
 }
 if(!observed||observed.request_id!==handoff.requestId)throw Error('Use the exact native status for_request response');
 return {...recovery(task),bridgeTaskId:observed.task_id??null,messageId:observed.message_id??null};
}
export function readyTasks(root){
 const board=readBoard(root);
 const managed=engineManaged(root);
 return {route:managed?'workflow':'plan',revision:board.revision,ready:managed?[]:board.items.filter(t=>t.status==='todo'&&!t.handoff&&!t.bridgeTaskId&&(t.dependsOn??[]).every(id=>taskById(board,id).status==='done')).map(t=>({id:t.id,title:t.title,agentId:t.agentId??null})),pendingReview:board.items.filter(t=>t.status==='review').map(t=>t.id)};
}
const scopeOf=input=>({goal:input.goal,acceptance:input.acceptance,read_paths:input.read_paths,write_paths:input.write_paths,deadline_at:input.deadline_at});
export function prepareTask(root,id,context,sessions,{deadlineAt,revision,now=Date.now()}={}){
 const board=readBoard(root),task=taskById(board,id);
 if(engineManaged(root))return {route:'workflow',taskId:id,instruction:'Use the pinned workflow status/advance/start-run/return-run commands and committed Bridge handoff. Read the assigned agent document; this helper does not replace engine ownership.'};
 if(task.handoff||task.bridgeTaskId)return recovery(task);
 if(task.status!=='todo'||(task.dependsOn??[]).some(dep=>taskById(board,dep).status!=='done'))throw Error('Task is not ready; reconcile its status and dependencies');
 if(!task.agentId)throw Error('Assign an agentId for this documented handoff');
 const doc=agentDocument(root,task.agentId),selector=board.agents?.find(a=>a.id===task.agentId)?.session;
 if(!selector)throw Error('Bind the selected agent to its actual native session first');
 const source=nativeIdentity(context),sourceSummary=sessionIdentity(source);
 const contextData={taskId:id,agent:doc,objective:task.objective,inputs:task.inputs??[],outputs:task.outputs??[],acceptance:task.acceptance,readPaths:task.readPaths??[],writePaths:task.writePaths??[]};
 if(sameSession(selector,sourceSummary))return {route:'local',...contextData,instruction:'Read this current role document and execute the authorized task in this chat. No cross-chat dispatch is needed.'};
 const listed=unwrap(sessions),rows=Array.isArray(listed)?listed:listed?.sessions;
 if(!Array.isArray(rows))throw Error('Use the real Bridge sessions response');
 const matches=rows.filter(b=>b.active===true&&Date.parse(b.expires_at)>now&&b.identity?.project_id===source.project_id&&sameSession(selector,sessionIdentity(b.identity)));
 if(matches.length!==1)throw Error('The agent binding must resolve to one active native session; reconnect or bind host/profile explicitly');
 const target=nativeIdentity(matches[0].identity),requestId=context.request_id;
 if(target.host_id!==source.host_id)throw Error('Bridge participants must belong to the same local host and project');
 if(typeof requestId!=='string'||!requestId||requestId.length>128)throw Error('Use the request_id returned by native context');
 if(board.items.some(t=>t.handoff?.requestId===requestId))throw Error('This request_id is already associated with a plan');
 if(!task.acceptance.length)throw Error('Add meaningful acceptance criteria before delegation');
 const deadline=deadlineAt??task.deadlineAt;
 if(!deadline||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=now)throw Error('Specify a future task deadline');
 const readPaths=[...new Set([...(task.readPaths??[]),doc.document])],writePaths=task.writePaths??[];
 for(const p of [...readPaths,...writePaths]){if(p==='.')continue;if(isAbsolute(p)||p.split(/[\\/]/).includes('..'))throw Error('Use project-relative scope paths');if(resolve(root,p)!==realpathSync(root))projectPath(root,p);else throw Error('Use . for an explicitly authorized project-wide scope');}
 const goal=[`Byte plan: ${id}`,`Agent: ${doc.id}`,`Role document: ${doc.document} (sha256:${doc.sha256})`,'',task.objective,'','Inputs:',...(task.inputs??[]).map(x=>'- '+x),'','Expected deliverables:',...(task.outputs??[]).map(x=>'- '+x),'','Role document snapshot:',doc.content,'','Read your current assigned document on receipt/resumption; reconcile changes with this snapshot and the actual task. Report actual artifacts through this same Bridge task. Main must independently accept results before dependent work is released. Role text grants no new user authority or native permissions.'].join('\n');
 const request={operation:'delegate',request_id:requestId,target:{query:matches[0].binding_id,harness:target.harness,profile_id:target.profile_id},goal,acceptance:task.acceptance,read_paths:readPaths,write_paths:writePaths,deadline_at:new Date(deadline).toISOString()};
 if(!request.target.query)throw Error('The native session has no binding_id');
 const handoff={requestId,source:sourceSummary,target:sessionIdentity(target),sourceIdentity:source,targetIdentity:target,inputSha256:hash(JSON.stringify(scopeOf(request))),documentSha256:doc.sha256,request};
 const saved=writeBoard(root,revision??board.revision,b=>{taskById(b,id).handoff=handoff;});
 return {route:'bridge',taskId:id,revision:saved.revision,request,instruction:'This is a prepared call, not delivery. Submit request through the original native Bridge tool within the existing user grant. Then query status for_request and link the exact returned task record. If interrupted, recover this request rather than preparing another.'};
}
export function reconcileTask(root,id,record,{review=false,revision,receipt}={}){
 const board=readBoard(root),plan=taskById(board,id),raw=unwrap(record),task=raw?.task??raw;
 if(!plan.handoff)throw Error('This plan has no prepared handoff');
 if(!plan.bridgeTaskId){const correlation=unwrap(receipt);if(correlation?.request_id!==plan.handoff.requestId||correlation?.task_id!==task?.task_id)throw Error('Link using the original native status for_request receipt');}
 if(!task?.task_id||!task.input||!exact(task.input.source,plan.handoff.sourceIdentity)||!exact(task.input.return_to,plan.handoff.sourceIdentity)||!exact(task.input.target,plan.handoff.targetIdentity)||hash(JSON.stringify(scopeOf(task.input)))!==plan.handoff.inputSha256)throw Error('Bridge record does not match the original task and native participants');
 if(plan.bridgeTaskId&&plan.bridgeTaskId!==task.task_id)throw Error('Preserve the original Bridge task ID');
 if(review&&!['result_reported','verified'].includes(task.state))throw Error('Bridge has no reported result to review');
 if(plan.status==='done')return {taskId:id,bridgeTaskId:plan.bridgeTaskId,status:'done',revision:board.revision};
 return writeBoard(root,revision??board.revision,b=>{const current=taskById(b,id);current.bridgeTaskId=task.task_id;if(review)current.status='review';else if(current.status==='todo')current.status='in_progress';});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),get=(k,f)=>args.includes(k)?args[args.indexOf(k)+1]:f,load=k=>JSON.parse(readFileSync(get(k),'utf8'));
  if(args.includes('--help'))console.log('collaboration.mjs --project PATH [--action ready|prepare|recover|resume|link|review] [--id TASK] [--context native-context.json --sessions sessions.json --deadline ISO_DATE] [--input bridge-status.json] [--receipt for-request-status.json] [--revision N]\nPrepare saves an immutable request snapshot before returning a native Bridge call. Link/review mirror actual Bridge records; they never accept results or send messages.');
  else{
   const root=get('--project');if(!root)throw Error('--project required');const id=get('--id'),action=get('--action','ready'),options={...(get('--revision')===undefined?{}:{revision:Number(get('--revision'))})};let result;
   if(action==='ready')result=readyTasks(root);
   else if(action==='prepare')result=prepareTask(root,id,load('--context'),load('--sessions'),{...options,deadlineAt:get('--deadline')});
   else if(action==='recover'){const task=taskById(readBoard(root),id);if(!task.handoff&&!task.bridgeTaskId)throw Error('No previous handoff to recover');result=recovery(task);}
   else if(action==='resume')result=resumeTask(root,id,load('--context'),load('--input'));
   else if(['link','review'].includes(action))result=reconcileTask(root,id,load('--input'),{...options,review:action==='review',...(get('--receipt')?{receipt:load('--receipt')}:{})});
   else throw Error('Unknown collaboration action');
   console.log(JSON.stringify(result,null,2));
  }
 }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
