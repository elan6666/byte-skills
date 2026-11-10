# Bridge 简化实施记录与真实测试矩阵

> 日期：2026-11-09（北京时间）
> 对应方案：docs/bridge-simple-20261109.zh-CN.md
> 状态：P1 完成（Codex 通道），P2 源码完成（待 DSH 重启），P3/P4 部分完成

## 一、已完成改动

| 文件 | 内容 |
| --- | --- |
| `src/core/hub.ts` | 新增：单机 hub 根 `~/.byte-bridge`（`BYTE_BRIDGE_HOME` 覆盖），首次使用自动初始化 |
| `src/core/router.ts` | 删除 `project_id` 路由边界，仅保留 `host_id`（跨机器仍阻断） |
| `src/core/database.ts` | 新增迁移 9：`hub_messages` 投递日志表 |
| `src/cli/quick.ts` | 新增 `say / ls / tail / stop` 四个快速命令 |
| `src/cli/main.ts` | 帮助分层（快速模式在前）；新增命令路由 |
| `src/protocol/command-inputs.ts` | `setup.lifetime_seconds` 允许 0（0 = 常驻） |
| `src/cli/service-worker.ts` | lifetime=0 不设过期定时器，`expires_at` 置 9999 年 |
| `src/adapters/dsh/extension.ts` | 支持 `sessions: 'auto'`：按 root 自动绑定所有原生会话，无需清单 |
| `plugins/dsh/cordis.patch.yml` | 安装默认写 `sessions: auto` |
| `plugins/dsh/index.mjs` | auto 模式下 root 指向 hub |
| `tests/unit/hub.test.ts` | 新增 3 个用例：hub 根、跨项目放行、跨机器阻断 |
| skills（仓库 + 已安装） | `byte-bridge` 前置“快速模式”；`sessionbridge-do` 与 3 个 `session-bridge-*` 降级为兼容入口 |

构建：`npm run build` 通过；单元测试 `npm run test:unit`：**24 pass / 0 fail**（含新增 3 条）。

## 二、真实测试矩阵（本机实测）

执行命令（`packages/byte-bridge` 下）：

```bash
node dist/src/cli/main.js ls
node dist/src/cli/main.js tail 01a1b391 2
node dist/src/cli/main.js say <目标> "消息" --wait=90
node dist/src/cli/main.js preflight --harness <h> --project "$HOME/.byte-bridge" --json
```

| Harness | 真实投递 | 结果 | 证据 |
| --- | --- | --- | --- |
| Codex | ✅ 成功 | 投递成功；执行取决于目标对话是否活跃 | 消息 `01a1bcdf-e290…` 写入 `~/.codex/queue_1.sqlite`；历史成功案例：`01a1bcc8-6f3b…` 触发 `turn_trigger:"queue"`，目标回复「已打开实验平台，服务运行正常」 |
| DSH | ⏸ 源码就绪，待重启 | 插件 auto 模式已实现但需 DSH 重载 | `preflight --harness dsh` → `context_missing`；插件配置文件仍是旧 `sessions: []` 生效中 |
| Claude Code | ❌ 未连接 | 需要把插件加载进某个 Claude CLI 会话 | `claude 2.1.306` 已安装；preflight → `needs_service`/`context_missing`，路线 `native_plugin_inbox` |
| Hermes | ❌ 未连接 | 需要在 Hermes 配置里启用插件并使用受支持的 gateway TUI | Hermes.app 与 CLI 均在运行；preflight 路线 `canonical_gateway_tui` |
| ZCode | ❌ 未连接 | 需要项目内插件 + `sessionbridge_attach` | ZCode 3.17.2 运行中；preflight 路线 `native_tool_pick`/`app_server` |

### Codex 细节（唯一可完整验证的通道）

1. 投递层确实可用：`say` 调用原生 `thread/queue/add` 后返回 `message_id` 与 `thread_id`；
2. 队列项在 `~/.codex/queue_1.sqlite` 可查，pending=1；
3. 目标对话**活跃时**会被消费并执行（有历史证据）；**未加载/忙碌时**消息滞留队列，这与 Codex 官方限制一致（`unloaded or archived chats have no guaranteed wake`），因此 `--wait` 超时属于真实行为，不是程序错误。

## 二·补 插件安装（已完成，待应用侧加载）

四个 harness 的原生插件已装进 hub 项目 `~/.byte-bridge`（回执可查）：

| Harness | 安装状态 | 回执 |
| --- | --- | --- |
| claude | installed / enabled:false | `.session-bridge-install/0e71a6c5-…/receipt.json` |
| hermes | installed / enabled:false | `.session-bridge-install/5469d77e-…/receipt.json` |
| zcode | installed / enabled:false | `.session-bridge-install/43240f77-…/receipt.json` |
| dsh | installed / enabled:false | `.session-bridge-install/dfdc619d-…/receipt.json` |

`enabled:false` 表示文件已就位，但必须由各应用加载一次（这是 bridge 的“原生身份证明”设计，CLI 不能代替）。

## 三、尚未完成的 P3/P4

