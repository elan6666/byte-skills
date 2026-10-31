import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import type { Actor,Clock,RunIdentity,SessionIdentity,TaskRecord } from '../protocol/types.js';
import { systemClock } from '../protocol/types.js';
import { transaction,type BridgeStore } from '../core/database.js';
import{BindingService}from'../core/bindings.js';
import { exactBinding,readTask,requireActor } from '../core/tasks.js';
import { digest,sessionKey } from '../protocol/canonical.js';
import { nonempty,sessionSchema,timestamp,runIdentitySchema } from '../protocol/schema.js';
import { BridgeError } from '../protocol/errors.js';
import { observeRun,type RunProof } from './runs.js';
import { acquireCheck,releaseCheck } from './checker.js';
import { runEventId } from './events.js';
export interface SupervisionRequest {task_id:string;run:RunIdentity;supervisor:SessionIdentity;return_to:SessionIdentity;interval_seconds:number;deadline_at:string;repair_paths:string[]}
export interface SupervisionLease {id:string;request:SupervisionRequest;active:boolean;last_event_id:string|null;next_check_at:string}
export interface CheckOutcome {state:'unchanged'|'wake'|'unknown'|'stopped';event_ids:string[];wake_message_id:string|null}
export interface SupervisionOptions {store:BridgeStore;clock?:Clock;observe?:(run:RunIdentity)=>Promise<RunProof>;wake:(lease:SupervisionLease,event:{event_id:string;message_id:string;proof:RunProof})=>Promise<void>;validateRun?:(actor:Actor,task:TaskRecord,request:SupervisionRequest)=>Promise<void|(()=>void)>}
const schema=z.strictObject({task_id:nonempty,run:runIdentitySchema,supervisor:sessionSchema,return_to:sessionSchema,interval_seconds:z.number().int().min(1).max(86400),deadline_at:timestamp,repair_paths:z.array(nonempty)});
function fromRow(row:Record<string,unknown>):SupervisionLease{return {id:String(row.id),request:JSON.parse(String(row.request_json)),active:Boolean(row.active),last_event_id:row.last_event_id===null?null:String(row.last_event_id),next_check_at:String(row.next_check_at)};}
const outcome=(state:CheckOutcome['state']):CheckOutcome=>({state,event_ids:[],wake_message_id:null});
export class SupervisionService {
 private clock:Clock;private observe:(run:RunIdentity)=>Promise<RunProof>;
 constructor(private options:SupervisionOptions){this.clock=options.clock??systemClock;this.observe=options.observe??observeRun;}
 async armSupervision(actor:Actor,request:SupervisionRequest):Promise<SupervisionLease>{
  const parsed=schema.safeParse(request);if(!parsed.success)throw new BridgeError('invalid_supervision','A complete exact run, deadline, supervisor and return route are required','Role setup alone cannot arm supervision',4);request=parsed.data;
  requireActor(this.options.store,actor,'request_supervision',request.task_id,this.clock);const task=readTask(this.options.store,request.task_id);
  if(![task.input.source,task.input.return_to].some(s=>sessionKey(s)===sessionKey(actor.session)) || sessionKey(request.return_to)!==sessionKey(task.input.return_to) || realpathSync(request.run.root)!==this.options.store.root || Date.parse(request.deadline_at)<=this.clock.now().getTime() || Date.parse(request.deadline_at)>Date.parse(task.input.deadline_at))throw new BridgeError('scope_denied','Supervision run, source or return scope mismatch','Use the exact local task and explicitly authorized deadline',3);
  for(const path of request.repair_paths)if(isAbsolute(path) || path.split(/[\\/]/).includes('..') || !task.input.write_paths.some(scope=>scope==='.' || path===scope || path.startsWith(scope+'/')))throw new BridgeError('repair_scope_denied','Repair paths exceed the original task scope','Keep read-only supervision or narrow repairs',3);
  const supervisorBinding=await exactBinding(this.options.store,request.supervisor,this.clock),returnBinding=await exactBinding(this.options.store,request.return_to,this.clock);
  const validateCommit=await this.options.validateRun?.(actor,task,request);
  const id=digest(request);return transaction(this.options.store,()=>{
   validateCommit?.();requireActor(this.options.store,actor,'request_supervision',request.task_id,this.clock);const currentTask=readTask(this.options.store,request.task_id);if(this.options.store.db.prepare('SELECT task_id FROM task_cancellations WHERE task_id=?').get(request.task_id)||['cancelled','cancel_requested'].includes(currentTask.state))throw new BridgeError('supervision_cancelled','Task was cancelled before supervision registration','No lease was created; no running job was stopped',3);if(['result_reported','verified','failed'].includes(currentTask.state))throw new BridgeError('supervision_task_closed','Task completed while supervision was being validated','Do not recreate polling after a terminal report',3);if(Date.parse(request.deadline_at)<=this.clock.now().getTime()||Date.parse(request.deadline_at)>Date.parse(currentTask.input.deadline_at))throw new BridgeError('expired_supervision','Supervision deadline changed or expired before registration','No lease was created',3);const bindings=new BindingService(this.options.store,this.clock);for(const bound of [supervisorBinding,returnBinding]){const fresh=bindings.get(bound.binding_id);if(!fresh||!bindings.isUsable(bound.binding_id)||sessionKey(fresh.identity)!==sessionKey(bound.identity))throw new BridgeError('target_unbound','Supervision binding changed before registration','Reconnect the original native participant',3);}
   const existing=this.get(id);if(existing)return existing;
   const previous=this.options.store.db.prepare("SELECT request_json,active FROM supervision WHERE json_extract(request_json,'$.task_id')=?").all(request.task_id);
   if(previous.some(row=>digest((JSON.parse(String(row.request_json)) as SupervisionRequest).run)!==digest(request.run)))throw new BridgeError('run_attempt_conflict','This task already refers to a different immutable run','Create an explicitly new task for the new attempt',3);
   if(previous.some(row=>row.active))throw new BridgeError('supervision_already_active','This task/run already has a different active supervision lease','Explicitly stop the original lease before changing interval/deadline/route',3);
   this.options.store.db.prepare('INSERT INTO supervision(id,request_json,active,last_event_id,next_check_at) VALUES (?,?,1,NULL,?)').run(id,JSON.stringify(request),new Date(this.clock.now().getTime()+request.interval_seconds*1000).toISOString());return this.get(id)!;
  });
 }
 get(id:string):SupervisionLease|null{const row=this.options.store.db.prepare('SELECT * FROM supervision WHERE id=?').get(id);return row?fromRow(row):null;}
 async tick(leaseId:string):Promise<CheckOutcome>{
  const lease=this.get(leaseId),now=this.clock.now();if(!lease?.active)return outcome('stopped');
  if(Date.parse(lease.request.deadline_at)<=now.getTime()){this.options.store.db.prepare('UPDATE supervision SET active=0 WHERE id=?').run(leaseId);return outcome('stopped');}
  if(Date.parse(lease.next_check_at)>now.getTime())return outcome('unchanged');
  const holder=acquireCheck(this.options.store,leaseId,now);if(!holder)return outcome('unchanged');
  try {
   let proof:RunProof;try{proof=await this.observe(lease.request.run);}catch{proof={identity:lease.request.run,status:'unknown',exit_code:null,artifacts:[]};}if(digest(proof.identity)!==digest(lease.request.run))proof={identity:lease.request.run,status:'unknown',exit_code:null,artifacts:[]};
   if(proof.reason==='awaiting_owned_exit_receipt'){
    this.options.store.db.prepare('INSERT OR IGNORE INTO pending_run_checks(lease_id,first_seen) VALUES (?,?)').run(leaseId,this.clock.now().toISOString());
    const first=this.options.store.db.prepare('SELECT first_seen FROM pending_run_checks WHERE lease_id=?').get(leaseId)!;
    if(this.clock.now().getTime()-Date.parse(String(first.first_seen))<5000){this.options.store.db.prepare('UPDATE supervision SET next_check_at=? WHERE id=? AND active=1').run(new Date(this.clock.now().getTime()+1000).toISOString(),leaseId);return outcome(this.get(leaseId)?.active?'unchanged':'stopped');}
   }else this.options.store.db.prepare('DELETE FROM pending_run_checks WHERE lease_id=?').run(leaseId);
   const eventId=runEventId(leaseId,proof);
   const event=transaction(this.options.store,()=>{
    const current=this.get(leaseId);if(!current?.active)return null;
    this.options.store.db.prepare('UPDATE supervision SET next_check_at=? WHERE id=?').run(new Date(this.clock.now().getTime()+lease.request.interval_seconds*1000).toISOString(),leaseId);
    if(proof.status==='running')return null;
    const saved=this.options.store.db.prepare('SELECT message_id,proof_json,dispatch_state FROM run_events WHERE event_id=?').get(eventId);
    if(saved?.dispatch_state==='confirmed')return null;
    if(saved)return {event_id:eventId,message_id:String(saved.message_id),proof:JSON.parse(String(saved.proof_json)) as RunProof};
    const messageId=randomUUID();this.options.store.db.prepare('UPDATE supervision SET last_event_id=? WHERE id=?').run(eventId,leaseId);
    this.options.store.db.prepare("INSERT INTO run_events(event_id,lease_id,proof_json,created_at,message_id,dispatch_state) VALUES (?,?,?,?,?,'attempted')").run(eventId,leaseId,JSON.stringify(proof),this.clock.now().toISOString(),messageId);
    return {event_id:eventId,message_id:messageId,proof};
   });
   if(!this.get(leaseId)?.active)return outcome('stopped');if(!event)return outcome('unchanged');
   try {await this.options.wake(lease,event);this.options.store.db.prepare("UPDATE run_events SET dispatch_state='confirmed' WHERE event_id=?").run(eventId);return {state:'wake',event_ids:[eventId],wake_message_id:event.message_id};}
   catch{this.options.store.db.prepare("UPDATE run_events SET dispatch_state='uncertain' WHERE event_id=?").run(eventId);return {state:'unknown',event_ids:[eventId],wake_message_id:event.message_id};}
  }finally{releaseCheck(this.options.store,leaseId,holder);}
 }
 async stopSupervision(actor:Actor,leaseId:string):Promise<void>{
  const lease=this.get(leaseId);if(!lease)throw new BridgeError('lease_missing','Supervision lease not found','Select an existing lease',3);
  requireActor(this.options.store,actor,actor.scope.operations.includes('return_to_main')?'return_to_main':'cancel_pending',lease.request.task_id,this.clock);const task=readTask(this.options.store,lease.request.task_id);
  if(![task.input.source,lease.request.supervisor,lease.request.return_to].some(s=>sessionKey(s)===sessionKey(actor.session)))throw new BridgeError('scope_denied','Session is not a supervision participant','Use the exact main or supervisor',3);
  this.options.store.db.prepare('UPDATE supervision SET active=0 WHERE id=?').run(leaseId);
 }
 startLoop(intervalMs=1000):{close():Promise<void>}{
  if(!Number.isInteger(intervalMs) || intervalMs<50)throw new Error('Supervision polling interval must be at least 50 ms');
  let closed=false,running=false,pending:Promise<void>=Promise.resolve();
  const timer=setInterval(()=>{if(closed || running)return;running=true;pending=(async()=>{const rows=this.options.store.db.prepare('SELECT id FROM supervision WHERE active=1 AND next_check_at<=?').all(this.clock.now().toISOString());for(const row of rows){if(closed)break;await this.tick(String(row.id));}})().catch(()=>{}).finally(()=>{running=false;});},intervalMs);
  return {close:async()=>{closed=true;clearInterval(timer);await pending;}};
 }
}
