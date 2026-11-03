import {existsSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {openStore} from '../core/database.js';
import {BindingService} from '../core/bindings.js';
import {harnessGuidance} from '../adapters/guidance.js';
import {loadConnection} from './context.js';
import {serviceStatus} from './service.js';
import {BridgeError} from '../protocol/errors.js';
import type {BindingRecord} from '../protocol/types.js';

/** Observe this selected project only. No setup, migration, model or permission change. */
export async function collaborationPreflight(root:string,options:{harness:string;withHarnesses:string[];query?:string}){
 const targets=[...new Set(options.withHarnesses)];
 for(const name of [options.harness,...targets])harnessGuidance(name);
 root=realpathSync(root);const initialized=existsSync(join(root,'.session-bridge/project.json'));
 let bindings:BindingRecord[]=[],stateError:string|null=null;
 if(initialized){
  try{const store=openStore(root,{readOnly:true});try{bindings=await new BindingService(store).resolve({query:''});}finally{store.close();}}
  catch(error){stateError=error instanceof BridgeError?error.code:'state_unreadable';}
 }
 const service=await serviceStatus(root);
 let source:{state:string;binding_id?:string;identity?:BindingRecord['identity'];code?:string}={state:'not_connected'};
 if(initialized && !stateError)try{
  const c=await loadConnection(process.env,root,options.harness),b=bindings.find(b=>b.binding_id===c.actor.binding_id);
  source=b?{state:'locally_matched',binding_id:b.binding_id,identity:b.identity}:{state:'not_connected',code:'binding_expired_or_inactive'};
 }catch(error){source={state:'not_connected',code:error instanceof BridgeError?error.code:'context_unavailable'};}
 const peers=targets.map(harness=>{
  const candidates=bindings.filter(b=>b.identity.harness===harness && b.binding_id!==source.binding_id && (!options.query || b.binding_id===options.query || b.alias===options.query));
  return {harness,state:candidates.length===1?'connected_record':candidates.length>1?'needs_selection':'needs_connection',routes:harnessGuidance(harness),candidates:candidates.map(b=>({binding_id:b.binding_id,alias:b.alias,identity:b.identity,mode:b.mode,expires_at:b.expires_at,capabilities:b.capabilities}))};
 });
 const state=!initialized?'needs_setup':stateError?'state_blocked':service.state!=='running'?'needs_service':source.state!=='locally_matched'?'needs_source':peers.some(p=>p.state==='needs_selection')?'needs_selection':peers.some(p=>p.state==='needs_connection')?'needs_peer':'ready_for_context_check';
 return {state,project:root,initialized,state_error:stateError,service,source:{...source,harness:options.harness,routes:harnessGuidance(options.harness)},peers,
  transport:'byte-bridge',other_delivery_routes_allowed:false,native_context_verified:false,native_permissions:'not_proven_by_connection',task_execution_verified:false,
  next_action:state==='needs_setup'?'Run authorized setup for only these selected harnesses.':state==='needs_service'?'Inspect this owned service; start or renew it only within the authorized lifetime.':state==='needs_source'?'Activate/connect from the selected original native source using its listed route.':state==='needs_peer'?'Activate each missing peer through its listed native Bridge route; request missing permissions precisely.':state==='needs_selection'?'Choose an exact listed binding_id; do not select the latest session.':state==='state_blocked'?'Inspect state_error; do not reset the database or use another route.':'Use the current native context tool, resolve the exact peer, then delegate one scoped task and verify its actual return.',
  limits:['Preflight reads existing connection records; it does not execute a task or prove permissions/wakeup.','A blocked Bridge connection stays blocked; no CUA, typing, clipboard, direct chat-message or alternate transport fallback.','A managed worker is a new native session; never silently substitute it for a requested existing chat.']};
}
