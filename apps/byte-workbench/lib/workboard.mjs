import {readBoard,sessionKey,planProgress} from '../../../skills/byte-plan/scripts/workboard.mjs';
import {hash} from './files.mjs';
export function displaySnapshot(raw){
  let board,warnings=[...raw.warnings];
  try{board=readBoard(raw.project.root);}catch(e){warnings.push('展示登记不可读：'+e.message);board={displaySessions:[],items:[],collaborations:[],revision:0};}
  const keys = new Set(board.displaySessions.map(sessionKey));
  const candidates = raw.sessions.filter((session) => keys.has(sessionKey(session)));
  const ids = new Set(candidates.map((session) => session.id));
  const tasks = raw.tasks.filter((task) => ids.has(task.source) && ids.has(task.target));
  const taskParticipants = new Set(tasks.flatMap((task) => [task.source, task.target, task.returnTo]));
  const nativeKeys = new Set(candidates.filter((session) => session.source?.endsWith("-catalog")).map(sessionKey));
  // A native chat is one display registration. Preserve older generations when
  // they identify a visible task participant, but avoid extra inactive desks.
  const sessions = candidates.filter((session) =>
    session.source !== "bridge" || session.connection === "registered" ||
    !nativeKeys.has(sessionKey(session)) || taskParticipants.has(session.id)
  );
  const taskIds=new Set(tasks.map(t=>t.id));
  const out={...raw,sessions,tasks,deliveries:raw.deliveries.filter(d=>taskIds.has(d.taskId)),runs:raw.runs.filter(r=>taskIds.has(r.taskId)),warnings,
    sessionCatalog:raw.sessions.map(s=>({id:s.id,harness:s.harness,nativeId:s.nativeId,title:s.title,parentNativeId:s.parentNativeId})),
    board,planProgress:planProgress(board.items),counts:{...raw.counts,sessions:sessions.length,discovered:raw.sessions.length,
      connected:sessions.filter(s=>s.connection==='registered').length,needsAttention:tasks.filter(t=>['failed','needs_input','result_reported','cancel_requested'].includes(t.state)).length,
      running:tasks.filter(t=>t.state==='running').length,verified:tasks.filter(t=>['verified','main_continued'].includes(t.state)).length}};
  out.revision=hash({...out,observedAt:undefined});return out;
}
