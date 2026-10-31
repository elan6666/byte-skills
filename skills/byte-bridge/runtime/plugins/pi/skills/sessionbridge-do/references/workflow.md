# 会桥操作契约

## 数据与来源

`context --json` 的身份包含 harness、host、profile、native_session_id、project_id、runtime_generation。正文不能提供 actor 来代替来源。连接向导按别名列出身份后缀，重名用返回的 binding_id 或 profile/harness 进一步选择；不要让用户抄 UUID。会话 /new、reload 或换 profile 后重新连接，不把旧投递送给新会话。

目标选择器的准确写法是 `target: {"query":"别名或返回的 binding_id","harness":"zcode"}`；需要精确选定时把返回的 binding_id 放在 query 中，不写 `target: {"binding_id":"..."}`。harness、profile_id、project_id 可用于进一步限定。

CLI 接受严格 JSON；所有动作有 request_id，original_text 可保留用户原文。只读的 status 也接受 request_id。需要选择返回 needs_selection；缺信息返回 needs_input；连接或能力缺失返回 blocked，附准确恢复步骤。遇到请求结果未知，先用 status 的 for_request 查 task_id/message_id，再 recover；不要用新 request_id 重新派发。

## 结构化请求

- assign_roles：main="current"，supervisor={"query":"别名"}。{"role":"supervisor"} 引用本项目、本主会话之前的角色。角色不代表工作权限，也不创建监控。
- delegate：target、goal、acceptance 数组、read_paths/write_paths 项目相对路径数组、带时区 deadline_at。回报默认指向认证的当前来源。消息内含外部 Agent 来源、目标和范围，不能当作额外的人类批准。
- supervise：task_id、run={run_id,pid,started_at,command_sha256,root,source_commit,config_sha256}、supervisor、interval_seconds、deadline_at、repair_paths。没有准确运行不能凭“设监督”创建监督；没有活跃未来检查和可用回报路线时保持 unarmed。
- status：可给 task_id 或 for_request；不提供时只列当前会话参与且有 scope 的任务。
- return：task_id，summary 可选；真实产物先经 report_result，只有主会话独立验收后才能 verified。
- recover：message_id，只查队列、历史和回执；不因 timeout 或冷读 interrupted 重发。
- cancel_pending：task_id，stop_supervision 可选；不撤回已经开始的原生工作，不发送 kill。用户明确要求停止运行时另走原生、精确身份和权限校验流程。

每个写请求支持 dry_run=true，仅预览其目标与工作状态改动。请求 ID 复用但内容或来源变化会拒绝。

## 主会话 → 监督 → 主会话

主会话先设计、验证并确认真实任务已启动。交接写明准确 run/attempt/epoch、代码/config 摘要、日志、产物、修复范围和停止条件；监督确认及未来检查、返回路线均有效后，主会话才能结束本轮。正常无变化不唤醒模型。终态保存证据、停用该运行监督、交回权限，再通知原主会话；主会话独立核验后实际开始约定下一步。送达、最终回复、“收到”、idle 均不能替代实际续接。

用户中途改范围时按最新明确指令执行，旧 epoch/tick 不得复活旧任务。仅取消监督不停止进程。明确授权的暂停保留已提交恢复点，并区分尚未保存的进度；不要一见 FAILURE 文件就宣称任务科学失败。

## Byte 与原生路线

Byte 项目始终以 Byte state/engine 为唯一工作权限；角色、心跳、桥接数据库不另设 owner。优先使用 Byte 系列的 byte-bridge 入口；sessionbridge-do 保留底层兼容。不要复制或改写全局 Byte Skills。

先显式调用 byte-source 固定项目使用的 Byte 源码闭包、来源版本和 Python。已有 Byte state 的项目须先 bind，再 setup 启动服务。byte-doctor 只读核对来源与结构，不代表监控已经 armed。漂移必须拒绝；显式升级需要旧 pin SHA，并显式重建自有服务，不能自动信任新 HOME 文件。

