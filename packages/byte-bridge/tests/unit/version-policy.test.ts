import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireMinimumVersion} from '../../src/adapters/version-policy.js';
import {checkCodexProtocolSchema} from '../../src/adapters/codex/version.js';

test('all adapters let newer, prerelease and development labels reach native protocol checks',()=>{
 for(const label of ['0.18.0','1.0.0','v0.18.0-beta.1','development'])assert.doesNotThrow(()=>requireMinimumVersion('agent',label,'0.17.0'));
 assert.throws(()=>requireMinimumVersion('agent','0.16.99','0.17.0'),/requires version/);
 assert.throws(()=>requireMinimumVersion('claude','2.1.9','2.1.306'),/requires version/);
 assert.doesNotThrow(()=>requireMinimumVersion('claude','2.2.0','2.1.306'));
});
const methods:Record<string,string[]>={initialize:['clientInfo','capabilities'],'thread/read':['threadId','includeTurns'],'thread/loaded/list':[],'thread/queue/add':['threadId','clientUserMessageId','input'],'thread/queue/list':['threadId','limit','cursor'],'thread/turns/list':['threadId','limit','itemsView','cursor']};
function schema(){return {oneOf:Object.keys(methods).map((method,i)=>({properties:{method:{enum:[method]},params:{$ref:'#/definitions/p'+i}}})),definitions:Object.fromEntries(Object.values(methods).map((fields,i)=>['p'+i,{properties:Object.fromEntries(fields.map(name=>[name,{}])),required:fields}]))};}
test('Codex compatibility requires usable queue/history methods rather than a version string',()=>{
 assert.doesNotThrow(()=>checkCodexProtocolSchema(schema()));
 const unused=schema();unused.oneOf=unused.oneOf.filter(r=>!r.properties.method.enum.includes('thread/loaded/list'));assert.doesNotThrow(()=>checkCodexProtocolSchema(unused));
 const absent=schema();absent.oneOf=absent.oneOf.filter(r=>!r.properties.method.enum.includes('thread/queue/add'));assert.throws(()=>checkCodexProtocolSchema(absent),/thread\/queue\/add/);
 const incompatible=schema();incompatible.definitions.p3!.required.push('newMandatoryArgument');assert.throws(()=>checkCodexProtocolSchema(incompatible),/thread\/queue\/add/);
 assert.throws(()=>checkCodexProtocolSchema({}),/request methods/);
});
