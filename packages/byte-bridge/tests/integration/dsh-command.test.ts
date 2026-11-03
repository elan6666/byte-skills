import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Context} from '@deepseek-ai/cordis';
import type {CommandDefinition,CommandInvocation} from '@deepseek-ai/dsh-commands';
import {registerDshCommand} from '../../src/adapters/dsh/command.js';

test('DSH human Bridge command preserves the exact receiving Agent and native permission pipeline',async()=>{
 let command:CommandDefinition|undefined,calls=0;
 const agent={id:'original'},signal=new AbortController().signal;
 const ctx={commands:{register:(definition:CommandDefinition)=>{command=definition;return ()=>{command=undefined;};}},tools:{execute:async(input:{agent:unknown;signal:unknown;name:string;arguments:unknown})=>{
  calls++;assert.equal(input.agent,agent);assert.equal(input.signal,signal);assert.equal(input.name,'sessionbridge_request');assert.deepEqual(input.arguments,{method:'context',params:{}});
  return {isError:true,content:[{type:'text',text:'Native permission denied'}]};
 }}} as unknown as Context;
 const dispose=registerDshCommand(ctx);
 const invocation={agent,signal,commandId:'actual-ui-command',rawInput:'{"method":"context","params":{}}'} as unknown as CommandInvocation;
 const result=await command!.handler(invocation);assert.equal(result.kind,'error');assert.equal(result.text,'Native permission denied');assert.equal(calls,1);
 const forged=await command!.handler({...invocation,rawInput:'{"method":"context","params":{"source":"someone-else"}}'});assert.equal(forged.kind,'error');assert.equal(calls,1);
 dispose();assert.equal(command,undefined);
});
