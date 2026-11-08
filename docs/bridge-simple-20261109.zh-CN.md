# Byte Bridge 简化方案：从“配一堆东西”到 `say 一句话`

> 日期：2026-11-09（北京时间）
> 目标读者：维护 `packages/byte-bridge` 与 `skills/byte-bridge` 的开发者
> 状态：**方案稿，待确认后实施**。本文不含已实施改动。

## 1. 背景与目标

当前 Bridge 能可靠完成跨会话协作，但入口过重：一个“帮我发句话”的需求，要走
`setup → 起 1 小时服务 → 显式登记 sessions → 双方 connect → context → delegate → return`。

目标形态（用户视角）：

```bash
byte-bridge say "查询模型身份" "打开实验平台" --wait   # 发一句，等结果
byte-bridge ls                                    # 看有哪些对话可投递
byte-bridge tail "查询模型身份" 3                   # 看最近回复
```

硬性要求：
- 零配置：新机器装完即可用，不需要手填 session id / 不需要 connect 握手（来源侧）；
- 跨 harness：Codex、DSH、ZCode、Hermes 都要能作为目标；
- 常驻后台小服务：可接受，但用户不需要手动管理它的生命周期；
- 保留进阶能力：任务契约、监督、结果回收仍要可用，只是不在必经路径上。

非目标：
- 不删除“来源侧原生身份证明”（防冒名）与“投递对账”（防重复执行）；
- 不改变现有 wire format 与数据库 schema 的兼容性（只做加法 + 迁移）。

## 2. 现状证据（问题定位到代码）

| 问题 | 证据 |
| --- | --- |
| 必须显式登记会话，否则报未连接 | `src/adapters/dsh/extension.ts:31-32`：`if(!Array.isArray(config.sessions) ...) throw new Error('Configure unique original DSH sessions explicitly')`；`selected` 只认列表里的 id |
| 安装默认写空清单，装了也不生效 | `src/install/plan.ts` 生成的 `cordis.patch.yml` 为 `sessions: []` |
| 服务默认 1 小时过期 | `src/cli/setup.ts:18,22` + `src/cli/command-contracts.ts:29`（示例 `lifetime_seconds:3600`）；`ensureService(root, lifetime)` |
| 命令面过宽 | `src/cli/` 20+ 个命令文件，`src/cli/main.ts` 帮助文本约 20 行 |
| 契约字段过重 | `src/protocol/command-inputs.ts` 中 delegate 需要 acceptance/read_paths/write_paths/deadline_at |
| 4 个 skill 入口 | `byte-bridge`、`sessionbridge-do`、`session-bridge-delegate/return/supervise`（安装后位于 `~/.agents/skills`） |

同时确认“轻量投递”本身已存在：
- Codex：`src/adapters/codex/adapter.ts:81` 直接 `thread/queue/add`（**目标端不需要握手**）；
- DSH：`src/adapters/dsh/native.ts` 的 `enqueueOnOriginalAgent`（需要插件在 DSH 进程内运行）。

## 3. 设计原则

把现有能力拆成四层，只有第 1、2 层在 `say` 路径上：

| 层 | 作用 | 是否必经 |
| --- | --- | --- |
| L1 Quick Channel | 本地“用户身份”发送：解析目标 → 投递 → 可选等待 | **必经** |
| L2 Binding Discovery | 自动发现/绑定目标会话（不再手填清单） | **必经（自动）** |
| L3 Hub Service | 常驻单例服务：路由、去重、审计、长任务状态 | 必经（自动起） |
| L4 Task Protocol | delegate/supervise/return/roles/验收 | 仅进阶命令 |

关键判断：**目标端是接收方，不需要握手**。协议真正要防的是“来源冒充”，因此来源侧的原生证明保留；目标侧改为自动发现即可。

## 4. 目标接口

### 4.1 CLI

```
byte-bridge say <target> <message...> [--wait[=SEC]] [--json] [--dry-run]
byte-bridge ls [--all] [--json] [query]
byte-bridge tail <target> [N]
byte-bridge stop                      # 停常驻 Hub（可选）
byte-bridge delegate ...              # 进阶：原 delegate 语义，保留
```

- `<target>`：会话名（精确）、id/UUID 前缀、或 `harness:name` 限定；
- `--wait`：默认 120 秒，等到目标产出新回复即返回；
- 未命中：返回候选列表（不超过 5 条），不猜“最近会话”。

### 4.2 `ls` 输出

