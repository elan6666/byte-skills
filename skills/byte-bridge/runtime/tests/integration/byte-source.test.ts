import {test} from 'node:test';import assert from 'node:assert/strict';import{resolve,join}from'node:path';import{readFileSync,writeFileSync,cpSync}from'node:fs';
import{deliveryLab}from'../helpers/delivery-lab.js';
import{pinByteSource,readByteSource,doctorByteSource}from'../../src/workflows/byte-source.js';
test('Byte source is explicitly pinned, drift refused, upgrade uses old pin CAS',async t=>{
 const f=await deliveryLab(t),source=join(f.root,'byte');cpSync(resolve('tests/fixtures/byte-v1'),source,{recursive:true});
 assert.throws(()=>readByteSource(f.root),/pin|source/i);
 const input={source_root:source,source_commit:'fixture-current-byte',python_bin:'/usr/bin/python3'};
 const first=pinByteSource(f.root,input);assert.equal(doctorByteSource(f.root).state,'ready');
 const helper=join(source,'byte-workflow/scripts/continuation_check.py');writeFileSync(helper,readFileSync(helper,'utf8')+'\n# drift\n');
 assert.equal(doctorByteSource(f.root).state,'blocked');assert.throws(()=>pinByteSource(f.root,input),/pin|upgrade/i);
 const next=pinByteSource(f.root,{...input,expected_pin_sha256:first.pin_sha256});assert.notEqual(next.pin_sha256,first.pin_sha256);assert.equal(doctorByteSource(f.root).state,'ready');
});
test('source pin writer does not override another in-progress bind',async t=>{
 const f=await deliveryLab(t),source=join(f.root,'byte');cpSync(resolve('tests/fixtures/byte-v1'),source,{recursive:true});const lock=join(f.root,'.session-bridge/byte-source.lock');writeFileSync(lock,'owned-by-another-binder');
 assert.throws(()=>pinByteSource(f.root,{source_root:source,source_commit:'fixture',python_bin:'/usr/bin/python3'}),/progress|lock/i);assert.equal(readFileSync(lock,'utf8'),'owned-by-another-binder');
});
import{runCli}from'../../src/cli/main.js';import{existsSync,readdirSync,mkdtempSync,rmSync}from'node:fs';
test('Byte CLI doctor is read-only without source binding or native session',async t=>{const root=mkdtempSync('/tmp/sb-byte-doctor-');t.after(()=>rmSync(root,{recursive:true,force:true}));let out='',err='';const code=await runCli(['byte-doctor','--project',root,'--json'],{stdin:'',stdout:s=>out+=s,stderr:s=>err+=s,isTTY:false});assert.equal(code,3);assert.equal(err,'');assert.equal(JSON.parse(out).state,'blocked');assert.deepEqual(readdirSync(root),[]);});
test('Byte CLI dry-run pins no files; explicit binding and doctor need no native chat',async t=>{const f=await deliveryLab(t),source=join(f.root,'byte');cpSync(resolve('tests/fixtures/byte-v1'),source,{recursive:true});const input={source_root:source,source_commit:'fixture',python_bin:'/usr/bin/python3'};let out='',err='';const io={stdin:JSON.stringify(input),stdout:(s:string)=>out+=s,stderr:(s:string)=>err+=s,isTTY:false};assert.equal(await runCli(['byte-source','--project',f.root,'--stdin','--json','--dry-run'],io),0,err);assert.equal(JSON.parse(out).dry_run,true);assert.equal(existsSync(join(f.root,'.session-bridge/byte-source.json')),false);out='';assert.equal(await runCli(['byte-source','--project',f.root,'--stdin','--json'],io),0,err);assert.equal(JSON.parse(out).state,'ready');out='';assert.equal(await runCli(['byte-doctor','--project',f.root,'--json'],{...io,stdin:''}),0,err);assert.equal(JSON.parse(out).native_scheduler_verified,false);});
