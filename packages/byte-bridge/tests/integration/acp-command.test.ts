import {test} from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,writeFileSync,existsSync,rmSync}from'node:fs';import{tmpdir,homedir}from'node:os';import{join}from'node:path';
import{runAcpHost}from'../../src/adapters/acp/command.js';
test('managed ACP rejects the real home before even invoking native --version',async()=>{
 const root=mkdtempSync(join(tmpdir(),'sb-acp-command-')),marker=join(root,'native-was-invoked'),binary=join(root,'fake-native');
 try{writeFileSync(binary,`#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'invoked');process.stdout.write('test');`,{mode:0o700});
 for(const harness of ['kimi','opencode'] as const){await assert.rejects(runAcpHost(root,harness,{profile_dir:homedir(),binary,expected_version:'test',alias:'unsafe'},()=>{}),/isolated profile/);assert.equal(existsSync(marker),false);}}
 finally{rmSync(root,{recursive:true,force:true});}
});
