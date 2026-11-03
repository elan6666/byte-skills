export function matchingSessions(sessions, {harness, filter='all', query='', attention=()=>false}={}) {
  const q=query.trim().toLowerCase();
  return sessions.filter(s=>(!harness || s.harness===harness) &&
    (filter!=='connected' || s.connection==='registered') &&
    (filter!=='attention' || attention(s)) &&
    (!q || [s.title,s.nativeId,s.role,s.model].join(' ').toLowerCase().includes(q)))
    .sort((a,b)=>Number(!!a.parentNativeId)-Number(!!b.parentNativeId) ||
      (b.lastActivityAt||'').localeCompare(a.lastActivityAt||'') || a.id.localeCompare(b.id));
}
export function sessionLocation(sessions,harnesses,id,pageSize=6) {
  const s=sessions.find(s=>s.id===id);
  if(!s)return null;
  const zone=harnesses.indexOf(s.harness);
  if(zone<0)return null;
  const group=matchingSessions(sessions,{harness:s.harness});
  return {floor:Math.floor(zone/4),harness:s.harness,page:Math.floor(group.findIndex(x=>x.id===id)/pageSize)};
}
