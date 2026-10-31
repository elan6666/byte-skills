# 命令参数参考（自动生成）

本文件由实际运行的 Zod 输入契约和已校验的结构示例生成。不要手工编辑；维护者运行 `npm run generate:contracts` 更新。

先运行 `session-bridge describe --query request.delegate --json` 查询单项；省略 query 列出全部。该命令只读，不需要连接、服务或初始化项目。

这里的编号、路径、进程和 2099 年时间仅为结构示例。实际调用必须替换为原生 context、sessions、任务和运行收据中的真实值，并按实际截止时间填写。每个写请求保留原 request_id 供对账。

## 入口选择

- CLI：把下列 input 作为 stdin JSON 数据传入固定命令，加 `--project` 选择项目。
- MCP：使用 tool 名称和其 input；list_sessions 是 MCP 名称。
- Pi/dsh 和 ZCode 专用 App Server 原生工具：使用 `{"method":"工具名","params":input}`；列会话的 method 为 `sessions`。通用业务请求使用 `{"method":"request","params":业务请求}`。
- Hermes 原生工具：使用 `{"command":"request","payload":业务请求}`；回报用 command=report，确认/计划用 command=acknowledge。不要把其他宿主的 method/params 外壳用于 Hermes。

ZCode 已打开原会话的插件工具另用 zcode.attach / zcode.wait / zcode.request 契约。每次调用首次返回 challenge，保持所有原参数不变并加入该 challenge 后再调用；不填写来源会话 ID。request 外壳为 {request:{method,params},challenge?}。等待仅限用户已授权的时限，停止等待后不承诺空闲自动唤醒。

## 完整回报顺序

1. 派发前把执行者产物和主会话核验／续接产物一同纳入任务 write_paths；goal 分别写清各角色能写的路径。
2. 若用户已授权后续动作，delegate 成功后、verification 前登记 acknowledge 的 plan_next。该步骤只固定计划，不执行命令。
3. 执行者报告真实 summary 和 artifact_paths；原主 receive 后用自己的原生 action 做独立 verification。
4. 当前轮结束后再等待 verification_ready，执行预先固定的 continuation。原生命令证明目前主要面向 Codex；参数正确不等于 verified。

## 目标选择器

精确指定已列出的目标时，把 binding_id 的值放入 query，例如 `{"query":"实际返回的 binding_id"}`；不使用 `{"binding_id":"..."}`。只设置角色使用 assign_roles/configure_roles，不创建任务或监督。

## 契约目录

### request.assign_roles

入口：`session-bridge request --stdin --json`

输入契约摘要：`3e34455a360a9d3dafc9ec565bfe40c2dad46afea8d677335951cb41dcf20b7b`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"assign_roles"` | 必填 |
| `main` | `"current" 或 object(query, harness, project_id, profile_id) 或 object(role)` | 必填 |
| `supervisor` | `"current" 或 object(query, harness, project_id, profile_id) 或 object(role)` | 必填 |

结构示例：structure-1

```json
{
  "operation": "assign_roles",
  "request_id": "replace-with-context-request-id",
  "main": "current",
  "supervisor": {
    "query": "reviewer"
  }
}
```

### request.delegate

入口：`session-bridge request --stdin --json`

输入契约摘要：`3977a8ee486f5df4e2ec59e3b04214153e113bfbe263ef3e38ce317a3826651c`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"delegate"` | 必填 |
| `target` | `"current" 或 object(query, harness, project_id, profile_id) 或 object(role)` | 必填 |
| `goal` | `string` | 必填 |
| `acceptance` | `array<string>` | 必填 |
| `read_paths` | `array<string>` | 必填 |
| `write_paths` | `array<string>` | 必填 |
| `deadline_at` | `string` | 必填 |

结构示例：structure-1

