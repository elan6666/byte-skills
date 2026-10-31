import { observeRun, runReceiptPath } from '../supervision/runs.js';
import { byteWriteOverlapsFrozen } from './byte-scope.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, realpathSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, dirname } from 'node:path';
import { z } from 'zod';
import { taskInputSchema, runIdentitySchema } from '../protocol/schema.js';
import { digest, sessionKey } from '../protocol/canonical.js';
import { scopeDigest } from './standalone.js';
import { readByteSource, bytesSha, byteBlocked } from './byte-source.js';
import { openStore } from '../core/database.js';
import { BindingService } from '../core/bindings.js';
const exec = promisify(execFile), hash = z.string().regex(/^[a-f0-9]{64}$/), scopeSchema = taskInputSchema.omit({ authority: true });
export const byteHandoffMetadataSchema = z.strictObject({ schema_version: z.literal(1), direction: z.enum(['delegate', 'return']), event_id: z.string().min(1), revision: z.number().int().positive(), outcome_id: z.string().min(1), instance_sha256: hash, run_id: z.string().min(1), attempt: z.number().int().positive(), scope: scopeSchema });
export const byteImportInputSchema = z.strictObject({ handoff_id: z.string().min(1), task_id: z.string().min(1).optional() });
const wfSchema = z.object({ engine: z.literal('byte-workflow/v1'), instance_sha256: hash, revision: z.number().int().nonnegative(), events: z.array(z.object({ id: z.string(), command: z.string(), actor: z.string(), revision: z.number().int() })), evidence: z.array(z.object({ path: z.string(), sha256: hash })), used_runs: z.array(z.tuple([z.string(), z.number().int().positive()])), returned_run: z.object({ run_id: z.string(), attempt: z.number() }).optional() });
const mirror = { current_handoff: z.string(), current_handoff_sha256: hash };
const stateSchema = z.object({ owner: z.string(), owner_session: z.string(), frozen_paths: z.array(z.string()).default([]), ...mirror, overall_outcome: z.object({ id: z.string(), status: z.string(), ...mirror, execution: z.object({ run_id: z.string(), attempt: z.number(), ...mirror }), workflow: wfSchema }) });
const nativeKey = (id) => id.harness + ':' + id.native_session_id;
function file(root, path) { root = realpathSync(root); const p = resolve(root, path), r = relative(root, p); if (!r || isAbsolute(r) || r === '..' || r.startsWith('../') || !existsSync(p) || realpathSync(p) !== p || !lstatSync(p).isFile())
    byteBlocked('Byte evidence path is not a canonical project file'); return p; }
function currentState(root) { const value = stateSchema.safeParse(JSON.parse(readFileSync(file(root, '.byte-os/coordination/state.json'), 'utf8'))); if (!value.success)
    byteBlocked('Byte committed handoff state/mirrors are incomplete'); return value.data; }
