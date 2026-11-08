#!/usr/bin/env node
// Local planning/display records only. Does not delegate, launch or accept work.
import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync,lstatSync,realpathSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const states=new Set(['todo','in_progress','blocked','review','done']);
const text=(v,max=1000)=>typeof v==='string'&&v.trim()&&v.length<=max;
export const sessionKey=s=>s.harness+':'+(s.nativeId||s.native_id);
export const validAgentId=id=>typeof id==='string'&&/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,79}$/u.test(id);
function paths(root){root=realpathSync(root);const dir=join(root,'.byte-os');if(existsSync(dir)&&lstatSync(dir).isSymbolicLink())throw Error('Linked Byte state directory');const file=join(dir,'workboard.json');if(existsSync(file)&&lstatSync(file).isSymbolicLink())throw Error('Linked workboard');return {root,dir,file};}
export function emptyBoard(){return {schema:1,revision:0,displaySessions:[],items:[],collaborations:[],updatedAt:null};}
export function validateBoard(b){
  if(b.schema!==1||!Number.isSafeInteger(b.revision)||b.revision<0)throw Error('Invalid workboard schema/revision');
  for(const k of ['displaySessions','items','collaborations'])if(!Array.isArray(b[k])||b[k].length>300)throw Error('Invalid '+k);
  const unique=(rows,key)=>{if(new Set(rows.map(key)).size!==rows.length)throw Error('Duplicate record identity');};
  const participant=p=>p&&text(p.harness,40)&&text(p.nativeId,200);
  if(b.agents!==undefined){
    if(!Array.isArray(b.agents)||b.agents.length>300||!b.agents.every(a=>a&&validAgentId(a.id)&&(!a.session||participant(a.session))))throw Error('Invalid agent binding');
    unique(b.agents,a=>a.id);
    for(const a of b.agents)if(a.session&&['hostId','profileId'].some(k=>a.session[k]!==undefined&&!text(a.session[k],200)))throw Error('Invalid agent session selector');
  }
  if(!b.displaySessions.every(participant))throw Error('Invalid display session');unique(b.displaySessions,sessionKey);
  unique(b.items,x=>x.id);unique(b.collaborations,x=>x.id);
  for(const x of b.items){
    if(!text(x.id,100)||!text(x.title,180)||!text(x.objective,4000)||!states.has(x.status)||!Array.isArray(x.steps)||!x.steps.length||x.steps.length>80||!Array.isArray(x.acceptance)||x.acceptance.length>30||!x.acceptance.every(a=>text(a,1000)))throw Error('Invalid task plan');
    if(!Array.isArray(x.participants)||!x.participants.every(participant))throw Error('Invalid participants');
    unique(x.steps,s=>s.id);
    for(const s of x.steps)if(!text(s.id,100)||!text(s.title,300)||!states.has(s.status)||!Array.isArray(s.evidence)||!s.evidence.every(e=>text(e,1000))||s.status==='done'&&!s.evidence.length)throw Error('Steps marked done require evidence references');
    if(x.status==='done'&&x.steps.some(s=>s.status!=='done'))throw Error('Finish all steps before marking task done');
    if(x.agentId!==undefined&&!validAgentId(x.agentId))throw Error('Invalid task agent');
    if(x.bridgeTaskId!==undefined&&!text(x.bridgeTaskId,200))throw Error('Invalid Bridge task reference');
    if(x.handoff!==undefined&&(!x.handoff||!text(x.handoff.requestId,128)||!participant(x.handoff.source)||!participant(x.handoff.target)||!/^[a-f0-9]{64}$/.test(x.handoff.inputSha256)||!/^[a-f0-9]{64}$/.test(x.handoff.documentSha256)))throw Error('Invalid handoff reference');
    for(const k of ['inputs','outputs','readPaths','writePaths','dependsOn'])if(x[k]!==undefined&&(!Array.isArray(x[k])||x[k].length>100||!x[k].every(v=>text(v,2000))))throw Error('Invalid task '+k);
    if(x.deadlineAt!==undefined&&!Number.isFinite(Date.parse(x.deadlineAt)))throw Error('Invalid task deadline');
  }
  const visited=new Set(),visiting=new Set();
  const visit=id=>{if(visiting.has(id))throw Error('Task dependencies contain a cycle');if(visited.has(id))return;const item=b.items.find(t=>t.id===id);if(!item)throw Error('Unknown task dependency: '+id);visiting.add(id);for(const dependency of item.dependsOn??[])visit(dependency);visiting.delete(id);visited.add(id);};
  for(const item of b.items)visit(item.id);
  for(const c of b.collaborations){
    if(!text(c.id,100)||!text(c.title,180)||!Array.isArray(c.members)||c.members.length<2||c.members.length>20||!c.members.every(m=>participant(m)&&text(m.role,100))||!Array.isArray(c.taskIds)||!c.taskIds.every(id=>b.items.some(t=>t.id===id))||!Array.isArray(c.bridgeTaskIds)||!c.bridgeTaskIds.every(id=>text(id,200)))throw Error('Invalid collaboration');
    unique(c.members,sessionKey);
  }
  return b;
}
export function readBoard(root){const {file}=paths(root);if(!existsSync(file))return emptyBoard();const raw=readFileSync(file);if(raw.length>1024*1024)throw Error('Workboard exceeds 1MB');return validateBoard(JSON.parse(raw));}
export function writeBoard(root,expectedRevision,change){
  const {dir,file}=paths(root);mkdirSync(dir,{recursive:true,mode:0o700});let fd;
  const lock=join(dir,'workboard.lock');
  try{fd=openSync(lock,'wx',0o600);}catch{throw Error('Workboard busy; reread before retrying');}
  let temp;
  try{const b=readBoard(root);if(b.revision!==expectedRevision){const e=Error('Workboard changed; reload before saving');e.status=409;throw e;}
    change(b);b.revision++;b.updatedAt=new Date().toISOString();validateBoard(b);
    const raw=JSON.stringify(b,null,2);if(Buffer.byteLength(raw)>1024*1024)throw Error('Workboard exceeds 1MB');
    temp=file+'.'+process.pid+'.tmp';writeFileSync(temp,raw,{mode:0o600,flag:'wx'});renameSync(temp,file);temp=null;return b;
  }finally{if(temp&&existsSync(temp))unlinkSync(temp);closeSync(fd);unlinkSync(lock);}
}
export function changeBoard(b,action,value){
  if(action==='display'){if(!Array.isArray(value))throw Error('Expected session list');b.displaySessions=value.map(s=>({harness:s.harness,nativeId:s.nativeId}));}
  else if(action==='task'){const at=b.items.findIndex(x=>x.id===value.id);if(at<0)b.items.push(value);else b.items[at]=value;}
  else if(action==='collaboration'){const at=b.collaborations.findIndex(x=>x.id===value.id);if(at<0)b.collaborations.push(value);else b.collaborations[at]=value;}
  else if(action==='agent'){b.agents??=[];const at=b.agents.findIndex(x=>x.id===value.id);if(at<0)b.agents.push(value);else b.agents[at]=value;}
  else throw Error('Unsupported planning action');
}
export function planProgress(items){const steps=items.flatMap(x=>x.steps);const done=steps.filter(x=>x.status==='done').length;return {done,total:steps.length,percent:steps.length?Math.round(done/steps.length*100):null,basis:'登记步骤完成率；证据引用尚未由工作台独立核验'};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];if(args.includes('--help'))console.log('node workboard.mjs --project /absolute/project [--action task|display|collaboration|agent --input file.json --revision N]\nNo action: read current plan. Done steps require evidence references. Display/planning records are not execution authority.');
 else{if(!args.includes('--project'))throw Error('--project required');const root=get('--project');if(!args.includes('--action'))console.log(JSON.stringify(readBoard(root),null,2));else{if(!args.includes('--revision')||!args.includes('--input'))throw Error('--revision and --input required');const file=get('--input');if(lstatSync(file).size>1024*1024)throw Error('Input too large');const value=JSON.parse(readFileSync(file,'utf8'));console.log(JSON.stringify(writeBoard(root,Number(get('--revision')),b=>changeBoard(b,get('--action'),value)),null,2));}}}
 catch(e){console.error(JSON.stringify({error:e.message}));process.exitCode=1;}
}
