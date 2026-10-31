import { z } from 'zod';
import { nonempty, timestamp } from './schema.js';
import { BridgeError } from './errors.js';
export const selectorSchema = z.union([z.literal('current'), z.strictObject({ query: z.string(), harness: nonempty.optional(), project_id: nonempty.optional(), profile_id: nonempty.optional() }), z.strictObject({ role: z.literal('supervisor') })]);
const requestBase = { request_id: nonempty.max(128), original_text: z.string().optional(), dry_run: z.boolean().optional() };
const runIdentityInput = z.strictObject({ run_id: nonempty, pid: z.number().int().positive(), started_at: nonempty, command_sha256: z.string().regex(/^[a-f0-9]{64}$/), root: nonempty, source_commit: nonempty, config_sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const requestSchema = z.discriminatedUnion('operation', [
    z.strictObject({ ...requestBase, operation: z.literal('assign_roles'), main: selectorSchema, supervisor: selectorSchema }),
    z.strictObject({ ...requestBase, operation: z.literal('delegate'), target: selectorSchema, goal: nonempty, acceptance: z.array(nonempty).min(1), read_paths: z.array(nonempty), write_paths: z.array(nonempty), deadline_at: timestamp }),
    z.strictObject({ ...requestBase, operation: z.literal('supervise'), task_id: nonempty, run: runIdentityInput, supervisor: selectorSchema, interval_seconds: z.number().int().min(1).max(86400), deadline_at: timestamp, repair_paths: z.array(nonempty) }),
    z.strictObject({ ...requestBase, operation: z.literal('status'), task_id: nonempty.optional(), for_request: nonempty.optional() }),
    z.strictObject({ ...requestBase, operation: z.literal('return'), task_id: nonempty, summary: z.string().optional() }),
    z.strictObject({ ...requestBase, operation: z.literal('recover'), message_id: nonempty }),
    z.strictObject({ ...requestBase, operation: z.literal('cancel_pending'), task_id: nonempty, stop_supervision: z.boolean().optional() })
]);
export const roleToolSchema = z.strictObject({ ...requestBase, supervisor_query: nonempty, supervisor_harness: nonempty.optional(), supervisor_profile: nonempty.optional() });
export function requestForRoleTool(input) {
    const parsed = roleToolSchema.safeParse(input);
    if (!parsed.success)
        throw new BridgeError('invalid_roles_tool', 'configure_roles requires params {request_id, supervisor_query}; do not add main, operation or supervisor', 'Use the request_id returned by context and the supervisor alias string; task fields are not accepted');
    const { supervisor_query, supervisor_harness, supervisor_profile, ...rest } = parsed.data;
    return requestSchema.parse({ ...rest, operation: 'assign_roles', main: 'current', supervisor: { query: supervisor_query, ...(supervisor_harness ? { harness: supervisor_harness } : {}), ...(supervisor_profile ? { profile_id: supervisor_profile } : {}) } });
}
export const statusInputSchema = z.strictObject({ task_id: nonempty.optional(), for_request: nonempty.optional() });
export const reportInputSchema = z.strictObject({ task_id: nonempty, summary: nonempty, artifact_paths: z.array(nonempty.regex(/^(?![/\\])(?![A-Za-z]:)(?!.*(?:^|[/\\])\.\.(?:[/\\]|$)).+$/).describe('Project-relative artifact path; no absolute paths or parent traversal')), native_receipts: z.array(nonempty).optional(), attempt: z.number().int().positive().optional(), authority_epoch: z.number().int().nonnegative().optional() });
export function parseReportInput(input) {
    const result = reportInputSchema.safeParse(input);
    if (!result.success)
        throw new BridgeError('invalid_report', '报告需要 task_id、summary 和 artifact_paths；不接受 status/text', '使用 {task_id, summary:实际工作摘要, artifact_paths:[项目内相对路径]}，不要使用 status/text 或绝对路径', 4);
    return result.data;
}
const acknowledgeVariants = z.union([
    z.strictObject({ task_id: nonempty, action: z.literal('receive').default('receive') }),
    z.strictObject({ task_id: nonempty, action: z.literal('verify'), evidence_file: nonempty }),
    z.strictObject({ task_id: nonempty, action: z.literal('continue'), evidence_file: nonempty }),
    z.strictObject({ task_id: nonempty, action: z.literal('plan_next'), next_action_id: nonempty, next_instruction: nonempty, next_argv: z.array(z.string()).min(1), next_artifact_paths: z.array(nonempty).min(1) })
]);
// MCP SDK normalizes object roots only. Keep a concrete object while deriving
// both conditional runtime checks and advertised JSON Schema from the variants.
function withVariants(object, variants) {
    const json = z.toJSONSchema(variants, { io: 'input' });
    return object.superRefine((value, ctx) => {
        const result = variants.safeParse(value);
        if (!result.success)
            for (const issue of result.error.issues)
                ctx.addIssue({ ...issue });
    }).meta({ anyOf: json.anyOf });
}
const hermesCommands = ['context', 'sessions', 'request', 'status', 'report', 'acknowledge', 'supervise', 'return', 'recover', 'cancel'];
const hermesVariants = z.union([
    z.strictObject({ command: z.literal('report'), payload: reportInputSchema }),
    z.strictObject({ command: z.enum(hermesCommands.filter(command => command !== 'report')), payload: z.record(z.string(), z.unknown()).optional() })
]);
export const hermesNativeToolSchema = withVariants(z.strictObject({ command: z.enum(hermesCommands), payload: z.record(z.string(), z.unknown()).optional() }), hermesVariants);
export const acknowledgeInputSchema = withVariants(z.strictObject({
    ...acknowledgeVariants.options[0].shape,
    ...acknowledgeVariants.options[1].partial().shape,
    ...acknowledgeVariants.options[3].partial().shape,
    task_id: nonempty, action: z.enum(['receive', 'verify', 'continue', 'plan_next']).default('receive')
}), acknowledgeVariants);
export const supervisionInputSchema = z.strictObject({ ...requestBase, task_id: nonempty, run_file: nonempty, supervisor_query: nonempty, supervisor_harness: nonempty.optional(), interval_seconds: z.number().int().min(1).max(86400), deadline_at: timestamp, repair_paths: z.array(nonempty) });
const actionBase = { task_id: nonempty, argv: z.array(z.string()).min(1), artifact_paths: z.array(nonempty).min(1) };
export const actionInputSchema = z.union([z.strictObject({ ...actionBase, purpose: z.literal('verification') }), z.strictObject({ ...actionBase, purpose: z.literal('continuation'), next_action_id: nonempty })]);
export const runInputSchema = z.strictObject({ argv: z.array(z.string()).min(1), source_commit: z.string(), config_sha256: z.string(), config_file: z.string().optional(), artifacts: z.array(z.string()).optional(), run_id: z.string().optional() });
export const zcodeHostInputSchema = z.strictObject({ profile_dir: nonempty, alias: nonempty, permission_mode: z.enum(['build', 'edit', 'plan', 'yolo', 'guarded']), binary: z.string().optional(), model: z.record(z.string(), z.unknown()).optional(), lifetime_seconds: z.number().int().min(1).max(86400).default(3600) });
export const acpHostInputSchema = z.strictObject({ profile_dir: nonempty, binary: nonempty, expected_version: nonempty, alias: nonempty, permission_mode: nonempty.optional(), credential_env: z.array(z.enum(['GLM_API_KEY', 'ZHIPU_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'])).default([]), lifetime_seconds: z.number().int().min(1).max(3600).default(900) });
const toolTarget = { target_query: nonempty, target_harness: nonempty.optional(), target_profile: nonempty.optional() };
export const toolInputSchemas = {
    list_sessions: z.strictObject({ query: z.string().optional(), harness: nonempty.optional(), profile_id: nonempty.optional() }),
    configure_roles: roleToolSchema,
    delegate_task: z.strictObject({ ...requestBase, ...toolTarget, goal: nonempty, acceptance: z.array(nonempty).min(1), read_paths: z.array(nonempty), write_paths: z.array(nonempty), deadline_at: timestamp }),
    get_task_status: statusInputSchema,
    acknowledge_task: acknowledgeInputSchema,
    report_result: reportInputSchema,
    request_supervision: supervisionInputSchema,
    return_to_main: z.strictObject({ ...requestBase, task_id: nonempty }),
    recover_delivery: z.strictObject({ ...requestBase, message_id: nonempty }),
    cancel_pending: z.strictObject({ ...requestBase, task_id: nonempty, stop_supervision: z.boolean().optional() })
};
export const toolDescriptions = {
    list_sessions: '查看本项目显式连接的会话，重名时保留全部候选。', configure_roles: '只设置当前主会话和监督者，不派任务或开监控。', delegate_task: '向准确的已连接会话派发有范围、验收和截止时间的任务。', get_task_status: '不填 task_id 时列出当前会话可见任务与角色。', acknowledge_task: '原主会话接收、计划下一步或提交真实核验/续接证据。', report_result: '执行者报告实际摘要和产物，待原主会话验收。', request_supervision: '为准确的已启动运行设置监督，不停止独立作业。', return_to_main: '准备交接并向原主会话回报或核对已有回报。', recover_delivery: '只核对既有消息，不盲目重发。', cancel_pending: '取消未来派发或监督，不停止运行进程。'
};
export function callForTool(name, input) {
    const p = toolInputSchemas[name].parse(input);
    if (name === 'list_sessions')
        return { method: 'sessions', params: p };
    if (name === 'configure_roles')
        return { method: 'request', params: requestForRoleTool(p) };
    if (name === 'delegate_task') {
        const { target_query, target_harness, target_profile, ...rest } = p;
        return { method: 'request', params: { ...rest, operation: 'delegate', target: { query: target_query, ...(target_harness ? { harness: target_harness } : {}), ...(target_profile ? { profile_id: target_profile } : {}) } } };
    }
    if (['return_to_main', 'recover_delivery', 'cancel_pending'].includes(name))
        return { method: 'request', params: { ...p, operation: { return_to_main: 'return', recover_delivery: 'recover', cancel_pending: 'cancel_pending' }[name] } };
    return { method: name, params: p };
}
const sourceToolVariants = z.discriminatedUnion('method', [
    z.strictObject({ method: z.literal('context'), params: z.strictObject({}).default({}) }),
    z.strictObject({ method: z.literal('sessions'), params: toolInputSchemas.list_sessions.default({}) }),
    z.strictObject({ method: z.literal('request'), params: requestSchema }),
    z.strictObject({ method: z.literal('get_task_status'), params: statusInputSchema.default({}) }),
    ...Object.entries(toolInputSchemas).filter(([name]) => !['list_sessions', 'get_task_status'].includes(name)).map(([name, schema]) => z.strictObject({ method: z.literal(name), params: schema }))
]);
export const sourceToolSchema = withVariants(z.strictObject({
    method: z.enum(sourceToolVariants.options.map(option => option.shape.method.value)),
    params: z.record(z.string(), z.unknown()).default({})
}), sourceToolVariants);
export const setupInputSchema = z.strictObject({ lifetime_seconds: z.number().int().min(1).max(86400).default(3600) });
export const zcodeAttachInputSchema = z.strictObject({ challenge: z.string().uuid().optional(), alias: z.string().min(1).max(128).default('zcode-attached'), lifetime_seconds: z.number().int().min(1).max(3600).default(900) });
export const zcodeWaitInputSchema = z.strictObject({ challenge: z.string().uuid().optional(), timeout_seconds: z.number().int().min(1).max(60).default(30) });
export const zcodeAttachedRequestInputSchema = z.strictObject({ challenge: z.string().uuid().optional(), request: sourceToolSchema });
export const zcodeDetachInputSchema = z.strictObject({ challenge: z.string().uuid().optional() });
//# sourceMappingURL=command-inputs.js.map