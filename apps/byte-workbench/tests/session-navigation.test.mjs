import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fixture, nativeFixture } from './fixtures.mjs';
import { NativeCatalog } from '../lib/native.mjs';
import { matchingSessions,sessionLocation } from '../public/session-navigation.js';
test('desktop display name takes priority over stale first-message title, with legacy fallback',t=>{
  const f=fixture();t.after(()=>f.cleanup());const file=nativeFixture(f),db=new DatabaseSync(file);
  db.exec('ALTER TABLE threads ADD COLUMN name TEXT');
  db.prepare('UPDATE threads SET name=?,title=? WHERE id=?').run('byte skills','old first prompt','main-session');
  db.prepare('UPDATE threads SET name=?,title=? WHERE id=?').run('  ','legacy child title','child-session');
  db.close();const rows=new NativeCatalog({home:f.home}).sessions(f.root).sessions;
  assert.equal(rows.find(s=>s.nativeId==='main-session').title,'byte skills');
  assert.equal(rows.find(s=>s.nativeId==='child-session').title,'legacy child title');
});
const sessions=Array.from({length:19},(_,i)=>({id:'s'+i,nativeId:'native-'+i,title:i===17?'回应问候':'chat '+i,harness:i===18?'hermes':'codex',parentNativeId:i<9?'main':null,lastActivityAt:new Date(100000+i*1000).toISOString()}));
test('main chats precede children; every roster member is reachable on the correct page/floor',()=>{
  const harnesses=['codex','zcode','claude','opencode','hermes'];
  assert.equal(matchingSessions(sessions)[0].parentNativeId,null);
  for(const s of sessions){const location=sessionLocation(sessions,harnesses,s.id);assert(location);const group=matchingSessions(sessions,{harness:s.harness});assert(group.slice(location.page*6,location.page*6+6).some(x=>x.id===s.id));}
  assert.equal(sessionLocation(sessions,harnesses,'s18').floor,1);
});
test('search finds renamed chats and IDs outside the first six without losing children',()=>{
  assert.deepEqual(matchingSessions(sessions,{query:'回应问候'}).map(s=>s.id),['s17']);
  assert.deepEqual(matchingSessions(sessions,{query:'native-18'}).map(s=>s.id),['s18']);
  assert.equal(matchingSessions(sessions).length,19);
});
