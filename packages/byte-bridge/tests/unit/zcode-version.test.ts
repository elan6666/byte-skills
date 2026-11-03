import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkZCodeVersion,checkZCodeCapabilities,ZCODE_NATIVE_ARTIFACTS} from '../../src/adapters/zcode/version.js';
const capabilities={sessionLifecycleWorkspace:true,sessionWorkspaceRouting:true,historyFirst:true,sessionDirectorySource:true};
test('ZCode accepts newer stable versions only after required capabilities pass',()=>{
 assert.equal(checkZCodeCapabilities('0.18.7','unknown-build',capabilities).state,'capability_checked');
 assert.equal(checkZCodeCapabilities('0.17.1','changed-build',capabilities).state,'capability_checked');
 assert.equal(checkZCodeCapabilities('0.17.1',ZCODE_NATIVE_ARTIFACTS['0.17.1'],capabilities).state,'verified_build');
 for(const missing of Object.keys(capabilities))assert.throws(()=>checkZCodeCapabilities('0.18.7','unknown',{...capabilities,[missing]:false}),/compatibility probe missing/);
 for(const raw of [null,[],true,{...capabilities,historyFirst:'true'}])assert.throws(()=>checkZCodeCapabilities('0.18.7','unknown',raw),/compatibility probe missing/);
});
test('ZCode rejects obsolete versions and probes newer major or development labels',()=>{
 for(const version of ['0.0.0','0.16.99'])assert.throws(()=>checkZCodeVersion(version),/requires version/);
 for(const version of ['0.18.0-beta.1','1.0.0','development'])assert.equal(checkZCodeCapabilities(version,'unknown',capabilities).state,'capability_checked');
});
