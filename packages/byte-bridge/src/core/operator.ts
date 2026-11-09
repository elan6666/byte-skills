import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import type { Actor } from '../protocol/types.js';
import { digest } from '../protocol/canonical.js';
import type { BridgeStore } from './database.js';
import { privateDirectory } from './private-paths.js';

/**
 * Local operator identity.
 *
 * The quick channel is deliberately sourced by the machine owner (this CLI) instead
 * of requiring an enrolled native session. It is only reachable through the private
 * hub socket (0600) and is recorded in the audit journal with sender "operator".
 */
export interface Operator { token:string; actor:Actor }

function operatorPath(store:BridgeStore):string { return join(store.root,'.session-bridge','operator.json'); }

export function ensureOperator(store:BridgeStore):Operator {
 const path=operatorPath(store);
 let token:string;
 if(existsSync(path)){
  const info=lstatSync(path);
  if(!info.isFile() || info.isSymbolicLink() || (info.mode&0o077)!==0 || (process.getuid && info.uid!==process.getuid()))throw new Error('Unsafe operator credential');
  token=String((JSON.parse(readFileSync(path,'utf8')) as {token?:string}).token??'');
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid operator credential');
 }else{
  const dir=privateDirectory(store.root,['.session-bridge']);
  token=randomBytes(32).toString('hex');
  writeFileSync(join(dir,'operator.json'),JSON.stringify({token,created_at:new Date().toISOString()})+'\n',{mode:0o600});
 }
 return {token,actor:operatorActor(store,token)};
}

export function operatorActor(store:BridgeStore,token:string):Actor {
 return {
  binding_id:'operator',
  session:{harness:'operator',host_id:hostname(),profile_id:digest(store.root),native_session_id:'operator',project_id:store.project_id,runtime_generation:'operator:'+digest(token).slice(0,16)},
  scope:{project_id:store.project_id,task_ids:['*'],operations:['say','delegate_task','get_task_status','reconcile','status']}
 };
}

export function isOperator(store:BridgeStore,token:string,claimed:Actor):boolean {
 if(claimed.binding_id!=='operator')return false;
 try { const expected=ensureOperator(store); return digest(expected.token)===digest(token) && digest(expected.actor)===digest(claimed); } catch { return false; }
}