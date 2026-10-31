import {createServer} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
export async function zcodeModel(profile:string,behavior:'managed'|'attached'='managed'){
 const requests:Record<string,unknown>[]=[];let release:(()=>void)|undefined;
 const server=createServer((req,res)=>{void (async()=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString()) as {messages:{role:string;content:unknown}[];tools?:{function:{name:string}}[]};requests.push(body);
  const lastUser=body.messages.map(m=>m.role==='user' && !(typeof m.content==='string' && m.content.startsWith('<system-reminder>'))?'user':m.role==='user'?'reminder':m.role).lastIndexOf('user'),content=body.messages[lastUser]?.content,text=typeof content==='string'?content:JSON.stringify(content),used=body.messages.slice(lastUser+1).some(m=>m.role==='tool');
  if(text.includes('HOLD') && !used)await new Promise<void>(r=>{release=r;res.once('close',r);});
  const requested=text.includes('NATIVE_CALL:')?JSON.parse(text.slice(text.indexOf('NATIVE_CALL:')+12)) as {name:string;input:Record<string,unknown>}:null;
  const nativeName=requested?.name??'sessionbridge_attach',attachTool=body.tools?.find(t=>t.function.name.endsWith('__'+nativeName))?.function.name;
  const lastTool=body.messages.slice(lastUser+1).filter(m=>m.role==='tool').at(-1),toolText=JSON.stringify(lastTool?.content??'').replaceAll('\\\"','\"'),challenge=toolText.match(/"challenge"\s*:\s*"([a-f0-9-]{36})"/)?.[1];
  const attachCall=behavior==='attached' && !text.includes('WARM') && attachTool && (!used || challenge);
  const tool=body.tools?.find(t=>t.function.name.includes('sessionbridge_request'))?.function.name;
  const call=tool && !used && !text.includes('WARM') && !text.includes('HOLD');
  res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'close'});
  const emit=(delta:unknown,finish_reason:string|null=null)=>res.write('data: '+JSON.stringify({id:'chat-fixture',object:'chat.completion.chunk',created:1,model:'glm-5.3-flash',choices:[{index:0,delta,finish_reason}]})+'\n\n');
  if(attachCall){emit({role:'assistant',tool_calls:[{index:0,id:'call_attach_'+requests.length,type:'function',function:{name:attachTool,arguments:JSON.stringify({...requested?.input,...(challenge?{challenge}:{})})}}]});emit({},'tool_calls');}else if(call && behavior==='managed'){emit({role:'assistant',tool_calls:[{index:0,id:'call_context',type:'function',function:{name:tool,arguments:JSON.stringify(text.includes('CALL_SOURCE:')?JSON.parse(text.slice(text.indexOf('CALL_SOURCE:')+12)):{method:'context',params:{}})}}]});emit({},'tool_calls');}else{emit({role:'assistant',content:'FIXTURE_REPLY'});emit({},'stop');}res.end('data: [DONE]\n\n');
 })().catch(()=>res.destroy());});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address || typeof address==='string')throw new Error('No fixture address');
 const path=join(profile,'.zcode/v2');mkdirSync(path,{recursive:true});writeFileSync(join(path,'provider_config.json'),JSON.stringify({schemaVersion:1,config:{providerConfigRules:{providerRules:[{providerId:'fixture',providerName:'Local fixture',config:{group:'standard-personal',access:{type:'api-key',apiKey:'fixture-not-a-key'},api:{type:'openai-chat-completions',baseUrl:`http://127.0.0.1:${address.port}/v1`},personalModelIds:['glm-5.3-flash']}}]},modelConfigRules:{providerModelRules:[],manualProviderModelRules:[]},defaultModelSelection:{providerId:'fixture',modelId:'glm-5.3-flash',options:{reasoningLevel:'low'}}}}),{mode:0o600});
 const cli=join(profile,'.zcode/cli');mkdirSync(cli,{recursive:true});writeFileSync(join(cli,'config.json'),JSON.stringify({features:{mcp:true,subagent:false,memory:false},plugins:{enabled:false},hooks:{enabled:false},memory:{use:false}}));
 return {requests,release:()=>release?.(),close:async()=>{release?.();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}};
}
