import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const {receiveNative}=await import(pathToFileURL(resolve('plugins/opencode/intake.mjs')).href);
test('OpenCode status outage retains original work until receipt succeeds',async()=>{
 const e={message_id:'one',expires_at:new Date(Date.now()+60000).toISOString()},queue=[e];let published=0;
 await assert.rejects(receiveNative(queue,async()=>{throw new Error('core offline');},async()=>{published++;}),/offline/);assert.deepEqual(queue,[e]);assert.equal(published,0);
 const result=await receiveNative(queue,async()=>({task:{state:'ready'},cancel_pending:false}),async()=>{published++;});assert.equal(result,e);assert.equal(queue.length,0);assert.equal(published,1);
});
test('OpenCode durable cancellation skips a ready task without accepting it',async()=>{
 const queue=[{message_id:'cancelled',expires_at:new Date(Date.now()+60000).toISOString()}];let published=0;
 assert.equal(await receiveNative(queue,async()=>({task:{state:'ready'},cancel_pending:true}),async()=>{published++;}),null);assert.equal(queue.length,0);assert.equal(published,0);
});
test('OpenCode acceptance publication failure retains original inbox entry',async()=>{
 const e={message_id:'one',expires_at:new Date(Date.now()+60000).toISOString()},queue=[e];await assert.rejects(receiveNative(queue,async()=>({task:{state:'ready'}}),async()=>{throw new Error('receipt unavailable');}),/unavailable/);assert.deepEqual(queue,[e]);
});
test('OpenCode does not accept work expiring during asynchronous status lookup',async()=>{
 const queue=[{message_id:'expires',expires_at:new Date(Date.now()+20).toISOString()}];let published=0;
 const e=await receiveNative(queue,async()=>{await new Promise(r=>setTimeout(r,60));return {task:{state:'ready'}};},async()=>{published++;});assert.equal(e,null);assert.equal(published,0);
});
test('OpenCode cancelled native wait keeps unclaimed work for a later authorized wait',async()=>{
 const e={message_id:'original',expires_at:new Date(Date.now()+60000).toISOString()},queue=[e];let allowed=true,published=0;
 assert.equal(await receiveNative(queue,async()=>{allowed=false;return {task:{state:'ready'}};},async()=>{published++;},()=>allowed),null);assert.deepEqual(queue,[e]);assert.equal(published,0);
});
