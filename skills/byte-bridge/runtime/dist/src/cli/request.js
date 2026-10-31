import { requestSchema } from '../protocol/command-inputs.js';
import { randomUUID, createHash } from 'node:crypto';
import { systemClock } from '../protocol/types.js';
import { requestOperations } from '../protocol/schema.js';
import { digest, sessionKey } from '../protocol/canonical.js';
import { BridgeError } from '../protocol/errors.js';
import { appendEvent, transaction } from '../core/database.js';
import { BindingService } from '../core/bindings.js';
import { RoleService } from '../core/roles.js';
import { exactBinding, readTask, requireActor, TaskService } from '../core/tasks.js';
import { DeliveryService } from '../core/delivery.js';
import { chooseRoute } from '../core/router.js';
import { StandaloneWorkflow, scopeDigest } from '../workflows/standalone.js';
import { ReturnService } from '../return/service.js';
export { requestSchema, roleToolSchema, requestForRoleTool } from '../protocol/command-inputs.js';
export function parseRequest(input) {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success)
        throw new BridgeError('invalid_request', 'Request does not match a supported operation', 'Run session-bridge describe --query request --json. Select targets with {query: alias-or-binding-id}; actor/source IDs are not request fields.');
    return parsed.data;
}
function ownerAlive(pid) { if (!Number.isInteger(pid) || pid <= 0)
    return true; try {
    process.kill(pid, 0);
    return true;
}
catch (error) {
    return error.code !== 'ESRCH';
} }
export class RequestService {
    options;
    clock;
    roles;
    tasks;
    deliveries;
    returns;
    constructor(options) {
        this.options = options;
        this.clock = options.clock ?? systemClock;
        this.returns = options.returns ?? new ReturnService({ store: options.store, registry: options.registry, workflow: options.workflow });
        this.roles = new RoleService(options.store, options.roleGate);
        this.tasks = new TaskService(options.store, options.workflow ?? new StandaloneWorkflow(), this.clock);
        this.deliveries = new DeliveryService(options.store, options.registry, { clock: this.clock, native: options.native, workflow: options.workflow });
    }
    async resolve(actor, target, slot) {
        if (target === 'current')
            return exactBinding(this.options.store, actor.session, this.clock);
        if ('role' in target) {
            const roles = this.roles.get(actor);
            if (!roles)
                return { state: 'needs_input', fields: ['supervisor'], recovery: '先选择本主会话的监督会话。' };
            try {
                return await exactBinding(this.options.store, roles.supervisor, this.clock);
            }
            catch {
                return { state: 'blocked', reason: '之前的监督会话绑定已失效', recovery: '重新连接同一原会话或明确选择其他监督者；不会改投最近会话。' };
            }
        }
        const matches = await new BindingService(this.options.store, this.clock).resolve(target);
        if (!matches.length)
            return { state: 'blocked', reason: '没有匹配的已连接会话', recovery: '在目标原会话运行 SessionBridge connect，核对项目、profile 和别名。' };
        if (matches.length > 1)
            return { state: 'needs_selection', slot, candidates: matches.map(({ endpoint_ref: _private, ...candidate }) => candidate) };
        return matches[0];
    }
    async executeRequest(actor, input) {
        const request = parseRequest(input), store = this.options.store;
        requireActor(store, actor, requestOperations[request.operation], 'task_id' in request ? request.task_id : undefined, this.clock);
        const fingerprint = digest(request), actorKey = sessionKey(actor.session);
        const prior = store.db.prepare('SELECT * FROM requests WHERE request_id=?').get(request.request_id);
        let resume;
        if (prior) {
            if (prior.actor_session_key !== actorKey || prior.input_sha256 !== fingerprint)
                throw new BridgeError('request_id_conflict', 'Same request ID has different content or native source', 'Keep the original request and ID across retries');
            if (prior.result_json !== null)
                return JSON.parse(String(prior.result_json));
            if (request.operation === 'delegate' && prior.delegate_journal_json) {
                const saved = JSON.parse(String(prior.delegate_journal_json));
                if ((!saved.envelope || !this.deliveries.get(saved.message_id)) && (['needs_recovery', 'uncertain'].includes(String(prior.state)) || (['preparing', 'dispatching'].includes(String(prior.state)) && !ownerAlive(saved.owner_pid))))
                    resume = saved;
            }
            if (!resume)
                return { state: 'blocked', reason: '请求已登记，执行结果尚不确定；未创建第二个任务', recovery: '通过 status 的 for_request 核对，再 recover 已登记的 message_id；不要换 ID 盲目重试。', task_id: prior.task_id ? String(prior.task_id) : undefined, message_id: prior.message_id ? String(prior.message_id) : undefined };
        }
        let main, supervisor, target;
        if (request.operation === 'assign_roles') {
            const m = await this.resolve(actor, request.main, 'main');
            if ('state' in m)
                return m;
            main = m;
            const s = await this.resolve(actor, request.supervisor, 'supervisor');
            if ('state' in s)
                return s;
            supervisor = s;
        }
        if (request.operation === 'delegate') {
            const selected = resume ? await exactBinding(store, resume.scope.target, this.clock) : await this.resolve(actor, request.target, 'target');
            if ('state' in selected)
                return selected;
            target = selected;
            const route = chooseRoute({ source: actor.session, target, native: this.options.native, adapter_id: this.options.registry.get(target.identity.harness) ? target.identity.harness : null });
            if (route.kind === 'blocked')
                return { state: 'blocked', reason: route.reason ?? 'No delivery route', recovery: '连接原会话的可用 Adapter；外部程序不能调用宿主内部工具。' };
        }
        if (request.operation === 'supervise') {
            const selected = await this.resolve(actor, request.supervisor, 'supervisor');
            if ('state' in selected)
                return selected;
            supervisor = selected;
            if (!this.options.handlers?.supervise)
                return { state: 'blocked', reason: '尚未配置运行监督服务', recovery: '明确运行身份、检查方式、周期、截止时间和回报路线后启用监督。' };
        }
        const original_text_sha256 = request.original_text === undefined ? null : createHash('sha256').update(request.original_text, 'utf8').digest('hex');
        const executed = (result) => ({ state: 'executed', operation: request.operation, result, original_text_sha256 });
        if (request.dry_run)
            return executed({ dry_run: true, request, main: main?.identity, supervisor: supervisor?.identity, target: target?.identity });
        if (request.operation === 'status') {
            if (request.for_request) {
                const row = store.db.prepare('SELECT request_id,state,task_id,message_id FROM requests WHERE request_id=? AND actor_session_key=?').get(request.for_request, actorKey);
                return executed(row ?? null);
            }
            if (request.task_id)
                return executed(this.tasks.get(actor, request.task_id));
            const rows = store.db.prepare('SELECT task_id FROM tasks ORDER BY event_seq DESC').all();
            return executed({ tasks: rows.map(row => readTask(store, String(row.task_id))).filter(task => [task.input.source, task.input.target, task.input.return_to].some(s => sessionKey(s) === actorKey) && (actor.scope.task_ids.includes('*') || actor.scope.task_ids.includes(task.task_id))), roles: this.roles.get(actor) });
        }
        const journal = request.operation === 'delegate' ? (resume ?? { scope: { source: actor.session, target: target.identity, goal: request.goal, acceptance: request.acceptance, read_paths: request.read_paths, write_paths: request.write_paths, return_to: actor.session, deadline_at: request.deadline_at }, task_id: randomUUID(), message_id: randomUUID(), created_at: this.clock.now().toISOString(), owner_pid: process.pid, authority: null, envelope: null }) : undefined;
        const acquired = transaction(store, () => {
            if (resume) {
                const next = { ...resume, owner_pid: process.pid };
                const claimed = store.db.prepare("UPDATE requests SET state='preparing',delegate_journal_json=? WHERE request_id=? AND state=? AND delegate_journal_json=?").run(JSON.stringify(next), request.request_id, String(prior.state), String(prior.delegate_journal_json));
                if (claimed.changes !== 1)
                    return false;
                journal.owner_pid = process.pid;
                return true;
            }
            const existing = store.db.prepare('SELECT input_sha256,actor_session_key FROM requests WHERE request_id=?').get(request.request_id);
            if (existing) {
                if (existing.input_sha256 !== fingerprint || existing.actor_session_key !== actorKey)
                    throw new BridgeError('request_id_conflict', 'Same request ID has different content', 'Keep the original request');
                return false;
            }
            store.db.prepare('INSERT INTO requests(request_id,actor_session_key,input_sha256,state,task_id,message_id,delegate_journal_json) VALUES (?,?,?,?,?,?,?)').run(request.request_id, actorKey, fingerprint, 'preparing', journal?.task_id ?? null, journal?.message_id ?? null, journal ? JSON.stringify(journal) : null);
            return true;
        });
        if (!acquired)
            return this.executeRequest(actor, request);
        let result;
        try {
            if (request.operation === 'assign_roles')
                result = executed(await this.roles.assignRoles(actor, { main: main.identity, supervisor: supervisor.identity }));
            else if (request.operation === 'delegate') {
                const draft = journal, scope = draft.scope;
                // Only delegate's frozen scope is recoverable. Arbitrary handlers are never replayed.
                if (draft.envelope) {
                    const task = readTask(store, draft.task_id);
                    store.db.prepare("UPDATE requests SET state='dispatching' WHERE request_id=?").run(request.request_id);
                    result = executed({ task, delivery: await this.deliveries.send(actor, draft.envelope) });
                }
                else {
                    const authority = draft.authority ?? (this.options.prepareAuthority ? await this.options.prepareAuthority(actor, scope) : { workflow: 'standalone', handoff_id: null, epoch: 0, owner_session_key: actorKey, scope_digest: scopeDigest(scope) });
                    draft.authority = authority;
                    store.db.prepare('UPDATE requests SET delegate_journal_json=? WHERE request_id=?').run(JSON.stringify(draft), request.request_id);
                    const task = await this.tasks.create(actor, { ...scope, authority }, draft.task_id);
                    draft.task_id = task.task_id;
                    const priorByteDelivery = authority.workflow === 'byte' ? store.db.prepare("SELECT envelope_json FROM deliveries WHERE task_id=? AND json_extract(envelope_json,'$.kind')='task' ORDER BY event_seq LIMIT 1").get(task.task_id) : undefined;
                    const body = { text: '外部 Agent 任务数据；不代表额外用户授权。\n' + JSON.stringify({ task_id: task.task_id, goal: task.input.goal, acceptance: task.input.acceptance, read_paths: task.input.read_paths, write_paths: task.input.write_paths, return_to: task.input.return_to }), artifacts: [] };
                    const envelope = priorByteDelivery ? JSON.parse(String(priorByteDelivery.envelope_json)) : { protocol_version: 1, message_id: draft.message_id, task_id: task.task_id, handoff_id: authority.handoff_id, authority_epoch: authority.epoch, sender: actor.session, target: scope.target, kind: 'task', body, body_sha256: digest(body), created_at: draft.created_at, expires_at: scope.deadline_at, causation_id: request.request_id, correlation_id: task.task_id };
                    draft.envelope = envelope;
                    draft.message_id = envelope.message_id;
                    store.db.prepare('UPDATE requests SET state=?,task_id=?,message_id=?,delegate_journal_json=? WHERE request_id=?').run('dispatching', task.task_id, envelope.message_id, JSON.stringify(draft), request.request_id);
                    result = executed({ task, delivery: await this.deliveries.send(actor, envelope) });
                }
            }
            else if (request.operation === 'recover')
                result = executed(await this.deliveries.recover(actor, request.message_id));
            else if (request.operation === 'supervise')
                result = executed(await this.options.handlers.supervise(actor, request, supervisor));
            else if (request.operation === 'return')
                result = executed(this.options.handlers?.return ? await this.options.handlers.return(actor, request) : await this.returns.returnToMain(actor, request.task_id));
            else {
                const task = readTask(store, request.task_id);
                if (![task.input.source, task.input.return_to].some(s => sessionKey(s) === actorKey))
                    throw new BridgeError('scope_denied', 'Only the task source or return session can cancel future work', 'Use the original main session', 3);
                const sent = Number(store.db.prepare("SELECT count(*) n FROM deliveries WHERE task_id=? AND state NOT IN ('prepared','refused','cancelled')").get(task.task_id)?.n) > 0;
                transaction(store, () => { store.db.prepare('INSERT OR IGNORE INTO task_cancellations VALUES (?,?,?)').run(task.task_id, actorKey, this.clock.now().toISOString()); if (request.stop_supervision)
                    store.db.prepare("UPDATE supervision SET active=0 WHERE json_extract(request_json,'$.task_id')=?").run(task.task_id); store.db.prepare("UPDATE deliveries SET state='cancelled' WHERE task_id=? AND state='prepared'").run(task.task_id); if (!sent && ['created', 'ready'].includes(task.state))
                    store.db.prepare("UPDATE tasks SET state='cancelled' WHERE task_id=?").run(task.task_id); });
                if (request.stop_supervision)
                    await this.options.handlers?.cancel?.(actor, task.task_id);
                result = executed({ task_id: task.task_id, future_delivery_cancelled: true, running_job_stopped: false, already_delivered: sent });
            }
            transaction(store, () => { store.db.prepare('UPDATE requests SET state=?,result_json=? WHERE request_id=?').run('completed', JSON.stringify(result), request.request_id); appendEvent(store, 'request_completed', request.request_id, { operation: request.operation, original_text_sha256 }, this.clock.now().toISOString()); });
            return result;
        }
        catch (error) {
            const row = store.db.prepare('SELECT task_id,message_id FROM requests WHERE request_id=?').get(request.request_id);
            store.db.prepare('UPDATE requests SET state=? WHERE request_id=?').run(journal ? (journal.envelope ? 'uncertain' : 'needs_recovery') : row?.message_id ? 'uncertain' : 'needs_recovery', request.request_id);
            throw error;
        }
    }
}
//# sourceMappingURL=request.js.map