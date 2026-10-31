import {realpathSync} from 'node:fs';
import {setupInputSchema} from '../protocol/command-inputs.js';
export {setupInputSchema} from '../protocol/command-inputs.js';
import {HARNESSES,planInstall} from '../install/plan.js';
import {applyInstall} from '../install/apply.js';
import {initProject} from './init.js';
import {ensureService} from './service.js';
import {connectCodex} from '../adapters/codex/connect.js';
import {openStore} from '../core/database.js';
import {BindingService} from '../core/bindings.js';
import {BridgeError} from '../protocol/errors.js';
export async function setupProject(root:string,options:{harness:string;withHarnesses:string[];dryRun:boolean;input:unknown}){
 const input=setupInputSchema.safeParse(options.input);if(!input.success)throw new BridgeError('invalid_setup_config','初始化配置不正确','仅支持 lifetime_seconds=1..86400；不会根据文本中的 actor 连接会话',4);
 const targets=[...new Set([options.harness,...options.withHarnesses])];if(targets.some(h=>!HARNESSES.includes(h as typeof HARNESSES[number])))throw new BridgeError('unsupported_harness','请选择支持的应用','使用 --harness codex --with zcode',4);
 root=realpathSync(root);const harnesses=Object.fromEntries(targets.map(h=>[h,{attached:h==='kimi'?'unsupported':(['zcode','opencode'].includes(h)?'requires_native_plugin':'native_connection_required'),managed:['zcode','kimi','opencode'].includes(h),activation:'explicit',next_step:h==='zcode'?'在原会话启用插件后连接；专用 App Server 是另一种模式':'在原应用选定会话执行 connect 或原生插件连接'}]));
 if(options.dryRun)return {state:'planned',project:root,harnesses,lifetime_seconds:input.data.lifetime_seconds,models_started:0};
 // Check every integration before any initialization/install mutation.
 const plans=await Promise.all(targets.map(harness=>planInstall({harness,scope:'project',targetRoot:root})));const conflicts=plans.flatMap(p=>p.conflicts);if(conflicts.length)throw new BridgeError('setup_conflict','安装文件存在用户修改','保留文件，使用 install --dry-run 核对冲突：'+conflicts.join(', '),4);
 const project=await initProject(root,{dryRun:false}),installations=[];for(const prior of plans){const fresh=await planInstall({harness:prior.harness,scope:'project',targetRoot:root});if(fresh.conflicts.length)throw new BridgeError('setup_conflict','安装文件在准备期间改变','保留用户修改并重新检查安装计划',4);installations.push(await applyInstall(fresh));}
 const service=await ensureService(root,input.data.lifetime_seconds);let connection:Record<string,unknown>={state:'needs_connection',steps:['在目标原会话运行 connect；不会选择最近会话或启动替代聊天']};
 if(options.harness==='codex')try{connection=await connectCodex(root,'codex-main');}catch(error){connection={state:'needs_connection',code:error instanceof BridgeError?error.code:'source_unavailable',recovery:error instanceof BridgeError?error.recovery:'从原会话重新连接'};}
 const store=openStore(root);let connected:string[];try{connected=(await new BindingService(store).resolve({query:''})).map(b=>b.identity.harness);}finally{store.close();}
 const targets_ready=Object.fromEntries(targets.map(h=>[h,connected.includes(h)]));
 return {state:connection.state==='connected'?(Object.values(targets_ready).every(Boolean)?'ready':'needs_activation'):'needs_connection',targets_ready,project_id:project.project_id,project:root,service,connection,harnesses,installations:installations.map(r=>({harness:r.plan.harness,state:r.state,enabled:r.enabled,receipt_file:r.receipt_file})),models_started:0};
}
