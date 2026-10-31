import { BridgeError } from '../protocol/errors.js';
const supported=['codex','claude','pi','hermes','dsh','zcode','kimi','opencode'];
export function connectionInstructions(harness:string):{harness:string;state:'needs_setup';steps:string[]}{
 if(!supported.includes(harness))throw new BridgeError('unsupported_harness','No verified connector is available for this harness','Choose codex, claude, pi, hermes, dsh, zcode, kimi or opencode',3);
 if(harness==='kimi' || harness==='opencode')return {harness,state:'needs_setup',steps:[`独立 managed ACP：host --harness ${harness} --project PATH --stdin；先 describe --query cli.host.${harness} 核对配置。`,'每个进程只允许一条原生会话；使用独立 profile，不 load/resume 正在运行的 TUI。',harness==='opencode'?'原会话需先加载项目 .opencode/plugins/sessionbridge.js；原生工具 sessionbridge_request 使用 {method,params}，主动收件用 sessionbridge_wait。':'现有 Kimi TUI 接入暂不支持；不得改用最近历史冒充。']};
 if(harness==='zcode')return {harness,state:'needs_setup',steps:['已打开原会话：在所选项目启用 .session-bridge-plugins/zcode 原生插件，再由原会话调用 sessionbridge_attach。','每次原生工具首次返回 challenge，保持原参数并加入 challenge 重试；不填写来源会话 ID。','attached/native_tool_pull 需要原会话主动 sessionbridge_wait；不承诺空闲自动唤醒。原应用权限保留。','另一种 managed 模式：host --harness zcode --project PATH --stdin，明确独立 profile、别名与权限；不接管桌面。']};
 return {harness,state:'needs_setup',steps:['在目标原会话中启用 SessionBridge 插件/Skill。','通过该宿主的 connect 命令验证原生身份，选择项目和别名。','完成绑定后运行 session-bridge context --json 核对当前会话；不要选择最近历史代替。']};
}