```json
{
  "operation": "delegate",
  "request_id": "replace-with-context-request-id",
  "target": {
    "query": "worker"
  },
  "goal": "Read src/ and write only output/worker.json; the original main alone writes output/verified.json and output/continued.json.",
  "acceptance": [
    "Actual artifact and independent main verification"
  ],
  "read_paths": [
    "src",
    "verify"
  ],
  "write_paths": [
    "output/worker.json",
    "output/verified.json",
    "output/continued.json"
  ],
  "deadline_at": "2099-01-01T00:00:00Z"
}
```

### request.supervise

入口：`session-bridge request --stdin --json`

输入契约摘要：`bb2701e8eb02e2529e10887a36c6bf1b0a4258157e61d914bf422260bfd87a7e`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"supervise"` | 必填 |
| `task_id` | `string` | 必填 |
| `run` | `object(run_id, pid, started_at, command_sha256, root, source_commit, config_sha256)` | 必填 |
| `supervisor` | `"current" 或 object(query, harness, project_id, profile_id) 或 object(role)` | 必填 |
| `interval_seconds` | `integer` | 必填 |
| `deadline_at` | `string` | 必填 |
| `repair_paths` | `array<string>` | 必填 |

结构示例：structure-1

```json
{
  "operation": "supervise",
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id",
  "run": {
    "run_id": "replace-with-run-id",
    "pid": 12345,
    "started_at": "replace-with-actual-start-identity",
    "command_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "root": "/absolute/project",
    "source_commit": "replace-with-actual-commit",
    "config_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  },
  "supervisor": {
    "query": "reviewer"
  },
  "interval_seconds": 60,
  "deadline_at": "2099-01-01T00:00:00Z",
  "repair_paths": [
    "src"
  ]
}
```

### request.status

入口：`session-bridge request --stdin --json`

输入契约摘要：`6d7cf11b3afd0cd837fd4a48932b8d0eb92fa79b8664827641cbef3d38ffe65b`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"status"` | 必填 |
| `task_id` | `string` | 可选 |
| `for_request` | `string` | 可选 |

结构示例：structure-1

```json
{
  "operation": "status",
  "request_id": "replace-with-context-request-id"
}
```

### request.return

入口：`session-bridge request --stdin --json`

输入契约摘要：`e054d3bfb54062598cb30e72deee25b24791d023580df5ff2e615c110b6fa21e`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"return"` | 必填 |
| `task_id` | `string` | 必填 |
| `summary` | `string` | 可选 |

结构示例：structure-1

```json
{
  "operation": "return",
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id"
}
```

### request.recover

入口：`session-bridge request --stdin --json`

输入契约摘要：`7d77894349fd74edd314b2e67c83a1b99cfa45a189226ed0f240d76edf62a610`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"recover"` | 必填 |
| `message_id` | `string` | 必填 |

结构示例：structure-1

```json
{
  "operation": "recover",
  "request_id": "replace-with-context-request-id",
  "message_id": "replace-with-original-message-id"
}
```

### request.cancel_pending

入口：`session-bridge request --stdin --json`

输入契约摘要：`9f7fc7872377f7fc29873c3fb83287390fc684327b077a447dad8e5e282de839`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `operation` | `"cancel_pending"` | 必填 |
| `task_id` | `string` | 必填 |
| `stop_supervision` | `boolean` | 可选 |

结构示例：structure-1

```json
{
  "operation": "cancel_pending",
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id",
  "stop_supervision": true
}
```

### tool.list_sessions

入口：`MCP list_sessions(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`74cc3f7ccf887ef3c7e7dfa7b34b5be6b9669500f0dbba6ef95e411b7c8aff81`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `query` | `string` | 可选 |
| `harness` | `string` | 可选 |
| `profile_id` | `string` | 可选 |

结构示例：structure-1

```json
{
  "query": "worker"
}
```

### tool.configure_roles

入口：`MCP configure_roles(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`c87f80558369418380dd337f21e60911088f10469f17620c5c2e8e02edf73a4d`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `supervisor_query` | `string` | 必填 |
| `supervisor_harness` | `string` | 可选 |
| `supervisor_profile` | `string` | 可选 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "supervisor_query": "reviewer"
}
```

### tool.delegate_task

入口：`MCP delegate_task(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`702ab1873ea530c5aeba4e7d23b4a0fdbdd9f0c14509c2eec9f97442bb28d062`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `target_query` | `string` | 必填 |
| `target_harness` | `string` | 可选 |
| `target_profile` | `string` | 可选 |
| `goal` | `string` | 必填 |
| `acceptance` | `array<string>` | 必填 |
| `read_paths` | `array<string>` | 必填 |
| `write_paths` | `array<string>` | 必填 |
| `deadline_at` | `string` | 必填 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "target_query": "worker",
  "goal": "Read src/ and write only output/worker.json; the original main alone writes output/verified.json and output/continued.json.",
  "acceptance": [
    "Actual artifact and independent main verification"
  ],
  "read_paths": [
    "src",
    "verify"
  ],
  "write_paths": [
    "output/worker.json",
    "output/verified.json",
    "output/continued.json"
  ],
  "deadline_at": "2099-01-01T00:00:00Z"
}
```

### tool.get_task_status

入口：`MCP get_task_status(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`e99da6795ca189ad14eaa11847a0703020793aa6ba26723bb7459bd97ed55d75`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 可选 |
| `for_request` | `string` | 可选 |

结构示例：structure-1

```json
{}
```

结构示例：structure-2

```json
{
  "task_id": "replace-with-received-task-id"
}
```

### tool.acknowledge_task

入口：`MCP acknowledge_task(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`7181588b453cce165fb4d4f78acd04e4324f4c3524014de9ac8da55f9968900a`

分支：`receive`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"receive"` | 可选；默认 `"receive"` |

分支：`verify`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"verify"` | 必填 |
| `evidence_file` | `string` | 必填 |

分支：`continue`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"continue"` | 必填 |
| `evidence_file` | `string` | 必填 |

分支：`plan_next`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"plan_next"` | 必填 |
| `next_action_id` | `string` | 必填 |
| `next_instruction` | `string` | 必填 |
| `next_argv` | `array<string>` | 必填 |
| `next_artifact_paths` | `array<string>` | 必填 |

结构示例：receive

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "receive"
}
```

结构示例：plan_next

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "plan_next",
  "next_action_id": "replace-with-stable-next-action-id",
  "next_instruction": "After successful independent verification, continue the authorized integration.",
  "next_argv": [
    "python3",
    "verify/continue.py"
  ],
  "next_artifact_paths": [
    "output/continued.json"
  ]
}
```

结构示例：verify

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "verify",
  "evidence_file": ".session-bridge/actions/actual-proof/evidence.json"
}
```

结构示例：continue

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "continue",
  "evidence_file": ".session-bridge/actions/actual-proof/evidence.json"
}
```

### tool.report_result

入口：`MCP report_result(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`ba8c7d41068f9323591e14cc8af45a551d973402305485477588cac22fc06004`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `summary` | `string` | 必填 |
| `artifact_paths` | `array<string>` | 必填 |
| `native_receipts` | `array<string>` | 可选 |
| `attempt` | `integer` | 可选 |
| `authority_epoch` | `integer` | 可选 |

结构示例：structure-1

```json
{
  "task_id": "replace-with-received-task-id",
  "summary": "Replace with the actual execution summary.",
  "artifact_paths": [
    "output/worker.json"
  ]
}
```

### tool.request_supervision

入口：`MCP request_supervision(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`cb9429b19590bc8e3f48b186a906a96767293e4a180c6101a05a2ea73a32cda0`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `task_id` | `string` | 必填 |
| `run_file` | `string` | 必填 |
| `supervisor_query` | `string` | 必填 |
| `supervisor_harness` | `string` | 可选 |
| `interval_seconds` | `integer` | 必填 |
| `deadline_at` | `string` | 必填 |
| `repair_paths` | `array<string>` | 必填 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id",
  "run_file": "output/run.json",
  "supervisor_query": "reviewer",
  "interval_seconds": 60,
  "deadline_at": "2099-01-01T00:00:00Z",
  "repair_paths": [
    "src"
  ]
}
```

### tool.return_to_main

入口：`MCP return_to_main(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`4fb1c0ceaed54274ecee2c8f86b1e9dad8b86f4bb1522ca1eea11898d4e089f3`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `task_id` | `string` | 必填 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id"
}
```

### tool.recover_delivery

入口：`MCP recover_delivery(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`9eb5ddf7b294dfa9763851c6a9ab1ab0358e44e9016aae4ba66a19b01884d83e`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `message_id` | `string` | 必填 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "message_id": "replace-with-original-message-id"
}
```

### tool.cancel_pending

入口：`MCP cancel_pending(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}`

输入契约摘要：`d60fb9aa7f18b25dcb8f1eeeea9ccaee2e9fce980689937b34f3df23819c949b`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `task_id` | `string` | 必填 |
| `stop_supervision` | `boolean` | 可选 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id",
  "stop_supervision": true
}
```

### cli.setup

入口：`session-bridge setup --harness codex --with zcode --project PATH --stdin --json`

输入契约摘要：`e49be21007b3c4187f4ce302a6f5404de3f6818a1b8f1777a5b69df3968e66e1`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `lifetime_seconds` | `integer` | 可选；默认 `3600` |

结构示例：structure-1

```json
{
  "lifetime_seconds": 3600
}
```

### zcode.attach

入口：`ZCode original-session MCP sessionbridge_attach(input)`

输入契约摘要：`98eef52ec91bf0a5dd4cf8d099cd8f3f30b5535d3cd448bc0ce84c24a6e6d179`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `challenge` | `string` | 可选 |
| `alias` | `string` | 可选；默认 `"zcode-attached"` |
| `lifetime_seconds` | `integer` | 可选；默认 `900` |

结构示例：structure-1

```json
{
  "alias": "zcode-worker",
  "lifetime_seconds": 900
}
```

结构示例：structure-2

```json
{
  "alias": "zcode-worker",
  "lifetime_seconds": 900,
  "challenge": "00000000-0000-4000-8000-000000000001"
}
```

### zcode.wait

入口：`ZCode original-session MCP sessionbridge_wait(input)`

输入契约摘要：`a1bd4ecf4e06257f729a58f816d24f2f36936e96d1c37c4515b8df00de08691c`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `challenge` | `string` | 可选 |
| `timeout_seconds` | `integer` | 可选；默认 `30` |

结构示例：structure-1

```json
{
  "timeout_seconds": 30
}
```

### zcode.detach

入口：`ZCode original-session MCP sessionbridge_detach(input)`

输入契约摘要：`59c4eb15384800b97cfca0075ad6c1a49de3aadadcf2978ea4e0fdbaa32d29ab`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `challenge` | `string` | 可选 |

结构示例：structure-1

```json
{}
```

### zcode.request

入口：`ZCode original-session MCP sessionbridge_request(input)`

输入契约摘要：`eeef3ef6df3bdc8e323966c82afb8d0febf29f2d228a21cf31257c037e68d8de`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `challenge` | `string` | 可选 |
| `request` | `object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params) 或 object(method, params)` | 必填 |

结构示例：structure-1

```json
{
  "request": {
    "method": "context",
    "params": {}
  }
}
```

### cli.byte-source

入口：`session-bridge byte-source --stdin --json`

输入契约摘要：`c64e52ed4ece0d561904e82a26f0b01651191bdfbb90f7a16b52bc6b447414e2`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `source_root` | `string` | 必填 |
| `source_commit` | `string` | 必填 |
| `python_bin` | `string` | 必填 |
| `expected_pin_sha256` | `string` | 可选 |

结构示例：structure-1

```json
{
  "source_root": "/absolute/byte-skills",
  "source_commit": "replace-with-verified-source-revision",
  "python_bin": "/absolute/python3"
}
```

### cli.byte-handoff

入口：`Metadata under sessionbridge in the Byte engine-committed JSON handoff`

输入契约摘要：`a7cf46734335fe1e820dfcce897a85a757d1854826afef3c076ae41b2a06fa9e`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `schema_version` | `1` | 必填 |
| `direction` | `"delegate" / "return"` | 必填 |
| `event_id` | `string` | 必填 |
| `revision` | `integer` | 必填 |
| `outcome_id` | `string` | 必填 |
| `instance_sha256` | `string` | 必填 |
| `run_id` | `string` | 必填 |
| `attempt` | `integer` | 必填 |
| `scope` | `object(source, target, goal, acceptance, read_paths, write_paths, return_to, deadline_at)` | 必填 |

结构示例：structure-1

```json
{
  "schema_version": 1,
  "direction": "delegate",
  "event_id": "replace-with-start-run-event-id",
  "revision": 1,
  "outcome_id": "replace-with-outcome-id",
  "instance_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "run_id": "replace-with-real-run-id",
  "attempt": 1,
  "scope": {
    "source": {
      "harness": "codex",
      "host_id": "replace-with-host",
      "profile_id": "replace-with-profile",
      "native_session_id": "replace-with-native-main",
      "project_id": "replace-with-project",
      "runtime_generation": "replace-with-main-generation"
    },
    "target": {
      "harness": "claude",
      "host_id": "replace-with-host",
      "profile_id": "replace-with-supervisor-profile",
      "native_session_id": "replace-with-native-supervisor",
      "project_id": "replace-with-project",
      "runtime_generation": "replace-with-supervisor-generation"
    },
    "return_to": {
      "harness": "codex",
      "host_id": "replace-with-host",
      "profile_id": "replace-with-profile",
      "native_session_id": "replace-with-native-main",
      "project_id": "replace-with-project",
      "runtime_generation": "replace-with-main-generation"
    },
    "goal": "Read src/ and write only output/worker.json; the original main alone writes output/verified.json and output/continued.json.",
    "acceptance": [
      "Actual artifact and independent main verification"
    ],
    "read_paths": [
      "src",
      "verify"
    ],
    "write_paths": [
      "output/worker.json",
      "output/verified.json",
      "output/continued.json"
    ],
    "deadline_at": "2099-01-01T00:00:00Z"
  }
}
```

### cli.byte-import

入口：`session-bridge byte-import --stdin --json`

输入契约摘要：`4c2209a375ffa9a539eeeef06f6dc2220c9dcbd952366ead070e20c82051feb1`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `handoff_id` | `string` | 必填 |
| `task_id` | `string` | 可选 |

结构示例：structure-1

```json
{
  "handoff_id": ".byte-os/coordination/handoffs/actual.json"
}
```

结构示例：structure-2

```json
{
  "handoff_id": ".byte-os/coordination/handoffs/return.json",
  "task_id": "replace-with-received-task-id"
}
```

### hermes.native

入口：`Hermes sessionbridge_request({command,payload})`

输入契约摘要：`429d8f4d743902547bd493008874245235bf7df04d3c7ac165934322699d26dc`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `command` | `"report"` | 必填 |
| `payload` | `object(task_id, summary, artifact_paths, native_receipts, attempt, authority_epoch)` | 必填 |

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `command` | `"context" / "sessions" / "request" / "status" / "acknowledge" / "supervise" / "return" / "recover" / "cancel"` | 必填 |
| `payload` | `object()` | 可选 |

结构示例：structure-1

```json
{
  "command": "context"
}
```

结构示例：structure-2

```json
{
  "command": "report",
  "payload": {
    "task_id": "replace-with-received-task-id",
    "summary": "Replace with the actual execution summary.",
    "artifact_paths": [
      "output/worker.json"
    ]
  }
}
```

### cli.report

入口：`session-bridge report --stdin --json`

输入契约摘要：`ba8c7d41068f9323591e14cc8af45a551d973402305485477588cac22fc06004`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `summary` | `string` | 必填 |
| `artifact_paths` | `array<string>` | 必填 |
| `native_receipts` | `array<string>` | 可选 |
| `attempt` | `integer` | 可选 |
| `authority_epoch` | `integer` | 可选 |

结构示例：structure-1

```json
{
  "task_id": "replace-with-received-task-id",
  "summary": "Replace with the actual execution summary.",
  "artifact_paths": [
    "output/worker.json"
  ]
}
```

### cli.acknowledge

入口：`session-bridge acknowledge --stdin --json`

输入契约摘要：`7181588b453cce165fb4d4f78acd04e4324f4c3524014de9ac8da55f9968900a`

分支：`receive`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"receive"` | 可选；默认 `"receive"` |