export async function doctorByteProject(root) {
    const pin = readByteSource(root), engine = join(pin.source_root, pin.engine_path), before = readFileSync(file(root, '.byte-os/coordination/state.json'));
    const env = { PYTHONDONTWRITEBYTECODE: '1' };
    for (const k of ['PATH', 'HOME', 'USER', 'LANG', 'SYSTEMROOT'])
        if (process.env[k])
            env[k] = process.env[k];
    const probe = 'import sys,runpy;from pathlib import Path;sys.path.insert(0,str(Path(sys.argv[1]).parent));n=runpy.run_path(sys.argv[1],run_name="byte_bridge_probe");m=n["load"](Path(sys.argv[2])/".byte-os/workflow.yaml");[n["session"](m["roles"][k]) for k in ("main","supervisor")];sys.exit(n["main"](["status","--project",sys.argv[2]]))';
    try {
        const { stdout } = await exec(pin.python_bin, ['-I', '-B', '-c', probe, engine, root], { cwd: dirname(engine), env, timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
        if (digest(readByteSource(root)) !== digest(pin))
            byteBlocked('Byte source pin changed during engine probe');
        if (bytesSha(before) !== bytesSha(readFileSync(file(root, '.byte-os/coordination/state.json'))))
            byteBlocked('Byte state changed during read-only validation; reconcile the same handoff');
        const result = JSON.parse(stdout);
        if (!Number.isInteger(result.revision) || typeof result.outcome_id !== 'string' || typeof result.owner_session !== 'string')
            byteBlocked('Pinned Byte engine did not confirm structural status');
        return { consistent: true, native_scheduler_verified: false, disposition: 'structural_status_only', ...result };
    }
    catch (error) {
        return byteBlocked('Pinned Byte engine status rejected evidence or is unavailable: ' + (error instanceof Error ? error.message : String(error)) + ' ' + String(error.stdout ?? '').slice(0, 2000));
    }
}
function exactIdentities(root, scope) {
    const store = openStore(root);
    try {
        const service = new BindingService(store), rows = store.db.prepare('SELECT binding_id,identity_json FROM bindings WHERE active=1 AND expires_at>?').all(new Date().toISOString()).map(r => ({ binding_id: String(r.binding_id), identity: JSON.parse(String(r.identity_json)) }));
        for (const id of [scope.source, scope.target, scope.return_to]) {
            if (id.project_id !== store.project_id)
                byteBlocked('Byte native identity belongs to another project');
            if (!['codex', 'claude', 'dsh', 'zcode', 'pi', 'hermes', 'kimi', 'opencode'].includes(id.harness))
                byteBlocked('Unknown native harness is blocked, never relabeled');
            const matches = rows.filter(r => nativeKey(r.identity) === nativeKey(id));
            if (matches.length !== 1 || !service.isUsable(matches[0].binding_id) || sessionKey(matches[0].identity) !== sessionKey(id))
                byteBlocked('Byte identity is expired, ambiguous or belongs to another native profile/generation');
        }
    }
    finally {
        store.close();
    }
}
function frozenScope(root, scope, frozen) { if (scope.source.host_id !== scope.target.host_id)
    byteBlocked('Byte scope is not local to the original host'); for (const p of [...scope.read_paths, ...scope.write_paths])
    if (isAbsolute(p) || p.split(/[\\/]/).includes('..'))
        byteBlocked('Byte scope must use project-relative paths'); for (const write of scope.write_paths)
    for (const freeze of frozen)
        if (byteWriteOverlapsFrozen(write, freeze))
            byteBlocked('Byte frozen path overlaps imported write scope'); exactIdentities(root, scope); }
export async function inspectCommittedHandoff(root, handoffId) {
    root = realpathSync(root);
    readByteSource(root);
    const before = readFileSync(file(root, '.byte-os/coordination/state.json'));
    await doctorByteProject(root);
    if (bytesSha(before) !== bytesSha(readFileSync(file(root, '.byte-os/coordination/state.json'))))
        byteBlocked('Byte state changed while validating committed handoff');
    const state = currentState(root), outcome = state.overall_outcome, w = outcome.workflow;
    if (outcome.status !== 'active')
        byteBlocked('Byte workflow is not active');
    const p = file(root, handoffId ?? state.current_handoff), rel = relative(root, p).split('\\').join('/');
    if (!rel.startsWith('.byte-os/coordination/handoffs/') || !rel.endsWith('.json'))
        byteBlocked('Byte committed handoff must be a JSON file inside coordination/handoffs');
    const sha = bytesSha(readFileSync(p));
    for (const mirror of [state, outcome, outcome.execution])
        if (resolve(root, mirror.current_handoff) !== p || mirror.current_handoff_sha256 !== sha)
            byteBlocked('Byte current committed handoff/hash mirrors differ');
    if (!w.evidence.some(e => resolve(root, e.path) === p && e.sha256 === sha))
        byteBlocked('Byte handoff is not engine-committed evidence');
    const m = byteHandoffMetadataSchema.parse(JSON.parse(readFileSync(p, 'utf8')).sessionbridge), event = w.events.filter(e => ['start-run', 'return-run'].includes(e.command)).at(-1), command = m.direction === 'delegate' ? 'start-run' : 'return-run';
    if (m.outcome_id !== outcome.id || m.instance_sha256 !== w.instance_sha256 || m.revision > w.revision || !event || event.id !== m.event_id || event.revision !== m.revision || event.command !== command || event.actor !== nativeKey(m.scope.source))
        byteBlocked('Byte committed event/revision/outcome/instance does not match handoff');
    if (outcome.execution.run_id !== m.run_id || outcome.execution.attempt !== m.attempt || (m.direction === 'return' && (!w.returned_run || w.returned_run.run_id !== m.run_id || w.returned_run.attempt !== m.attempt)))
        byteBlocked('Byte committed run/attempt does not match handoff');
    const manifest = JSON.parse(readFileSync(file(root, '.byte-os/workflow.yaml'), 'utf8')), main = manifest.roles?.main, supervisor = manifest.roles?.supervisor;
    if (nativeKey(m.scope.source) !== (m.direction === 'delegate' ? main : supervisor) || nativeKey(m.scope.target) !== (m.direction === 'delegate' ? supervisor : main) || nativeKey(m.scope.return_to) !== main || state.owner_session !== nativeKey(m.scope.target) || state.owner !== m.scope.target.harness)
        byteBlocked('Byte committed owner/roles differ from exact handoff participants');
    frozenScope(root, m.scope, state.frozen_paths);
    const ref = { workflow: 'byte', handoff_id: rel, epoch: m.revision, owner_session_key: sessionKey(m.scope.target), scope_digest: scopeDigest(m.scope) };
    return { metadata: m, ref, handoff_sha256: sha, state_sha256: bytesSha(before) };
}
function deny(reason) { return { state: 'denied', evidence: null, reason }; }
export function createByteV1Workflow(root) {
    root = realpathSync(root);
    const boundPin = digest(readByteSource(root));
    const verifyBoundSource = () => { if (digest(readByteSource(root)) !== boundPin)
        byteBlocked('Byte source pin changed; explicitly recreate the owned provider after upgrade'); };
    const inspectBound = async (id) => { verifyBoundSource(); const d = await inspectCommittedHandoff(root, id); verifyBoundSource(); return d; };
    const validateActor = (actor) => { const store = openStore(root); try {
        const b = new BindingService(store).get(actor.binding_id);
        if (!b || !new BindingService(store).isUsable(actor.binding_id) || sessionKey(b.identity) !== sessionKey(actor.session) || actor.scope.project_id !== store.project_id)
            byteBlocked('Byte actor is not its exact authenticated native binding');
    }
    finally {
        store.close();
    } };
    const requireOwner = async (actor) => { verifyBoundSource(); validateActor(actor); await doctorByteProject(root); verifyBoundSource(); const s = JSON.parse(readFileSync(file(root, '.byte-os/coordination/state.json'), 'utf8')); if (s.owner_session !== nativeKey(actor.session) || s.owner !== actor.session.harness)
        byteBlocked('Byte owner authority belongs to another exact session'); };
    const reconcileHandoff = async (ref) => { try {
        const d = await inspectBound(ref.handoff_id ?? undefined);
        if (digest(d.ref) !== digest(ref))
            return deny('Byte committed reference differs');
        if (Date.parse(d.metadata.scope.deadline_at) <= Date.now())
            return deny('Byte handoff deadline expired');
        return { state: 'granted', expires_at: d.metadata.scope.deadline_at, evidence: digest({ ref, handoff_sha256: d.handoff_sha256, state_sha256: d.state_sha256 }) };
    }
    catch (e) {
        return deny(e instanceof Error ? e.message : 'Byte evidence unavailable');
    } };
    const authorizeDelegation = async (actor, ref, input) => { try {
        validateActor(actor);
        const d = await inspectBound(ref.handoff_id ?? undefined), { authority: _a, ...scope } = input;
        if (d.metadata.direction !== 'delegate' || digest(d.ref) !== digest(ref) || sessionKey(actor.session) !== sessionKey(scope.source) || digest(scope) !== digest(d.metadata.scope))
            return deny('Byte source or frozen scope differs');
        return { state: 'granted', evidence: digest(d.ref) };
    }
    catch (e) {
        return deny(e instanceof Error ? e.message : 'Byte delegation unavailable');
    } };
    const prepareByteHandoff = async (actor, input) => { validateActor(actor); const d = await inspectBound(); const { authority: _a, ...scope } = input; if (d.metadata.direction !== 'delegate' || input.authority.workflow !== 'byte' || !actor.scope.operations.includes('delegate_task') || sessionKey(actor.session) !== sessionKey(d.metadata.scope.source) || digest(scope) !== digest(d.metadata.scope) || Date.parse(scope.deadline_at) <= Date.now())
        byteBlocked('Byte committed handoff source, deadline or frozen scope mismatch'); return d.ref; };
    const prepareReturn = async (actor, task) => {
        validateActor(actor);
        const d = await inspectBound(), input = task.input, oldPath = file(root, input.authority.handoff_id ?? ''), old = byteHandoffMetadataSchema.parse(JSON.parse(readFileSync(oldPath, 'utf8')).sessionbridge);
        const wanted = { ...old.scope, source: input.target, target: input.return_to, return_to: input.return_to, deadline_at: d.metadata.scope.deadline_at };
        if (d.metadata.direction !== 'return' || old.direction !== 'delegate' || input.authority.epoch !== old.revision || input.authority.scope_digest !== scopeDigest(old.scope) || sessionKey(actor.session) !== sessionKey(input.target) || digest(d.metadata.scope) !== digest(wanted) || d.metadata.run_id !== old.run_id || d.metadata.attempt !== old.attempt || d.metadata.outcome_id !== old.outcome_id || d.metadata.instance_sha256 !== old.instance_sha256 || Date.parse(d.metadata.scope.deadline_at) <= Date.now())
            byteBlocked('Byte return is not the committed reverse handoff for this original task/run/scope');
        return d.ref;
    };
    const validateSupervision = async (actor, task, request) => {
        validateActor(actor);
        const d = await inspectBound(task.input.authority.handoff_id ?? undefined);
        if (d.metadata.direction !== 'delegate' || digest(d.ref) !== digest(task.input.authority) || d.metadata.run_id !== request.run.run_id || sessionKey(request.supervisor) !== sessionKey(task.input.target) || sessionKey(actor.session) !== sessionKey(task.input.source))
            byteBlocked('Byte supervision run or original route differs from committed task');
        const state = currentState(root), uses = state.overall_outcome.workflow.used_runs.filter(([id]) => id === request.run.run_id);
        if (uses.length !== 1 || uses[0][1] !== d.metadata.attempt)
            byteBlocked('Bridge run_id/native proof cannot be reused across Byte attempts; keep the existing Byte monitor or use a genuinely new actual run identity');
        const launches = state.overall_outcome.workflow.evidence.flatMap(ref => { try {
            const p = file(root, ref.path);
            if (bytesSha(readFileSync(p)) !== ref.sha256)
                byteBlocked('Byte launch evidence hash changed');
            const value = JSON.parse(readFileSync(p, 'utf8'));
            return value.kind === 'run_launch' && value.run_id === d.metadata.run_id && value.attempt === d.metadata.attempt && value.outcome_id === d.metadata.outcome_id ? [value] : [];
        }
        catch {
            return [];
        } });
        if (launches.length !== 1)
            byteBlocked('Byte supervision needs exactly one committed launch proof for this run/attempt');
        const native = runIdentitySchema.safeParse(launches[0].process?.bridge_identity);
        if (!native.success || digest(native.data) !== digest(request.run))
            byteBlocked('Byte run_launch process.bridge_identity must be the exact native run proof; use existing Byte monitoring if absent, never guess PID');
        const receipt = JSON.parse(readFileSync(file(root, runReceiptPath(request.run)), 'utf8')), intent = JSON.parse(readFileSync(file(root, join(dirname(runReceiptPath(request.run)), 'launch-intent.json')), 'utf8'));
        if (receipt.schema_version !== 1 || digest(receipt.identity) !== digest(request.run) || intent.run_id !== request.run.run_id || intent.source_commit !== request.run.source_commit || intent.config_sha256 !== request.run.config_sha256 || intent.argv_sha256 !== receipt.argv_sha256 || (await observeRun(request.run)).status === 'unknown')
            byteBlocked('Byte supervision native run identity/launch/command/config could not be verified');
        const validateCommit = () => { verifyBoundSource(); if (bytesSha(readFileSync(file(root, '.byte-os/coordination/state.json'))) !== d.state_sha256)
            byteBlocked('Byte state changed before supervision registration'); };
        validateCommit();
        return validateCommit;
    };
    return { requireOwner, reconcileHandoff, authorizeDelegation, prepareByteHandoff, prepareReturn, validateSupervision, check: async (actor, ref, input) => { try {
            await requireOwner(actor);
            if (ref.owner_session_key !== sessionKey(actor.session) || ref.scope_digest !== scopeDigest((({ authority: _a, ...scope }) => scope)(input)))
                return deny('Byte owner/scope mismatch');
            return reconcileHandoff(ref);
        }
        catch {
            return deny('Byte owner unavailable');
        } } };
}
//# sourceMappingURL=byte-v1.js.map