1. `say` 目前只实现了 **Codex 目标**；DSH/ZCode/Hermes 目标需要各自原生插件完成绑定后，走 hub 路由（P3）。
2. DSH 自动绑定需重启 DSH 桌面应用后才能实测（P2 验收）。
3. README / docs/cli 的对外文档仍以旧命令为主，需在 P4 统一改写。
4. Claude/Hermes/ZCode 的真实往返测试需要先完成一次“原生插件加载”，这属于应用侧操作，不能由 CLI 代做。

## 四、下一步（按顺序）

```bash
# 1) 重启 DSH 桌面应用，使其加载 sessions: auto 的新插件
# 2) 在 Claude Code 会话中加载 bridge 插件（native_plugin_inbox 路线）
# 3) 在 Hermes 配置中启用插件并使用 canonical gateway TUI
# 4) 在 ZCode 项目里启用插件后执行 sessionbridge_attach
# 5) 重新运行：
node dist/src/cli/main.js ls
node dist/src/cli/main.js say <各 harness 目标> "测试" --wait=120
```

## 真实案例 1：DSH ↔ Codex 完整往返（2026-11-09 14:00，已通过）

1. **用 Computer Use 在 Codex 桌面新建测试会话**：点击「新聊天」，发送指令让它执行连接脚本；会话 id `01a1bedf-abf9-72f2-be7f-65773cb2fa83`。
2. **Codex 会话内 connect 成功**：`{"state":"connected","binding_id":"e4ae9a1d-…","alias":"codex-main"}`，hub 中出现第二个 binding。
3. **DSH 会话作为 source 发起 delegate**（ticket `61c3fc21-156c-4962-bd0f-01b3f17caf77`）：目标 `codex-main`，goal 要求回复 `DSH-TO-CODEX-OK`。
4. **投递回执**：`transport_confirmed`，`native_receipt=01a1bee3-886d-7230-9f98-746fd1eba3c3`（Codex 原生队列）。
5. **Codex 执行并回复**：`DSH-TO-CODEX-OK`，同时通过 Bridge 回传结果。
6. **结果回收**：`state=result_reported`，summary `DSH-TO-CODEX-OK`；return `return_delivered`，native receipt `dsh-native-inbox:00aaff36-…` 送达 DSH 收件箱。
7. **截图证据**：docs/assets/bridge-dsh-to-codex-20261109.webp

配套改动：`src/adapters/codex/connect.ts` 允许把会话连接进 cwd 之外的 hub store（单机 hub 需要），原生 owner/thread 证明保留。

## 真实案例 2：Codex → Hermes 完整往返（2026-11-09 14:53，已通过）

1. Hermes 插件启用：`hermes plugins enable sessionbridge`（此前只是安装、未启用，所以 `/sessionbridge-connect` 在输入框无匹配）。
2. 修复与 Hermes 22.0.3 的兼容问题：`LiveSession` 没有 `superseded` 属性，改为 `getattr(live,'superseded',False)`（仓库源文件与已安装插件同步修复）。
3. 授权网关注入：`~/.hermes/config.yaml` → `plugins.entries.sessionbridge.allow_gateway_injection: true`，否则 connect 返回“原生插件消息注入未获许可”。
4. Hermes 会话工作目录为 `/Users/elan`，在该目录 `session-bridge init` 并启动常驻 hub 服务（pid 82180，不过期）。
5. Hermes 内执行 `/sessionbridge-connect` → 绑定 `hermes-desktop`（`agent:main:local:dm:local-76e2…`）。
6. Codex 会话在同一项目 connect 为 `codex-main2`（`project_id=b517d2e3-…`）。
7. Codex 通过桥 `delegate` → task `cf9ce064-…`；Hermes 会话**实际收到注入消息**并回复 **`CODEX-TO-HERMES-OK`**。
8. 截图证据：docs/assets/bridge-codex-to-hermes-20261109.webp

说明：deliveries 记录为 `uncertain`（Hermes 推注入不回 ack），但 Hermes 会话中可见外部 Agent 数据消息并已按任务回复，属于“投递已达成、回执缺失”，需按 Bridge 规则对账，不重发。

## 其余两个 harness 的阻塞（截至本轮）

| Harness | 状态 | 具体阻塞 |
| --- | --- | --- |
| ZCode | 未完成 | `zcode` CLI 报 “无法定位 CLI ZCode Built-in Provider Config”（`/Applications/ZCode.app/...` 与 `/config/provider/zcode-builtin.json`）；managed host 同样 warmup 失败；attached 需要 ZCode 项目加载 MCP 插件（配置已写入 `/Users/elan/.zcode/config.json`，但 CLI 环境先失败） |
| Claude Code | 未完成 | 原生 hook 要求 `owner`（可执行文件为 claude 的父进程）与 `startup_token`；从普通 shell/DSH 启动的 `claude` 父进程是 node，无法满足 owner 证明；`host --harness claude` 明确不支持 → 需要代码层新增 Claude 托管通道 |

## 2026-11-09 15:55 追加：ZCode 修复与 Claude owner 修复