分支：`verify`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"verify"` | 必填 |
| `evidence_file` | `string` | 必填 |

分支：`continue`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"continue"` | 必填 |
| `evidence_file` | `string` | 必填 |

分支：`plan_next`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `action` | `"plan_next"` | 必填 |
| `next_action_id` | `string` | 必填 |
| `next_instruction` | `string` | 必填 |
| `next_argv` | `array<string>` | 必填 |
| `next_artifact_paths` | `array<string>` | 必填 |

结构示例：receive

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "receive"
}
```

结构示例：plan_next

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "plan_next",
  "next_action_id": "replace-with-stable-next-action-id",
  "next_instruction": "After successful independent verification, continue the authorized integration.",
  "next_argv": [
    "python3",
    "verify/continue.py"
  ],
  "next_artifact_paths": [
    "output/continued.json"
  ]
}
```

结构示例：verify

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "verify",
  "evidence_file": ".session-bridge/actions/actual-proof/evidence.json"
}
```

结构示例：continue

```json
{
  "task_id": "replace-with-received-task-id",
  "action": "continue",
  "evidence_file": ".session-bridge/actions/actual-proof/evidence.json"
}
```

### cli.action

入口：`session-bridge action --action-id STABLE_TOKEN --stdin --json`

输入契约摘要：`0602b902424ad9983c5ab4941952f1ecd870e722c324511b008a4f35f8873a87`

分支：`verification`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `argv` | `array<string>` | 必填 |
| `artifact_paths` | `array<string>` | 必填 |
| `purpose` | `"verification"` | 必填 |

分支：`continuation`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `task_id` | `string` | 必填 |
| `argv` | `array<string>` | 必填 |
| `artifact_paths` | `array<string>` | 必填 |
| `purpose` | `"continuation"` | 必填 |
| `next_action_id` | `string` | 必填 |

结构示例：structure-1

```json
{
  "task_id": "replace-with-received-task-id",
  "purpose": "verification",
  "argv": [
    "python3",
    "verify/check.py"
  ],
  "artifact_paths": [
    "output/verified.json"
  ]
}
```

结构示例：structure-2

```json
{
  "task_id": "replace-with-received-task-id",
  "purpose": "continuation",
  "argv": [
    "python3",
    "verify/continue.py"
  ],
  "artifact_paths": [
    "output/continued.json"
  ],
  "next_action_id": "replace-with-stable-next-action-id"
}
```

### cli.run

入口：`session-bridge run --stdin --json`

输入契约摘要：`8c21a7aec793fecad3aed593ac288eb92cf5d8659b94ade4e0fbad280283214d`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `argv` | `array<string>` | 必填 |
| `source_commit` | `string` | 必填 |
| `config_sha256` | `string` | 必填 |
| `config_file` | `string` | 可选 |
| `artifacts` | `array<string>` | 可选 |
| `run_id` | `string` | 可选 |

结构示例：structure-1

```json
{
  "argv": [
    "python3",
    "src/job.py"
  ],
  "source_commit": "replace-with-actual-commit",
  "config_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "artifacts": [
    "output/worker.json"
  ]
}
```

### cli.supervise-file

入口：`session-bridge supervise --stdin --json`

输入契约摘要：`cb9429b19590bc8e3f48b186a906a96767293e4a180c6101a05a2ea73a32cda0`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `request_id` | `string` | 必填 |
| `original_text` | `string` | 可选 |
| `dry_run` | `boolean` | 可选 |
| `task_id` | `string` | 必填 |
| `run_file` | `string` | 必填 |
| `supervisor_query` | `string` | 必填 |
| `supervisor_harness` | `string` | 可选 |
| `interval_seconds` | `integer` | 必填 |
| `deadline_at` | `string` | 必填 |
| `repair_paths` | `array<string>` | 必填 |

结构示例：structure-1

```json
{
  "request_id": "replace-with-context-request-id",
  "task_id": "replace-with-received-task-id",
  "run_file": "output/run.json",
  "supervisor_query": "reviewer",
  "interval_seconds": 60,
  "deadline_at": "2099-01-01T00:00:00Z",
  "repair_paths": [
    "src"
  ]
}
```

### cli.host.kimi

入口：`session-bridge host --harness kimi --stdin --json`

输入契约摘要：`5e8ce26f2caa10e17d861572b8767bedfce76fdafb2b78ce4bfc32c2888bdf46`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `profile_dir` | `string` | 必填 |
| `binary` | `string` | 必填 |
| `expected_version` | `string` | 必填 |
| `alias` | `string` | 必填 |
| `permission_mode` | `string` | 可选 |
| `credential_env` | `array<"GLM_API_KEY" / "ZHIPU_API_KEY" / "ANTHROPIC_API_KEY" / "OPENAI_API_KEY">` | 可选；默认 `[]` |
| `lifetime_seconds` | `integer` | 可选；默认 `900` |

结构示例：structure-1

```json
{
  "profile_dir": "/absolute/isolated-profile",
  "binary": "/absolute/native-agent",
  "expected_version": "replace-with-verified-native-version",
  "alias": "kimi-worker",
  "credential_env": [
    "GLM_API_KEY"
  ],
  "lifetime_seconds": 900
}
```

### cli.host.opencode

入口：`session-bridge host --harness opencode --stdin --json`

输入契约摘要：`5e8ce26f2caa10e17d861572b8767bedfce76fdafb2b78ce4bfc32c2888bdf46`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `profile_dir` | `string` | 必填 |
| `binary` | `string` | 必填 |
| `expected_version` | `string` | 必填 |
| `alias` | `string` | 必填 |
| `permission_mode` | `string` | 可选 |
| `credential_env` | `array<"GLM_API_KEY" / "ZHIPU_API_KEY" / "ANTHROPIC_API_KEY" / "OPENAI_API_KEY">` | 可选；默认 `[]` |
| `lifetime_seconds` | `integer` | 可选；默认 `900` |

结构示例：structure-1

```json
{
  "profile_dir": "/absolute/isolated-profile",
  "binary": "/absolute/native-agent",
  "expected_version": "replace-with-verified-native-version",
  "alias": "opencode-worker",
  "credential_env": [
    "GLM_API_KEY"
  ],
  "lifetime_seconds": 900
}
```

### cli.host.zcode

入口：`session-bridge host --harness zcode --stdin --json`

输入契约摘要：`763bcf0d8bacd2f8252913954e03ef49c889931819d0804eb85939cc19368a81`

| 字段 | 类型 | 必填／默认值 |
| --- | --- | --- |
| `profile_dir` | `string` | 必填 |
| `alias` | `string` | 必填 |
| `permission_mode` | `"build" / "edit" / "plan" / "yolo" / "guarded"` | 必填 |
| `binary` | `string` | 可选 |
| `model` | `object()` | 可选 |
| `lifetime_seconds` | `integer` | 可选；默认 `3600` |

结构示例：structure-1

```json
{
  "profile_dir": "/absolute/dedicated-zcode-home",
  "alias": "zcode-worker",
  "permission_mode": "build",
  "lifetime_seconds": 3600
}
```
