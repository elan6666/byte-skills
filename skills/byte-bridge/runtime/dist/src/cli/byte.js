import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, sessionKey } from '../protocol/canonical.js';
import { openStore } from '../core/database.js';
import { exactBinding, readTask, requireActor } from '../core/tasks.js';
import { byteBlocked, doctorByteSource, readByteSource } from '../workflows/byte-source.js';
import { createByteV1Workflow, byteImportInputSchema, doctorByteProject, inspectCommittedHandoff } from '../workflows/byte-v1.js';
export async function byteDoctor(root) {
    const source = doctorByteSource(root);
    if (source.state !== 'ready')
        return source;
    const path = join(root, '.byte-os/coordination/state.json');
    if (!existsSync(path))
        return { ...source, workflow: 'not_initialized', native_scheduler_verified: false };
    const state = JSON.parse(readFileSync(path, 'utf8')), engine = state.overall_outcome?.workflow?.engine;
    if (!engine)
        return { ...source, workflow: 'legacy', supported_harnesses: ['codex', 'claude', 'dsh', 'zcode'], native_scheduler_verified: false };
    if (engine !== 'byte-workflow/v1')
        return { state: 'blocked', reason: 'Unsupported Byte engine', native_scheduler_verified: false };
    try {
        const validation = await doctorByteProject(root);
        if (digest(readByteSource(root)) !== source.pin_sha256)
            byteBlocked('Byte source pin changed during doctor');
        return { ...source, workflow: engine, validation, native_scheduler_verified: false };
    }
    catch (e) {
        return { state: 'blocked', reason: e instanceof Error ? e.message : String(e), native_scheduler_verified: false };
    }
}
export async function byteImportRequest(root, actor, raw) {
    const p = byteImportInputSchema.parse(raw), d = await inspectCommittedHandoff(root, p.handoff_id), scope = d.metadata.scope;
    if (sessionKey(actor.session) !== sessionKey(scope.source))
        byteBlocked('Only the original authenticated source may import this Byte notification');
    const request_id = 'byte-import:' + digest({ handoff: d.ref.handoff_id, sha: d.handoff_sha256, task_id: p.task_id ?? null });
    if (d.metadata.direction === 'return') {
        if (!p.task_id)
            byteBlocked('Byte return import requires the original Bridge task_id and prior report');
        const store = openStore(root);
        try {
            requireActor(store, actor, 'return_to_main', p.task_id);
            const task = readTask(store, p.task_id);
            if (task.input.authority.workflow !== 'byte')
                byteBlocked('Byte return import requires its original Byte task');
            await createByteV1Workflow(root).prepareReturn(actor, task);
            if (!store.db.prepare('SELECT task_id FROM task_results WHERE task_id=?').get(p.task_id))
                byteBlocked('Report the original immutable task result before return import; no import request was journaled');
        }
        finally {
            store.close();
        }
        return { request_id, operation: 'return', task_id: p.task_id };
    }
    if (p.task_id)
        byteBlocked('Byte delegate import does not accept a guessed task_id');
    const store = openStore(root);
    try {
        const target = await exactBinding(store, scope.target);
        return { request_id, operation: 'delegate', target: { query: target.binding_id }, goal: scope.goal, acceptance: scope.acceptance, read_paths: scope.read_paths, write_paths: scope.write_paths, deadline_at: scope.deadline_at };
    }
    finally {
        store.close();
    }
}
//# sourceMappingURL=byte.js.map