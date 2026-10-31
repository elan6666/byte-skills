# 命令参考

[English](cli.md) · [简体中文](cli.zh-CN.md) · [返回首页](../README.zh-CN.md)

始终用 `--project /项目绝对路径` 选择正确项目，使用原聊天自己的连接文件。完整命令列表可运行 `session-bridge --help` 查看。

## 命令速查

| 命令 | 用途 |
| --- | --- |
| `setup --harness codex --with zcode --project PATH` | 初始化、安装文件、启动有界服务并连接原主；目标仍需原生激活。 |
| `service status / stop --project PATH` | 检查响应与进程身份／关闭身份已核对的自有服务。 |
| `init --project PATH` | 初始化选定项目。 |
| `connect --harness codex --alias NAME --project PATH` | 从原 Codex 聊天登记；其他应用使用各自原生接入入口。 |
| `context --json` | 获取已认证的来源上下文和请求编号。 |
| `sessions --query NAME --json` | 按别名查找已连接会话。 |
| `wizard` | 在交互终端选择主／监督角色，不派发任务。 |
| `byte-source --stdin --json` | 显式固定 Byte 源码与 Python；升级需旧 pin SHA。 |
| `byte-doctor --json` | 只读核对固定源和结构；不证明 armed。 |
| `byte-import --stdin --json` | 运输引擎已提交的原生 handoff；不改 Byte owner。 |
| `request --stdin --json` | 提交结构化操作。 |
| `describe --query request.delegate --json` | 只读获取实际参数 schema 和结构示例，不需要服务或会话连接；省略 query 列出全部。 |
| `status --task TASK_ID` | 查询任务；省略 `--task` 则列出当前会话可见的任务与角色。 |
| `report --stdin` | 提交实际摘要和文件路径。 |
| `return --stdin` | 准备向原主会话回报，或对账已有回报。 |
| `supervise --stdin` | 为一个真实运行登记检查。 |
| `recover --stdin` | 核对原消息的投递情况。 |
| `cancel --stdin` | 取消未来操作或监督。 |
| `daemon start --project PATH` | 启动项目本地服务，Ctrl-C 关闭。 |
| `doctor --project PATH` | 诊断接入，不重启应用。 |
| `host --harness zcode --project PATH --stdin` | 使用显式 profile、alias、permission_mode 和有限 lifetime_seconds 启动专用原生执行者；见 [配置](zcode.zh-CN.md)。 |
| `host --harness kimi\|opencode --project PATH --stdin` | 独立原生 ACP 宿主，每进程一会话；显式 binary、expected_version、profile 与截止时间。见 [指南](acp.zh-CN.md)。 |

下文示例默认已选择项目；需要时为每个命令加 `--project PATH`。`PATH`、`NAME`、`TASK_ID` 表示要替换的实际值。

## 结构化请求

写操作通过标准输入接收一个 JSON 对象，最大 64 KiB。用户原文作为数据传入，不能拼接成 shell 命令。

1. 在原来的已连接会话中运行 `session-bridge context --json`。
2. 使用 `sessions` 获取目标别名。
3. 将 context 返回的真实 `request_id` 写入私密请求文件。
4. 使用固定输入重定向提交：

```bash
session-bridge request --project /absolute/path/to/project --stdin --json < roles.json
```

`roles.json` 的结构如下：

```json
{
  "operation": "assign_roles",
  "request_id": "替换为-context-返回的编号",
  "main": "current",
  "supervisor": { "query": "supervisor" }
}
```

这个操作只记录角色，不派任务、不设置监督周期。超时后保留实际请求编号和原始内容，用于对账。

| operation | 必要业务字段 |
| --- | --- |
| `assign_roles` | `main`、`supervisor` |
| `delegate` | `target`、`goal`、`acceptance`、`read_paths`、`write_paths`、`deadline_at` |
| `supervise` | `task_id`、准确的 `run` 身份、`supervisor`、`interval_seconds`、`deadline_at`、`repair_paths` |
| `recover` | 原 `message_id` |
| `return` | `task_id` |
| `cancel_pending` | `task_id`，以及可选的 `stop_supervision` |

精确字段及目标选择结构通过 `session-bridge describe --query request --json` 查询，完整示例见[自动生成的命令参考](../skills/sessionbridge-do/references/commands.generated.md)。每次使用实际 context 的编号和任务截止时间；示例只验证结构，不表示授权或已执行。

## 报告、运行与核验

| 入口 | JSON 字段 |
| --- | --- |
| `report --stdin` | `task_id`、`summary`、`artifact_paths` |
| `return --stdin` | `task_id`、`request_id` |
| `run --stdin` | `argv`、`source_commit`、`config_sha256`；可选 `config_file`、`artifacts`、`run_id` |
| `supervise --stdin`，使用已保存的运行文件 | `request_id`、`task_id`、`run_file`、`supervisor_query`、`interval_seconds`、`deadline_at`、`repair_paths` |
| `acknowledge --stdin` | `task_id`、`action`；其余字段随 `receive`、`plan_next`、`verify` 或 `continue` 变化 |
| `action --action-id ID --stdin` | `task_id`、`purpose`、`argv`、`artifact_paths`；续接还需要 `next_action_id` |

会桥读取允许范围内的实际文件并计算摘要。有效终态报告可自动准备交接并回原主会话，单独 return 用于对账已有回报。

`run` 保留真实进程身份和终态收据，不自动重启作业。`cancel` 不会结束这个独立进程。

原生命令行动核验目前主要面向原 Codex 主会话。`purpose` 为 `verification` 或 `continuation`，动作编号需要稳定；原生命令尚未结束、历史尚未可读时，对账可以保持 pending，见 [兼容性说明](support.md)。

## MCP 与原生工具

MCP 提供同一内核的操作入口并共用参数定义；运行 `session-bridge describe --query tool --json` 查询。共享 Codex MCP 缺少可信来源证明时拒绝写操作，此时使用原聊天 CLI 路线。

不同应用的原生插件调用格式不同。遵循 [sessionbridge-do](../skills/sessionbridge-do/SKILL.md) 和实际工具 schema，不假设所有应用都接受同一种参数格式。

## 安装与移除

```bash
session-bridge install --harness claude --scope project --project /absolute/path/to/project --dry-run
session-bridge install --harness claude --scope project --project /absolute/path/to/project
session-bridge uninstall --receipt /安装收据绝对路径/install-receipt.json
```

安装返回 `enabled:false` 和激活步骤。升级／移除保留用户后来修改的文件和无关配置，冲突需用户处理。移除 npm 安装目录与移除应用接入文件是两项独立操作。

已有授权的后续动作需要先用 `acknowledge` 的 `action=plan_next` 固定，再运行 verification action。没有 next_action 记录时不会发送自动续接通知；不得盲等或重跑已完成步骤。

维护者修改参数后运行 `npm run generate:contracts`；`npm run check:contracts` 只检查，不改文件。测试和打包会拒绝过期参考或不同步的插件副本。
