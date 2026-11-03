import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, symlinkSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './fixtures.mjs';
import { hash } from '../lib/files.mjs';
import { collectRecall, queryRecall } from '../../../skills/byte-status/scripts/recall.mjs';
import { taskHistory } from '../lib/history.mjs';
import { mergeHistory } from '../public/worklog.js';
import { createWorkbench } from '../server.mjs';

function setup(t) {
  const f=fixture();t.after(()=>f.cleanup());
  mkdirSync(join(f.root,'.byte-os'),{recursive:true});
  writeFileSync(join(f.root,'.byte-os/STATE.md'),'# Database 项目\n正在处理训练，保留实验基线。\n## 选择\n采用本地 SQLite 数据库，拒绝外部服务。\n');
  writeFileSync(join(f.root,'.byte-os/LESSONS.md'),'## 决策\n项目 database migration 使用独立验收。\n<private>\n## 隐私标题\nPRIVATE_CANARY_DO_NOT_INDEX\n</private>\napi_key=sk-abcdefghijklmnopqrstu\nAuthorization: Bearer confidential-canary\n');
  mkdirSync(join(f.other,'.byte-os'),{recursive:true});
  writeFileSync(join(f.other,'.byte-os/STATE.md'),'# 别的项目\nOTHER_PROJECT_CANARY database\n');
  return f;
}
test('Chinese substring and conjunctive mixed-language recall stays in one project',t=>{
  const f=setup(t),collection=collectRecall(f.root);
  assert.equal(queryRecall(collection,{query:'项目 database migration'}).total,1);
  assert(queryRecall(collection,{query:'数据库'}).total>=1);
  assert.equal(queryRecall(collection,{query:'database missing'}).total,0);
  assert(!JSON.stringify(collection).includes('OTHER_PROJECT_CANARY'));
});
test('private blocks and credential values are stripped before splitting/searching',t=>{
  const f=setup(t),c=collectRecall(f.root),value=JSON.stringify(c);
  for(const secret of ['PRIVATE_CANARY_DO_NOT_INDEX','隐私标题','sk-abcdefghijklmnopqrstu','confidential-canary','private-endpoint-token','do-not-expose'])assert(!value.includes(secret));
  assert.equal(queryRecall(c,{query:'PRIVATE_CANARY_DO_NOT_INDEX'}).total,0);
});
test('index is compact, detail requires an ID, and changed sources fail the digest check',t=>{
  const f=setup(t),c=collectRecall(f.root),index=queryRecall(c,{query:'数据库'});
  const hit=index.hits[0];assert(hit);assert(!('body' in hit));
  assert(queryRecall(c,{id:hit.id,sha256:hit.sha256}).record.body.includes('SQLite'));
  writeFileSync(join(f.root,'.byte-os/STATE.md'),readFileSync(join(f.root,'.byte-os/STATE.md'),'utf8').replace('SQLite','PostgreSQL'));
  assert.throws(()=>queryRecall(collectRecall(f.root),{id:hit.id,sha256:hit.sha256}),/changed/);
  assert.throws(()=>queryRecall(collectRecall(f.other),{id:hit.id}),/selected project/);
});
test('on-demand reconstruction reflects deletion without a stale persistent copy',t=>{
  const f=setup(t);assert(queryRecall(collectRecall(f.root),{query:'数据库'}).total);
  unlinkSync(join(f.root,'.byte-os/STATE.md'));
  assert.equal(queryRecall(collectRecall(f.root),{query:'数据库'}).total,0);
});
test('search and detail respect character budgets and bound malformed queries',t=>{
  const f=setup(t),c=collectRecall(f.root);
  const result=queryRecall(c,{maxChars:1000,limit:20});assert(result.returnedChars<=1000);assert(result.truncated);
  const hit=queryRecall(c,{query:'database'}).hits[0];
  assert(queryRecall(c,{id:hit.id,maxChars:256}).record.body.length<=256);
  assert.throws(()=>queryRecall(c,{query:'x'.repeat(501)}),/500/);
  assert.throws(()=>queryRecall(c,{query:Array.from({length:17},(_,i)=>'term'+i).join(' ')}),/16 distinct/);
  assert.throws(()=>queryRecall(c,{query:'"*%'}),/needs a word/);
});
test('note and Bridge symlinks cannot import other project data',t=>{
  const f=setup(t);unlinkSync(join(f.root,'.byte-os/STATE.md'));
  symlinkSync(join(f.other,'.byte-os/STATE.md'),join(f.root,'.byte-os/STATE.md'));
  const c=collectRecall(f.root);assert(c.warnings.some(w=>w.includes('Linked')));assert(!JSON.stringify(c).includes('OTHER_PROJECT_CANARY'));
});
test('two separate CLI processes reconstruct the same source-backed memory without writes',t=>{
  const f=setup(t),file=join(f.root,'.byte-os/STATE.md'),before=hash(readFileSync(f.path)),stamp=statSync(file).mtimeMs;
  const cli=resolve('../../skills/byte-status/scripts/recall.mjs');
  const first=spawnSync(process.execPath,[cli,'--project',f.root,'--query','数据库'],{encoding:'utf8'});
  assert.equal(first.status,0,first.stderr);const hit=JSON.parse(first.stdout).hits[0];
  const second=spawnSync(process.execPath,[cli,'--project',f.root,'--get',hit.id,'--sha256',hit.sha256],{encoding:'utf8'});
  assert.equal(second.status,0,second.stderr);assert(JSON.parse(second.stdout).record.body.includes('SQLite'));
  assert.equal(hash(readFileSync(f.path)),before);assert.equal(statSync(file).mtimeMs,stamp);
});
test('mismatched Bridge task identities and unsupported future schema fail closed',t=>{
  const f=setup(t);f.db.prepare('UPDATE tasks SET input_json=?').run(JSON.stringify({source:{...f.main,project_id:'other'},target:f.worker,return_to:f.main,goal:'FOREIGN_TASK'}));
  assert(!JSON.stringify(collectRecall(f.root)).includes('FOREIGN_TASK'));
  f.db.exec('PRAGMA user_version=99');assert(collectRecall(f.root).warnings.some(x=>x.includes('Unsupported')));
});
test('task history pages are stable, ordered and do not mix subjects or expose payloads',t=>{
  const f=setup(t);
  for(let i=2;i<=90;i++)f.db.prepare('INSERT INTO events VALUES(?,?,?,?,?)').run(i,'task_running',i%3?'task-1':'other-task','{"secret":"PAYLOAD_CANARY"}',new Date().toISOString());
  const before=hash(readFileSync(f.path)),first=taskHistory(f.root,'task-1',{limit:20}),all=[...first.events];
  assert(first.hasMore);assert.equal(first.events.length,20);
  let page=first;while(page.hasMore){page=taskHistory(f.root,'task-1',{before:page.nextCursor,limit:20});all.push(...page.events);}
  assert.equal(all.length,new Set(all.map(x=>x.seq)).size);assert(all.every(x=>x.subjectId==='task-1'||x.subjectId==='message-1'));
  assert(!JSON.stringify(all).includes('PAYLOAD_CANARY'));assert.equal(hash(readFileSync(f.path)),before);
  assert.throws(()=>taskHistory(f.other,'task-1'));
  assert.throws(()=>taskHistory(f.root,'task-1',{before:'0 OR 1=1'}));
});
test('late history pages deduplicate without overwriting an already loaded event',()=>{
  const now={seq:3,kind:'new'},old={seq:3,kind:'old'};
  assert.deepEqual(mergeHistory([now],[{seq:1},old,{seq:1},{seq:2}]),[now,{seq:2},{seq:1}]);
});
test('recall/history API validates project selection, isolates demo and rejects foreign origin',async t=>{
  const f=setup(t),server=createWorkbench({roots:[f.root,f.other],discover:false,config:join(f.base,'projects.json')});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.closeWorkbench());
  const base='http://127.0.0.1:'+server.address().port,list=await(await fetch(base+'/api/projects')).json(),id=list.projects.find(p=>p.root===f.root).id;
  assert.equal((await fetch(base+'/api/recall')).status,400);
  const search=await(await fetch(base+'/api/recall?'+new URLSearchParams({project:id,query:'数据库'}))).json();assert(search.hits.length);
  assert.equal((await fetch(base+'/api/recall?project='+id,{headers:{Origin:'https://outside.invalid'}})).status,403);
  assert.equal((await(await fetch(base+'/api/recall?project=demo-office')).json()).demo,true);
  assert((await(await fetch(base+'/api/task-history?'+new URLSearchParams({project:id,task:'task-1'}))).json()).events.length);
});
