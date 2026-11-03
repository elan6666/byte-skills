import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexConfigSchema } from '../../src/adapters/codex/connect.js';
const config={desktopBinary:'/native/codex',codexHome:'/private/profile',projectRoot:'/workspace',nativeCwd:'/workspace',owner:{pid:1,started_at:'born',executable:'/native/codex'}};
test('Codex connection config records newer labels without an exclusive version enum',()=>{
 assert.equal(codexConfigSchema.safeParse({...config,expectedVersion:'0.163.0-alpha.11.2'}).success,true);
 assert.equal(codexConfigSchema.safeParse({...config,expectedVersion:'0.164.0-alpha.11.1'}).success,true);
 for(const expectedVersion of ['0.167.0-alpha.1','1.0.0','development'])assert.equal(codexConfigSchema.safeParse({...config,expectedVersion}).success,true);assert.equal(codexConfigSchema.safeParse({...config,expectedVersion:''}).success,false);
});
test('legacy_codex_connections_keep_their_exact_version',()=>{
 assert.equal(codexConfigSchema.parse({...config,expectedVersion:'0.163.0-alpha.11'}).expectedVersion,'0.163.0-alpha.11');
});
