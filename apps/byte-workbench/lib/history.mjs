import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { scoped, json } from './files.mjs';
// A bounded history page belongs to one exact project + task. No payload bodies
// or capabilities leave the transport store. Stable sequence cursors survive SSE.
export function taskHistory(root, taskId, {before, limit = 40} = {}) {
  if (typeof taskId !== 'string' || !taskId || taskId.length > 200) throw Error('Invalid task');
  limit = Number(limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('History limit must be 1–100');
  if (before != null && (!/^\d+$/.test(String(before)) || !Number.isSafeInteger(Number(before)))) throw Error('Invalid history cursor');
  for (const path of ['.session-bridge', '.session-bridge/project.json', '.session-bridge/bridge.sqlite'])
    if (lstatSync(join(root,path)).isSymbolicLink()) throw Error('Linked Bridge source');
  const cfg = json(scoped(root,'.session-bridge/project.json'));
  if (cfg.protocol_version !== 1 || typeof cfg.project_id !== 'string') throw Error('Invalid project');
  const db = new DatabaseSync(scoped(root,'.session-bridge/bridge.sqlite'), {readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=300; BEGIN');
    const schema = Number(db.prepare('PRAGMA user_version').get().user_version);
    if (schema < 1 || schema > 8) throw Error('Unsupported Bridge schema');
    const task = db.prepare('SELECT input_json FROM tasks WHERE task_id=?').get(taskId);
    if (!task) throw Error('Task is not in this project');
    const input = JSON.parse(task.input_json);
    const valid = i => i?.project_id === cfg.project_id && ['harness','host_id','profile_id','native_session_id','runtime_generation'].every(k => typeof i[k] === 'string' && i[k]);
    if (![input.source,input.target,input.return_to].every(valid)) throw Error('Task project identity mismatch');
    const deliveries = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deliveries'").get();
    const subject = deliveries ? '(subject_id=? OR subject_id IN (SELECT message_id FROM deliveries WHERE task_id=?))' : 'subject_id=?';
    const params = deliveries ? [taskId,taskId] : [taskId];
    const rows = db.prepare(`SELECT seq,kind,subject_id,created_at FROM events WHERE ${subject} AND seq < ? ORDER BY seq DESC LIMIT ?`)
      .all(...params, before == null ? Number.MAX_SAFE_INTEGER : Number(before), limit + 1);
    const page = rows.slice(0,limit).map(e => ({seq:Number(e.seq),kind:e.kind,subjectId:e.subject_id,at:e.created_at}));
    return {taskId, events:page, hasMore:rows.length > limit, nextCursor:rows.length > limit ? page.at(-1).seq : null,
      scope:'Selected task and its delivery event subjects; saved records, not a live execution transcript'};
  } finally {db.close();}
}
