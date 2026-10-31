import { BridgeError } from '../protocol/errors.js';
export function checkRuntime(version) { const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version); if (!match || Number(match[1]) !== 24 || Number(match[2]) < 15)
    throw new BridgeError('node_version_unsupported', '会桥需要 Node.js 24.15.0 或更新的 24.x 版本', '安装受支持的 Node 24，然后重新运行；doctor 不会自动更新 Agent', 3); }
export function skillCommand(harness) { const commands = { codex: '$sessionbridge-do', claude: '/sessionbridge-do', pi: '/skill:sessionbridge-do', hermes: '/sessionbridge-do', dsh: '使用 sessionbridge-do：你的协作要求', zcode: '/skill sessionbridge-do 你的协作要求', kimi: '使用 sessionbridge-do；显式指定 --skills-dir', opencode: '使用 sessionbridge-do' }; if (!commands[harness])
    throw new BridgeError('unsupported_harness', '未知应用', '选择 codex、claude、pi、hermes、dsh、zcode、kimi 或 opencode', 3); return commands[harness]; }
//# sourceMappingURL=runtime.js.map