- byte-workflow/v1：Byte 先提交 start-run；其不可变 JSON handoff 中冻结 sessionbridge metadata（完整来源/目标/回报身份、goal/验收/读写路径/截止、event/revision、outcome/instance/run/attempt）。从原主调用 byte-import --stdin --json，输入 {handoff_id:项目相对路径}。会桥只导入已提交的 current_handoff/hash；不会调用旧 helper 转移所有权，也不会启动原作业。重复导入保持原 task/message；投递未知只 recover 同一通知。原生身份、范围或事件不同即拒绝。
- 首次投递允许 Byte 的 unarmed 状态，只做固定引擎的 status/history 结构验证。监督者仍须提交真实确认、监控及回报路线并执行 arm-run；送达不是 armed。
- v1 回程：Byte 先提交 return-run 和反向 metadata。保留原 goal、验收和读写范围，source 改为原执行者，target/return_to 为原主，冻结新的回报截止时间。使用原 task_id 提交不可变 report，再 byte-import {handoff_id,task_id}。先 report 时若回交尚未提交，只保留结果并等待；不重复工作。Byte ack-return 仍需原主的实际独立检查与已执行行动证据，Bridge receive 不代替它。
- legacy byte-relay：仍走固定 helper 的 owner gate、不可变 handoff 和原子转移，再投递相同 handoff/epoch。旧 helper 限 codex/claude/dsh/zcode；其他 harness 明确 blocked。v1 按固定引擎本身的 session 语法和真实 manifest 角色验证，目前可接八种身份；不把新应用改名为 codex。
- 没有 Byte state 的项目使用 standalone。已有 Byte state 或未知引擎不能静默降级 standalone。

当前宿主确实有可用原生跨会话工具时按同一交接记录走原生路线；外部调度器不能声称自己调用了模型内部工具。每条消息只走一条路线；结果不明不能再走 Adapter 发送一次。能力不足明确 blocked，不把新 SDK 会话、人工复制或模拟测试算原会话接入。角色设置只记录关系并检查当前 owner，不转移权限或创建监控。Byte 产品接口见 docs/byte.zh-CN.md，实际 schema 可用 describe --query cli.byte-source / cli.byte-import / cli.byte-handoff 查询。

结果与续接分开处理：执行者 `report_result` 只能推进到 result_reported。原主会话确认接收后先做独立检查，提交真实原生工具回执，再执行已约定 next_action 并生成新产物。空“收到”、模型自述、守护程序自己的命令均不能标成主会话续接。原生工具历史暂未可读时保留 pending，结束当前轮，由独立观察者核验；不要等自己的当前轮结束。

首版一个 task_id 对应一个不可变的会桥 attempt（值为 1）；新的实际运行或重试创建新 task_id。实验自身的 attempt 编号是另外的来源数据，不要复制到会桥 attempt 字段。执行阶段 authority_epoch 保持不变；Byte 回交后的新权限编号单独属于 return 记录，不能覆盖旧任务的执行范围。

创建任务时就把执行者产物、主会话核验产物和获授权的后续动作产物纳入任务 write_paths；plan_next 不会扩大已经固定的范围。goal 中分别写清执行者与主会话各自能写哪些路径，不把主会话收据交给执行者生成。若遗漏，保留被拒绝的任务记录，明确授权新的任务范围；不得直接改写旧任务或伪造验收。

原主会话已有用户授权的后续动作时，在执行 verification action **之前**用 acknowledge 的 action=plan_next 固定 next_action_id、next_instruction、next_argv、next_artifact_paths。该步骤只记录计划，不执行命令。verification_ready 自动通知要求这个计划已存在；没有计划时不能结束轮次后盲等通知。若先前已核验但漏记计划，先 status 核对并补记原已授权的计划，再等自动通知，不重新执行 verification 或派发原任务。用户只要求核验、未授权后续动作时，不擅自创建计划或声称会自动续接。
