import {test} from 'node:test';import assert from 'node:assert/strict';
import {hermesNativeToolSchema} from '../../src/protocol/command-inputs.js';
import {runCli} from '../../src/cli/main.js';
test('Hermes report advertises and enforces the same summary and relative-artifact contract',()=>{
 assert.equal(hermesNativeToolSchema.safeParse({command:'report',payload:{task_id:'task',status:'completed',text:'done',artifact_paths:['workspace/file.py']}}).success,false);
 assert.equal(hermesNativeToolSchema.safeParse({command:'report',payload:{task_id:'task',summary:'actual work',artifact_paths:['workspace/file.py']}}).success,true);
 assert.equal(hermesNativeToolSchema.safeParse({command:'report',payload:{task_id:'task',summary:'actual',artifact_paths:['/tmp/outside.py']}}).success,false);
});
test('CLI invalid report gives actionable contract error before source discovery',async()=>{
 let out='',err='';const code=await runCli(['report','--stdin','--json'],{stdin:JSON.stringify({task_id:'task',status:'completed',artifact_paths:[]}),stdout:s=>out+=s,stderr:s=>err+=s,isTTY:false});
 assert.equal(code,4);assert.equal(out,'');assert.equal(JSON.parse(err).error.code,'invalid_report');assert.match(JSON.parse(err).error.recovery,/summary/);
});
