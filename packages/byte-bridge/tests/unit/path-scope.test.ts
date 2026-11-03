import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withinPaths} from '../../src/return/continuation.js';

test('directory scope with a trailing slash accepts its artifacts without expanding scope',()=>{
 assert.equal(withinPaths('evidence/result.md',['evidence/']),true);
 assert.equal(withinPaths('evidence/result.md',['evidence///']),true);
 assert.equal(withinPaths('evidence/result.md',['evidence']),true);
 assert.equal(withinPaths('evidence-other/result.md',['evidence/']),false);
 assert.equal(withinPaths('content/result.md',['evidence/']),false);
 assert.equal(withinPaths('../evidence/result.md',['evidence/']),false);
 assert.equal(withinPaths('/evidence/result.md',['evidence/']),false);
 assert.equal(withinPaths('.session-bridge/private.json',['.']),false);
 assert.equal(withinPaths('.git/config',['.']),false);
 assert.equal(withinPaths('result.md',['/']),false);
});