```
HARNESS  TARGET                      UPDATED   CWD
codex    查询模型身份 (01a0c01a)      04:21     ~/code/grad-pert
dsh      总负责人 (session-b0aa12)    02:10     ~
zcode    (未接入原生插件)              —
```

### 4.3 内部请求（L1）

```json
{
  "operation": "say",
  "message_id": "uuid",
  "target": {"query": "查询模型身份"},
  "text": "打开实验平台",
  "wait": {"timeout_ms": 120000}
}
```

响应：`{state:"delivered"|"accepted"|"completed"|"failed", delivery_id, reply?}`

## 5. 目标发现与投递矩阵

| Harness | 发现来源（只读） | 投递通道 | 前置依赖 | 落点文件 |
| --- | --- | --- | --- | --- |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` 首行 meta；app-server `thread/*` | `thread/queue/add` | Codex Desktop app-server 在跑 | `adapters/codex/adapter.ts` |
| DSH | 插件 `ctx.agents`；`~/.dsh/sessions/*` 索引 | `enqueueOnOriginalAgent`（插件注入） | DSH 桌面/Web profile + 插件 auto 绑定 | `adapters/dsh/native.ts` |
| ZCode | 原生 DB `session` 表（只读） | attached-MCP 注入 | ZCode 原生插件/Compat | `adapters/zcode/{intake,attached-mcp}.ts` |
| Hermes | 插件绑定目录 | plugin-client `plugin_deliver` | Hermes 原生插件 | `adapters/hermes/adapter.ts` |
| Pi/Claude/Kimi/OpenCode | 现有 lifecycle/inbox/ACP | 保持现状 | — | 现有 adapter |

未接入的 harness 在 `ls` 里显式标注“未接入原生插件”，不静默失败。

## 6. 自动绑定（去掉 sessions 清单）

### 6.1 DSH

`src/adapters/dsh/extension.ts` 增加 `sessions: 'auto'` 分支：

```ts
type DshPluginConfig = { sessions: readonly DshSessionConfig[] | 'auto'; root?: string };
```

- 判定谓词：`agent.session.header.cwd` 位于配置的 `root`（默认项目根）下，且 `ctx.remoteAccess.allows`；
- `ctx.on('agent/created')` 自动 `connect`，`agent/disposed` 自动断开（现有钩子已具备）；
- 显式清单模式保留，两者共存；`sessions:'auto'` 时不再抛“Configure unique original DSH sessions explicitly”；
- 安装器 `src/install/plan.ts` 生成 `sessions: auto`（DSH 重启后生效）。

### 6.2 Codex

无需 enroll：由 L3 Hub 维护 thread 索引（rollout meta + 可选 app-server 查询），投递时按 id 直接 `thread/queue/add`。

### 6.3 ZCode / Hermes

由各自原生插件启动时上报绑定（已有 binding 机制）；Hub 增加“绑定目录扫描”，把已上报会话直接列进 `ls`。缺失插件时给出安装指引，不自动降级到 CUA/剪贴板。

## 7. 常驻 Hub

- 单实例：`~/.sessionbridge/hub.sock`（0600，pid+nonce 校验，非本用户拒绝）；
- 首次 `say`/`setup` 自动 `ensure`；空闲 30 分钟可选退出（`--idle-exit` 配置）；
- 默认 `lifetime_seconds=0`（不过期）；保留 `service stop`；
- 兼容迁移：发现旧 per-project `.session-bridge/service.json` 时，读取并合并路由，不要求用户重配；
- 审计日志：`~/.sessionbridge/audit.jsonl`（谁、发给谁、message_id、结果），不含正文（默认），可 `--audit-text` 开启。

## 8. CLI 收敛

- 对外文档只暴露：`say / ls / tail / stop`（+ `--help` 三段式：快速、进阶、诊断）；
- 现有命令全部保留（不破坏脚本），但在帮助中折叠到“进阶”；
- `setup` 保留为“显式初始化”（跨机器/白名单场景），不再是使用前提；
- 新增文件：`src/cli/say.ts`、`src/cli/ls.ts`、`src/cli/tail.ts`；`main.ts` 路由与帮助重写。

## 9. Skill 合并

| 新结构 | 内容 |
| --- | --- |
| `skills/byte-bridge/SKILL.md` | 唯一入口：快速模式（say）→ 进阶（delegate/supervise/return）→ 排障 |
| `skills/byte-bridge/references/quick.md` | 目标命名、`--wait`、常见错误 |
| `skills/byte-bridge/references/advanced.md` | 契约字段、角色、监督、回执 |
| `skills/sessionbridge-do`、`skills/session-bridge-*` | 降级为薄壳：首句“已并入 byte-bridge”，转发命令 |

安装脚本同步：`install.sh` 与 `packages/byte-bridge/skills` 保持单一来源（构建时复制，禁止两处手改）。
实施前先做备份：`tar czf ~/backup-skills-$(date +%s).tgz ~/.agents/skills/{byte-bridge,sessionbridge-do,session-bridge-*}`。

## 10. 迁移与兼容

1. 旧 DB（`bridge.sqlite`）schema 不变；新增 `hub` 元数据表可空；
2. 旧 `dsh-sessions.json` 仍被读取（显式模式），优先于 auto；
3. 旧命令 `delegate/return/...` 行为不变，仅帮助文本调整；
4. `session-bridge` 可执行名保留，`byte-bridge` 作为首选别名（已存在）。

## 11. 分阶段实施

| 阶段 | 内容 | 产出 | 验收 | 预估 |
| --- | --- | --- | --- | --- |
| P0 | 建分支 `feat/bridge-simple`；`npm ci && npm run build && npm run test:unit` 基线；记录 CLI 行为快照 | 基线报告 | 全绿 | 0.5d |
| P1 | L1+L3：Hub 单例 + `say/ls/tail`（先打通 Codex 目标） | 新 CLI 可用 | `say codex-target "你好" --wait` 往返成功；`tests/unit/say.test.ts` | 1d |
| P2 | DSH `sessions:'auto'` + 安装器改造；DSH 重启后自动可见 | 插件 auto 模式 | 本会话在 `ls` 出现；`say dsh-target` 往返成功 | 1.5d |
| P3 | ZCode / Hermes 绑定上报与发现；未接入时 `ls` 明示 | 覆盖 4 个 harness | 矩阵脚本逐项通过 | 1.5d |
| P4 | CLI/帮助收敛 + skill 合并 + 文档（README.zh-CN、docs/cli.zh-CN、dsh.md） | 新文档 | 按文档从零操作可跑通 | 1d |
| P5 | 回归 + 发布：`npm run test`、矩阵集成测试、changelog | 可发布 tag | CI 绿；旧命令兼容测试通过 | 1d |

总计约 6.5 人日；P1 结束后即可日常使用。

## 12. 测试策略

- 单元：目标解析（名称/前缀/歧义）、`--wait` 完成判定、审计不落正文；
- 集成：`tests/integration/matrix`，对每个 harness 用隔离 profile 跑一次 say 往返；
- 兼容：旧 `delegate → return` 用例保持通过；
- 安全：socket 权限、pid 复用、nonce 校验、非本用户拒绝；
- 手工：新机器（干净 home）从 `install` 到 `say` 的无配置路径。

## 13. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| DSH 插件改动需重启才生效 | 保留显式模式；先 `--dry-run`；文档写明重启步骤 |
| 常驻服务与旧 1h 服务并存 | socket 版本化；旧路径只读兼容；`stop` 精确按 pid 停止 |
| 自动绑定扩大攻击面 | 默认绑定“本机、本用户、已打开会话”；保留 `--allow-targets` 白名单；审计日志 |
| 命令面改动影响脚本 | 旧命令不删除；帮助分层；语义不变 |
| 仓库 main 有未提交改动 | 全程在新分支，仅动本方案涉及文件，结束前 `git diff --stat` 复核 |

## 14. 待确认

1. Hub 单例（建议）还是每项目一个？（单例能彻底去掉“项目”概念）
2. `--wait` 默认超时：建议 120s，可配；
3. 目标名解析规则：名称精确匹配；重名返回候选（≤5），不自动选；
4. 审计是否默认记录正文（建议否）；
5. 是否需要在 P4 同步更新 `apps/byte-workbench` 的 Bridge 面板（若已消费旧命令）；
6. 发布方式：直接 main 合并，还是 PR + tag。

## 15. 立即可做的“今天版本”

在 P1 完成前，可用等价的临时脚本（当前只有 Codex 目标）：

```bash
sb ls
sb say <thread-id|名称> "任务" --wait
sb tail <thread-id> 3
```

该脚本（`~/.local/bin/sb`）仅作过渡：P1 合入后删除，或作为 `say` 的行为参考测试夹具。
