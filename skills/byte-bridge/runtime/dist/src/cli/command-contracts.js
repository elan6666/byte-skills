import { byteSourceInputSchema } from '../workflows/byte-source.js';
import { byteImportInputSchema, byteHandoffMetadataSchema } from '../workflows/byte-v1.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requestSchema, toolInputSchemas, acknowledgeInputSchema, reportInputSchema, actionInputSchema, runInputSchema, supervisionInputSchema, zcodeHostInputSchema, setupInputSchema, zcodeAttachInputSchema, zcodeWaitInputSchema, zcodeAttachedRequestInputSchema, zcodeDetachInputSchema, acpHostInputSchema, hermesNativeToolSchema } from '../protocol/command-inputs.js';
import { BridgeError } from '../protocol/errors.js';
const requestId = 'replace-with-context-request-id', taskId = 'replace-with-received-task-id', deadline = '2099-01-01T00:00:00Z';
const work = { goal: 'Read src/ and write only output/worker.json; the original main alone writes output/verified.json and output/continued.json.', acceptance: ['Actual artifact and independent main verification'], read_paths: ['src', 'verify'], write_paths: ['output/worker.json', 'output/verified.json', 'output/continued.json'], deadline_at: deadline };
const run = { run_id: 'replace-with-run-id', pid: 12345, started_at: 'replace-with-actual-start-identity', command_sha256: 'a'.repeat(64), root: '/absolute/project', source_commit: 'replace-with-actual-commit', config_sha256: 'b'.repeat(64) };
const receive = { task_id: taskId, action: 'receive' }, plan = { task_id: taskId, action: 'plan_next', next_action_id: 'replace-with-stable-next-action-id', next_instruction: 'After successful independent verification, continue the authorized integration.', next_argv: ['python3', 'verify/continue.py'], next_artifact_paths: ['output/continued.json'] }, verification = { task_id: taskId, action: 'verify', evidence_file: '.session-bridge/actions/actual-proof/evidence.json' }, continuation = { ...verification, action: 'continue' };
const reporting = { task_id: taskId, summary: 'Replace with the actual execution summary.', artifact_paths: ['output/worker.json'] };
const supervise = { request_id: requestId, task_id: taskId, run_file: 'output/run.json', supervisor_query: 'reviewer', interval_seconds: 60, deadline_at: deadline, repair_paths: ['src'] };
const requests = {
    assign_roles: { operation: 'assign_roles', request_id: requestId, main: 'current', supervisor: { query: 'reviewer' } },
    delegate: { operation: 'delegate', request_id: requestId, target: { query: 'worker' }, ...work },
    supervise: { operation: 'supervise', request_id: requestId, task_id: taskId, run, supervisor: { query: 'reviewer' }, interval_seconds: 60, deadline_at: deadline, repair_paths: ['src'] },
    status: { operation: 'status', request_id: requestId }, return: { operation: 'return', request_id: requestId, task_id: taskId }, recover: { operation: 'recover', request_id: requestId, message_id: 'replace-with-original-message-id' }, cancel_pending: { operation: 'cancel_pending', request_id: requestId, task_id: taskId, stop_supervision: true }
};
const tools = {
    list_sessions: [{ query: 'worker' }], configure_roles: [{ request_id: requestId, supervisor_query: 'reviewer' }], delegate_task: [{ request_id: requestId, target_query: 'worker', ...work }], get_task_status: [{}, { task_id: taskId }], acknowledge_task: [receive, plan, verification, continuation], report_result: [reporting], request_supervision: [supervise], return_to_main: [{ request_id: requestId, task_id: taskId }], recover_delivery: [{ request_id: requestId, message_id: 'replace-with-original-message-id' }], cancel_pending: [{ request_id: requestId, task_id: taskId, stop_supervision: true }]
};
const examples = (inputs) => inputs.map((input, i) => ({ label: typeof input.action === 'string' ? input.action : 'structure-' + (i + 1), input }));
function definitions() {
    return [
        ...requestSchema.options.map(schema => ({ id: 'request.' + schema.shape.operation.value, invocation: 'session-bridge request --stdin --json', schema, examples: examples([requests[schema.shape.operation.value]]) })),
        ...Object.entries(toolInputSchemas).map(([name, schema]) => ({ id: 'tool.' + name, invocation: 'MCP ' + name + '(input); Pi/dsh/ZCode/Kimi/OpenCode {method,params}', schema, examples: examples(tools[name]) })),
        { id: 'cli.setup', invocation: 'session-bridge setup --harness codex --with zcode --project PATH --stdin --json', schema: setupInputSchema, examples: examples([{ lifetime_seconds: 3600 }]) },
        { id: 'zcode.attach', invocation: 'ZCode original-session MCP sessionbridge_attach(input)', schema: zcodeAttachInputSchema, examples: examples([{ alias: 'zcode-worker', lifetime_seconds: 900 }, { alias: 'zcode-worker', lifetime_seconds: 900, challenge: '00000000-0000-4000-8000-000000000001' }]) },
        { id: 'zcode.wait', invocation: 'ZCode original-session MCP sessionbridge_wait(input)', schema: zcodeWaitInputSchema, examples: examples([{ timeout_seconds: 30 }]) },
        { id: 'zcode.detach', invocation: 'ZCode original-session MCP sessionbridge_detach(input)', schema: zcodeDetachInputSchema, examples: examples([{}]) },
        { id: 'zcode.request', invocation: 'ZCode original-session MCP sessionbridge_request(input)', schema: zcodeAttachedRequestInputSchema, examples: examples([{ request: { method: 'context', params: {} } }]) },
        { id: 'cli.byte-source', invocation: 'session-bridge byte-source --stdin --json', schema: byteSourceInputSchema, examples: examples([{ source_root: '/absolute/byte-skills', source_commit: 'replace-with-verified-source-revision', python_bin: '/absolute/python3' }]) },
        { id: 'cli.byte-handoff', invocation: 'Metadata under sessionbridge in the Byte engine-committed JSON handoff', schema: byteHandoffMetadataSchema, examples: examples([{ schema_version: 1, direction: 'delegate', event_id: 'replace-with-start-run-event-id', revision: 1, outcome_id: 'replace-with-outcome-id', instance_sha256: 'a'.repeat(64), run_id: 'replace-with-real-run-id', attempt: 1, scope: { source: { harness: 'codex', host_id: 'replace-with-host', profile_id: 'replace-with-profile', native_session_id: 'replace-with-native-main', project_id: 'replace-with-project', runtime_generation: 'replace-with-main-generation' }, target: { harness: 'claude', host_id: 'replace-with-host', profile_id: 'replace-with-supervisor-profile', native_session_id: 'replace-with-native-supervisor', project_id: 'replace-with-project', runtime_generation: 'replace-with-supervisor-generation' }, return_to: { harness: 'codex', host_id: 'replace-with-host', profile_id: 'replace-with-profile', native_session_id: 'replace-with-native-main', project_id: 'replace-with-project', runtime_generation: 'replace-with-main-generation' }, ...work } }]) },
        { id: 'cli.byte-import', invocation: 'session-bridge byte-import --stdin --json', schema: byteImportInputSchema, examples: examples([{ handoff_id: '.byte-os/coordination/handoffs/actual.json' }, { handoff_id: '.byte-os/coordination/handoffs/return.json', task_id: taskId }]) },
        { id: 'hermes.native', invocation: 'Hermes sessionbridge_request({command,payload})', schema: hermesNativeToolSchema, examples: examples([{ command: 'context' }, { command: 'report', payload: reporting }]) },
        { id: 'cli.report', invocation: 'session-bridge report --stdin --json', schema: reportInputSchema, examples: examples([reporting]) },
        { id: 'cli.acknowledge', invocation: 'session-bridge acknowledge --stdin --json', schema: acknowledgeInputSchema, examples: examples([receive, plan, verification, continuation]) },
        { id: 'cli.action', invocation: 'session-bridge action --action-id STABLE_TOKEN --stdin --json', schema: actionInputSchema, examples: examples([{ task_id: taskId, purpose: 'verification', argv: ['python3', 'verify/check.py'], artifact_paths: ['output/verified.json'] }, { task_id: taskId, purpose: 'continuation', argv: plan.next_argv, artifact_paths: plan.next_artifact_paths, next_action_id: plan.next_action_id }]) },
        { id: 'cli.run', invocation: 'session-bridge run --stdin --json', schema: runInputSchema, examples: examples([{ argv: ['python3', 'src/job.py'], source_commit: 'replace-with-actual-commit', config_sha256: 'a'.repeat(64), artifacts: ['output/worker.json'] }]) },
        { id: 'cli.supervise-file', invocation: 'session-bridge supervise --stdin --json', schema: supervisionInputSchema, examples: examples([supervise]) },
        ...['kimi', 'opencode'].map(harness => ({ id: 'cli.host.' + harness, invocation: 'session-bridge host --harness ' + harness + ' --stdin --json', schema: acpHostInputSchema, examples: examples([{ profile_dir: '/absolute/isolated-profile', binary: '/absolute/native-agent', expected_version: 'replace-with-verified-native-version', alias: harness + '-worker', credential_env: ['GLM_API_KEY'], lifetime_seconds: 900 }]) })),
        { id: 'cli.host.zcode', invocation: 'session-bridge host --harness zcode --stdin --json', schema: zcodeHostInputSchema, examples: examples([{ profile_dir: '/absolute/dedicated-zcode-home', alias: 'zcode-worker', permission_mode: 'build', lifetime_seconds: 3600 }]) }
    ];
}
export function describeContracts(query = '') {
    const all = definitions();
    for (const d of all)
        for (const example of d.examples)
            d.schema.parse(example.input);
    const selected = query ? all.filter(d => d.id === query || d.id.startsWith(query + '.')) : all;
    if (!selected.length)
        throw new BridgeError('unknown_contract', '没有匹配的命令参数契约：' + query, '运行 session-bridge describe --json 查看可用名称', 4);
    return { schema_version: 1, example_only: true, notes: ['Examples describe shapes only. Replace request/task/message/action IDs, paths, run identity and deadline with actual values.', 'Format validation does not establish native identity, authorization, task acceptance or main continuation.'], contracts: selected.map(d => ({ id: d.id, invocation: d.invocation, schema: z.toJSONSchema(d.schema, { io: 'input' }), examples: d.examples })) };
}
function fieldType(value) {
    const s = value;
    if (s.const !== undefined)
        return JSON.stringify(s.const);
    if (Array.isArray(s.enum))
        return s.enum.map(v => JSON.stringify(v)).join(' / ');
    if (Array.isArray(s.anyOf))
        return s.anyOf.map(fieldType).join(' 或 ');
    if (s.type === 'array')
        return 'array<' + fieldType(s.items) + '>';
    if (s.type === 'object')
        return 'object(' + Object.keys((s.properties ?? {})).join(', ') + ')';
    return String(s.type ?? 'JSON');
}
function fieldTables(schema) {
    const branches = (schema.anyOf ?? schema.oneOf ?? [schema]), lines = [];
    for (const branch of branches) {
        const properties = (branch.properties ?? {}), required = (branch.required ?? []);
        const label = properties.action?.const ?? properties.purpose?.const;
        if (label !== undefined)
            lines.push('分支：`' + String(label) + '`', '');
        lines.push('| 字段 | 类型 | 必填／默认值 |', '| --- | --- | --- |');
        for (const [name, spec] of Object.entries(properties))
            lines.push('| `' + name + '` | `' + fieldType(spec).replaceAll('|', '\\|') + '` | ' + (required.includes(name) ? '必填' : '可选') + (spec.default !== undefined ? '；默认 `' + JSON.stringify(spec.default) + '`' : '') + ' |');
        lines.push('');
    }
    return lines;
}
export function renderCommandReference() {
    const doc = describeContracts();
    const lines = ['# 命令参数参考（自动生成）', '', '本文件由实际运行的 Zod 输入契约和已校验的结构示例生成。不要手工编辑；维护者运行 `npm run generate:contracts` 更新。', '', '先运行 `session-bridge describe --query request.delegate --json` 查询单项；省略 query 列出全部。该命令只读，不需要连接、服务或初始化项目。', '', '这里的编号、路径、进程和 2099 年时间仅为结构示例。实际调用必须替换为原生 context、sessions、任务和运行收据中的真实值，并按实际截止时间填写。每个写请求保留原 request_id 供对账。', '', '## 入口选择', '', '- CLI：把下列 input 作为 stdin JSON 数据传入固定命令，加 `--project` 选择项目。', '- MCP：使用 tool 名称和其 input；list_sessions 是 MCP 名称。', '- Pi/dsh 和 ZCode 专用 App Server 原生工具：使用 `{"method":"工具名","params":input}`；列会话的 method 为 `sessions`。通用业务请求使用 `{"method":"request","params":业务请求}`。', '- Hermes 原生工具：使用 `{"command":"request","payload":业务请求}`；回报用 command=report，确认/计划用 command=acknowledge。不要把其他宿主的 method/params 外壳用于 Hermes。', '', 'ZCode 已打开原会话的插件工具另用 zcode.attach / zcode.wait / zcode.request 契约。每次调用首次返回 challenge，保持所有原参数不变并加入该 challenge 后再调用；不填写来源会话 ID。request 外壳为 {request:{method,params},challenge?}。等待仅限用户已授权的时限，停止等待后不承诺空闲自动唤醒。', '', '## 完整回报顺序', '', '1. 派发前把执行者产物和主会话核验／续接产物一同纳入任务 write_paths；goal 分别写清各角色能写的路径。', '2. 若用户已授权后续动作，delegate 成功后、verification 前登记 acknowledge 的 plan_next。该步骤只固定计划，不执行命令。', '3. 执行者报告真实 summary 和 artifact_paths；原主 receive 后用自己的原生 action 做独立 verification。', '4. 当前轮结束后再等待 verification_ready，执行预先固定的 continuation。原生命令证明目前主要面向 Codex；参数正确不等于 verified。', '', '## 目标选择器', '', '精确指定已列出的目标时，把 binding_id 的值放入 query，例如 `{"query":"实际返回的 binding_id"}`；不使用 `{"binding_id":"..."}`。只设置角色使用 assign_roles/configure_roles，不创建任务或监督。', '', '## 契约目录', ''];
    for (const d of doc.contracts) {
        lines.push('### ' + d.id, '', '入口：`' + d.invocation + '`', '', '输入契约摘要：`' + createHash('sha256').update(JSON.stringify(d.schema)).digest('hex') + '`', '', ...fieldTables(d.schema));
        for (const e of d.examples)
            lines.push('结构示例：' + e.label, '', '```json', JSON.stringify(e.input, null, 2), '```', '');
    }
    return lines.join('\n');
}
//# sourceMappingURL=command-contracts.js.map