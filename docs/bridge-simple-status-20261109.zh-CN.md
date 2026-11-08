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