### ZCode（CLI 已修好，接入仍差一步）
- 根因：`zcode` CLI（0.17.1，App 内 `Resources/glm/zcode.cjs`）只认 `Resources/glm/provider/zcode-builtin.json`，而 App 3.17.2 实际提供 `Resources/config/provider/zcode-builtin.json`。
- 修复：创建兼容软链 `Resources/glm/provider/zcode-builtin.json -> ../../config/provider/zcode-builtin.json`。
- 401 修复：`zcode login bigmodel`（浏览器会话已授权，自动完成，凭据写入 `~/.zcode/v2/credentials.json`）；此后 `zcode -p` 可正常返回。
- 仍未完成：managed host 仍 `zcode_warmup_failed`；attached 路线 `zcode -p` 会话中未出现 `sessionbridge_*` 工具（插件目录已安装并写入 `.zcode/config.json`，但 CLI 会话未加载）。

### Claude Code（owner 检测已修，仍差登录/子会话就绪）
- 修复：`src/adapters/claude/hook.ts` 的 `nativeOwner()` 增加 node 启动 claude 的父进程识别（按命令行找 claude 入口，不再只认 comm 为 claude）。
- 现状：hook 可执行并进入 `native_child_not_ready` 分支；Claude 会话报 `Not logged in · Please run /login`，子 helper 未在 5s 内登记绑定。
- 待办：Claude 登录态恢复 + 子 helper 就绪诊断（或改为托管通道）。

## 2026-11-09 20:50 追加：Claude Code 改用 GLM API

- 按用户要求，Claude Code 不再依赖 Anthropic 登录，改走 GLM Coding Plan 的 Anthropic 兼容端点。
- 配置写入 `/Users/elan/.claude/settings.json`（0600，密钥仅本地，不入库）：
  - `ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic`
  - `ANTHROPIC_AUTH_TOKEN=…`（来自 `~/.config/glm/api.key`）
  - `ANTHROPIC_MODEL=glm-5.3-flash`
- 验证：`claude -p "只回复 ok" --brief` → 返回 **ok**（此前是 `Not logged in`）。
- 桥接仍差最后一步：hook 能执行并进入 `native_child_not_ready`（SessionStart 子 helper 未在 UserPromptSubmit 的 5 秒内登记绑定），需继续修 Claude child 初始化；与模型认证无关。

## 2026-11-10 11:40 追加：Claude 真实往返打通；ZCode 项目已打开

### Claude Code（完成，真实往返）
修复链：
1. `nativeOwner()` 支持 node 启动的 claude：按父进程命令行 + PATH 解析出 claude 入口（此前 comm=node 直接抛错）。
2. `child-helper` 等待 transcript 的时间从 5s 提升到 60s（SessionStart 时 transcript 尚未创建）。
3. Claude 设置 `crossSessionInbound: "accept"`（默认按权限模式“拒绝/挂起”对端消息；无 mode 声明时 `no-mode-asserted` 挂起）。
4. Claude 走 GLM API（`~/.claude/settings.json` env，密钥不入库）。

实测：Codex 会话 → `delegate` → task `e33d0c4c-…` → Claude 会话通过 messaging socket 收到消息并回复 **`CODEX-TO-CLAUDE-OK`**（claude-out4.log 中 `"result":"CODEX-TO-CLAUDE-OK"`）。

### ZCode（CLI 修复 + 桌面项目已打开，MCP 工具仍差一步）
- 已创建测试项目 `/Users/elan/zcode-bridge-test`（bridge init + zcode 插件安装 + `.zcode/config.json`）。
- 通过 ZCode 桌面 “打开文件夹” 已成功打开 `/Users/elan` 项目（workspace = elan）。
- ZCode Agent 能加载 bridge 的 **skills**，但 `sessionbridge_attach/wait` 仍不在工具列表；应用对项目级 MCP 插件的加载需要重启 ZCode 或额外的插件注册步骤。
- CLI 侧：`zcode -p` 已可用（provider 软链 + login 修复）。

## 2026-11-10 11:55 追加：ZCode 插件清单修复

- 发现仓库 `plugins/zcode` 缺少 `.zcode-plugin/plugin.json`（MCP 服务器清单），这解释了为什么 ZCode 只能加载 skills、看不到 `sessionbridge_attach/wait` 工具。
- 已补回清单（内容取自历史可用项目）：
  ```json
  {"name":"sessionbridge","version":"0.1.0","mcpServers":{"sessionbridge":{"command":"node","args":["${ZCODE_PLUGIN_ROOT}/scripts/mcp.mjs"],"env":{"SESSIONBRIDGE_PROJECT":"${ZCODE_PROJECT_DIR}"}}}}
  ```
- 已同步到已安装目录，并在 ZCode 中新建专用项目 `zcode-bridge-test`（含 bridge init + 插件 + `.zcode/config.json`）。
- 结果：ZCode 会话仍只能看到 skills，MCP 工具未注入——需要重启 ZCode 应用（或其插件热加载入口）才能让项目 MCP 生效；当前 ZCode 里有一个正在等待确认的交易任务，未擅自重启。
