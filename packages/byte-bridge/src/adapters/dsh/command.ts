import type {Context} from '@deepseek-ai/cordis';
import type {CommandDefinition} from '@deepseek-ai/dsh-commands';
import type {ToolCallId} from '@deepseek-ai/dsh-llm';
import {sourceToolSchema} from '../source-tool.js';

/** Human UI entry to the same original-Agent tool, retaining native guards. */
export function registerDshCommand(ctx:Context):()=>void {
 const command:CommandDefinition={name:'sessionbridge',description:'Byte Bridge：查询当前原会话或执行结构化协作请求',input:{hint:'JSON {"method":"context","params":{}}'},handler:async invocation=>{
  try{
   const raw=sourceToolSchema.parse(JSON.parse(invocation.rawInput));
   const result=await ctx.tools.execute({callId:('sessionbridge-command:'+invocation.commandId) as ToolCallId,name:'sessionbridge_request',arguments:raw,agent:invocation.agent,signal:invocation.signal});
   const text=result.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
   return result.isError?{kind:'error',text:text||'Native Bridge tool failed'}:{kind:'success',text};
  }catch(error){return {kind:'error',text:error instanceof Error?error.message:String(error)};}
 }};
 return ctx.commands.register(command);
}
