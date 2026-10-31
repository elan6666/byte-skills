import type{AuthorityProvider}from'../workflows/contract.js';
import type{SupervisionOptions}from'../supervision/leases.js';
import { existsSync,readFileSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { AdapterRegistry } from '../adapters/registry.js';
import { createCodexAdapter } from '../adapters/codex/adapter.js';
import { codexConfigSchema } from '../adapters/codex/connect.js';
import { createClaudeAdapter } from '../adapters/claude/adapter.js';
import { createRegisteredHelperClient } from '../adapters/claude/inbox.js';
import { createPluginAdapter,createPluginBindingClient } from '../adapters/plugin-client.js';
import type { Adapter } from '../adapters/contract.js';
import { BindingService } from './bindings.js';
import { exactBinding } from './tasks.js';
import type { BridgeStore } from './database.js';
import { digest,sessionKey } from '../protocol/canonical.js';
import {createByteV1Workflow} from '../workflows/byte-v1.js';
import {readByteSource,byteBlocked} from '../workflows/byte-source.js';
import { createByteWorkflow } from '../workflows/byte.js';
import { scopeDigest,StandaloneWorkflow } from '../workflows/standalone.js';
import type { TaskInput,Actor } from '../protocol/types.js';
export function createRuntimeRegistry(store:BridgeStore):AdapterRegistry{
 const registry=new AdapterRegistry(),bindings=new BindingService(store);
 const select:Adapter['deliver']=async e=>{
  const binding=await exactBinding(store,e.target),path=join(store.root,'.session-bridge','connectors','codex',digest(binding.binding_id)+'.json');
  const config=codexConfigSchema.parse(JSON.parse(readFileSync(path,'utf8'))),adapter=createCodexAdapter({...config,resolveBinding:async id=>(await bindings.resolve({query:'',harness:'codex',profile_id:id.profile_id})).find(b=>sessionKey(b.identity)===sessionKey(id))??null});
  return adapter.deliver(e);
 };
 const codex:Adapter={probe:async()=>({harness:'codex',version:null,modes:{attached:{supported:true,evidence:'explicit original-host enrollment',constraints:['Requires matching version, profile, owner and scope map']}},capabilities:[]}),discover:()=>bindings.resolve({query:'',harness:'codex'}),enroll:async()=>{throw new Error('Use connect inside the native Codex session');},deliver:select,reconcile:async e=>{
  const b=await exactBinding(store,e.target),c=codexConfigSchema.parse(JSON.parse(readFileSync(join(store.root,'.session-bridge','connectors','codex',digest(b.binding_id)+'.json'),'utf8')));return createCodexAdapter({...c,resolveBinding:async()=>b}).reconcile(e);
 },observe:async function*(){},disconnect:async()=>{}};
 registry.register('codex',codex);registry.register('claude',createClaudeAdapter({helper:createRegisteredHelperClient(store)}));
 for(const name of ['pi','hermes','dsh','zcode','kimi','opencode'])registry.register(name,createPluginAdapter(name,createPluginBindingClient(store)));
 return registry;
}
export function runtimeWorkflow(store:BridgeStore):{workflow:AuthorityProvider;roleGate?:(actor:Actor)=>Promise<void>;prepareAuthority?:(actor:Actor,scope:Omit<TaskInput,'authority'>)=>Promise<import('../protocol/types.js').AuthorityRef>;prepareReturnAuthority?:(actor:Actor,task:{input:TaskInput},result:unknown,createdAt:string)=>Promise<import('../protocol/types.js').AuthorityRef>;validateSupervision?:SupervisionOptions['validateRun']}{
 if(!existsSync(join(store.root,'.byte-os','coordination','state.json')))return {workflow:new StandaloneWorkflow()};
 const pin=readByteSource(store.root),state=JSON.parse(readFileSync(join(store.root,'.byte-os','coordination','state.json'),'utf8')),engine=state.overall_outcome?.workflow?.engine;
 if(engine){if(engine!=='byte-workflow/v1')byteBlocked('Unsupported Byte workflow engine; no legacy/standalone fallback');const byte=createByteV1Workflow(store.root);return {workflow:byte,validateSupervision:(actor,task,request)=>byte.validateSupervision(actor,task,request),roleGate:(actor:Actor)=>byte.requireOwner(actor),prepareAuthority:(actor:Actor,scope:Omit<TaskInput,'authority'>)=>byte.prepareByteHandoff(actor,{...scope,authority:{workflow:'byte',handoff_id:null,epoch:0,owner_session_key:sessionKey(actor.session),scope_digest:scopeDigest(scope)}}),prepareReturnAuthority:(actor:Actor,task:{input:TaskInput})=>byte.prepareReturn(actor,task)};}
 const byte=createByteWorkflow({root:store.root,skillPath:dirname(dirname(join(pin.source_root,pin.relay_path))),pythonBin:pin.python_bin,verifyPinnedSource:()=>{if(digest(readByteSource(store.root))!==digest(pin))byteBlocked('Byte source pin changed; explicitly recreate the owned provider after upgrade');},expectedSource:{commit:pin.source_commit,helper_sha256:pin.files[pin.relay_path]!}});
 const transfer=(actor:Actor,scope:Omit<TaskInput,'authority'>,toStage:'build'|'supervise')=>byte.prepareByteHandoff(actor,{...scope,authority:{workflow:'byte',handoff_id:null,epoch:0,owner_session_key:sessionKey(actor.session),scope_digest:scopeDigest(scope)}},{toStage});
 return {workflow:byte,roleGate:(actor:Actor)=>byte.requireOwner(actor),prepareAuthority:(actor:Actor,scope:Omit<TaskInput,'authority'>)=>transfer(actor,scope,'supervise'),prepareReturnAuthority:async(actor:Actor,task:{input:TaskInput},_result:unknown,createdAt:string)=>transfer(actor,{source:actor.session,target:task.input.return_to,goal:'核验原任务结果并完成已授权的下一步：'+task.input.goal,acceptance:task.input.acceptance,read_paths:task.input.read_paths,write_paths:task.input.write_paths,return_to:task.input.return_to,deadline_at:new Date(Date.parse(createdAt)+86400000).toISOString()},'build')};
}
