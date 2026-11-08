#!/usr/bin/env node
// Project agent documents and explicit associations; never creates a native chat.
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,realpathSync,linkSync,unlinkSync,renameSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {readBoard,writeBoard,changeBoard,validAgentId} from './workboard.mjs';
export const hash=text=>createHash('sha256').update(text).digest('hex');
export function projectPath(root,name){
 root=realpathSync(root);const path=resolve(root,name),rel=relative(root,path);
 if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('../'))throw Error('Path must be inside the project');
 let ancestor=path;while(!existsSync(ancestor))ancestor=dirname(ancestor);
 const actual=realpathSync(ancestor),scope=relative(root,actual);
 if(isAbsolute(scope)||scope==='..'||scope.startsWith('../'))throw Error('Linked path leaves the project');
 return path;
}
function documentPath(root,id){
 if(!validAgentId(id))throw Error('Use a stable agent ID without path separators');
 for(const name of ['.byte-os','.byte-os/agents']){const folder=projectPath(root,name);if(existsSync(folder)&&lstatSync(folder).isSymbolicLink())throw Error('Linked agent state directory');}
 return projectPath(root,join('.byte-os','agents',id+'.md'));
}
export function agentDocument(root,id){
 const path=documentPath(root,id);if(!existsSync(path))throw Error('Agent document does not exist: '+id);
 const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size>256*1024)throw Error('Agent document must be a local Markdown file under 256KB');
 const content=readFileSync(path,'utf8'),title=content.match(/^#\s+(.+)$/m)?.[1]?.trim()??id;
 return {id,title,document:relative(realpathSync(root),path),sha256:hash(content),content};
}
export function createAgent(root,id,{title=id,content}={}){
 const file=documentPath(root,id);mkdirSync(dirname(file),{recursive:true,mode:0o700});
 const body=content??`# ${title}\n\n## Responsibilities\nDescribe the durable role and desired outcomes.\n\n## Working method\nDescribe useful tools, references and preferences.\n\n## Inputs and deliverables\nDescribe what this agent receives and produces.\n\n## Collaboration and limits\nDescribe who to report to and the relevant working agreements.\n\nTask progress and execution receipts stay in the existing workboard, Bridge or workflow engine.\n`;
 if(!body.trim()||Buffer.byteLength(body)>256*1024)throw Error('Provide a nonempty Markdown document under 256KB');
 const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,body,{flag:'wx',mode:0o600});
 try{linkSync(temp,file);}finally{unlinkSync(temp);}
 return agentDocument(root,id);
}
export function listAgents(root){
 const folder=projectPath(root,'.byte-os/agents');if(!existsSync(folder))return [];
 if(!lstatSync(folder).isDirectory()||lstatSync(folder).isSymbolicLink())throw Error('Agent directory must be local');
 const board=readBoard(root);
 return readdirSync(folder).filter(f=>f.endsWith('.md')&&validAgentId(f.slice(0,-3))).sort().map(f=>{
  const doc=agentDocument(root,f.slice(0,-3));const {content,...summary}=doc;
  return {...summary,session:board.agents?.find(a=>a.id===doc.id)?.session??null};
 });
}
export function sessionIdentity(raw){
 if(!raw||typeof raw!=='object')throw Error('Use a real native context or listed Bridge identity');
 const value=raw.identity??raw.actor?.session??raw.proof?.identity??raw;
 const harness=value.harness,nativeId=value.nativeId??value.native_session_id;
 if(typeof harness!=='string'||!harness||typeof nativeId!=='string'||!nativeId)throw Error('Use a real native context or listed Bridge identity');
 return {harness,nativeId,...(value.hostId??value.host_id?{hostId:value.hostId??value.host_id}:{}),...(value.profileId??value.profile_id?{profileId:value.profileId??value.profile_id}:{})};
}
export function sameSession(selector,identity){
 return selector.harness===identity.harness&&selector.nativeId===identity.nativeId&&(!selector.hostId||selector.hostId===identity.hostId)&&(!selector.profileId||selector.profileId===identity.profileId);
}
export function bindAgent(root,id,raw,revision=readBoard(root).revision){
 agentDocument(root,id);const session=raw===null?null:sessionIdentity(raw);
 return writeBoard(root,revision,b=>changeBoard(b,'agent',{id,...(session?{session}:{})}));
}
export function agentContext(root,raw){
 const identity=sessionIdentity(raw),agents=(readBoard(root).agents??[]).filter(a=>a.session&&sameSession(a.session,identity));
 return {session:identity,agents:agents.map(a=>agentDocument(root,a.id)),instructions:agents.length?'Read these current role documents and the current task. They do not grant new native permissions.':'No role document is assigned to this native session. Continue ordinary authorized work; do not invent a binding.'};
}
const marker='<!-- byte-agent-overview:v1 generated -->';
function cell(value){return String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');}
export function renderOrg(root,output='.byte-os/ORG.md'){
 const board=readBoard(root),agents=listAgents(root);
 const link=a=>relative(dirname(projectPath(root,output)),projectPath(root,a.document)).split('/').map(encodeURIComponent).join('/');
 const body=['# Project agents','',`Workboard revision: ${board.revision}. Generated view; edit the individual agent documents and explicit session associations.`,'','| Agent | Document | Native session | Tasks |','| --- | --- | --- | --- |',...agents.map(a=>`| ${cell(a.title)} | [${cell(a.id)}](${link(a)}) | ${cell(a.session?a.session.harness+':'+a.session.nativeId:'Unbound')} | ${cell(board.items.filter(t=>t.agentId===a.id).map(t=>t.id+' ('+t.status+')').join(', '))} |`),'','## Source documents',...agents.map(a=>`- ${a.document}: ${a.sha256}`),'','This view does not create chats, delegate work, grant permissions or replace workflow/Bridge execution state.',''].join('\n');
 return marker+'\n<!-- content-sha256:'+hash(body)+' -->\n'+body;
}
export function saveOrg(root,output='.byte-os/ORG.md'){
 const file=projectPath(root,output),text=renderOrg(root,output);
 if(existsSync(file)){
  if(lstatSync(file).isSymbolicLink())throw Error('Preserve the linked overview');
  const current=readFileSync(file,'utf8'),match=current.match(/^<!-- byte-agent-overview:v1 generated -->\n<!-- content-sha256:([a-f0-9]{64}) -->\n([\s\S]*)$/);
  if(!match||hash(match[2])!==match[1])throw Error('Preserve this manually written or edited overview; choose a new output path');
 }
 mkdirSync(dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+randomUUID()+'.tmp';writeFileSync(temp,text,{flag:'wx',mode:0o600});renameSync(temp,file);
 return {document:relative(realpathSync(root),file),sha256:hash(text)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const argv=process.argv.slice(2),get=(name,fallback)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
  if(argv.includes('--help'))console.log('agents.mjs --project PATH [--action list|create|show|bind|unbind|context|org] [--id ID] [--input FILE] [--title TITLE] [--revision N] [--output .byte-os/ORG.md]\nMarkdown documents are user editable; bind uses an actual native identity. No chats or messages are created.');
  else{
   const root=get('--project');if(!root)throw Error('--project required');const action=get('--action','list'),id=get('--id'),input=get('--input');let result;
   if(action==='list')result={agents:listAgents(root),revision:readBoard(root).revision};
   else if(action==='create')result=createAgent(root,id,{title:get('--title',id),...(input?{content:readFileSync(input,'utf8')}:{})});
   else if(action==='show')result=agentDocument(root,id);
   else if(action==='bind'||action==='unbind'){if(action==='bind'&&!input)throw Error('--input native-context.json required');result=bindAgent(root,id,action==='unbind'?null:JSON.parse(readFileSync(input,'utf8')),get('--revision')===undefined?undefined:Number(get('--revision')));}
   else if(action==='context'){if(!input)throw Error('--input native-context.json required');result=agentContext(root,JSON.parse(readFileSync(input,'utf8')));}
   else if(action==='org'){if(get('--output'))result=saveOrg(root,get('--output'));else{console.log(renderOrg(root));process.exit(0);}}
   else throw Error('Unknown agent action');
   console.log(JSON.stringify(result,null,2));
  }
 }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
