import { z } from 'zod';
import { loadConnection } from '../cli/context.js';
import { BridgeClient } from '../transport/client.js';
import {sourceToolSchema,callForTool,type NativeToolName} from '../protocol/command-inputs.js';
export {sourceToolSchema} from '../protocol/command-inputs.js';
export const sourceToolJsonSchema=z.toJSONSchema(sourceToolSchema,{io:'input'});
export async function invokeSourceTool(file:string,root:string,raw:unknown,validate:()=>boolean){
 if(!validate())throw new Error('Original native caller is no longer current');
 const p=sourceToolSchema.parse(raw),c=await loadConnection({SESSIONBRIDGE_CONNECTION:file,SESSIONBRIDGE_PROJECT:root},root),client=new BridgeClient(c);await client.call(c.actor,'context',{});
 if(!validate())throw new Error('Native source changed during the call');
 if(p.method==='context' || p.method==='sessions' || p.method==='request')return client.call(c.actor,p.method,p.params);
 const call=callForTool(p.method as NativeToolName,p.params);return client.call(c.actor,call.method,call.params);
}
