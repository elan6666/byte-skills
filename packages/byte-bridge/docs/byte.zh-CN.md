# Byte 接入

[English](byte.md) · [命令](cli.zh-CN.md)

Byte state/engine 唯一管理工作权限、修订、运行交接和验收；会桥管理原生连接、投递与回执。Byte 系列统一使用 byte-bridge，sessionbridge-do 保留底层兼容。

已有 Byte 项目先显式固定来源，再启动服务。向 `session-bridge byte-source --project /项目绝对路径 --stdin --json` 输入：

```json
{"source_root":"/Byte仓库绝对路径/skills","source_commit":"实际来源版本","python_bin":"/Python可执行文件绝对路径"}
```

也可选择含 skills/ 的 Byte 仓库根。relay/workflow 的全部 Python 源文件和 Python 本体哈希固定在项目私有 `.session-bridge/byte-source.json`；不自动信任 HOME。`--dry-run` 只预览；升级需旧 `expected_pin_sha256`，并发 bind 使用独占锁。来源漂移拒绝写入；旧 provider 在 pin 改变后拒绝继续，需显式重建自己的服务，不能重启别人的活动服务。

`byte-doctor --project PATH --json` 只读检查。v1 调用固定引擎自身的 status/history 与会话语法验证，返回 structural_status_only、native_scheduler_verified=false。首次通知可在 unarmed 状态送达，让监督者建立真实监控与回报路线，再提交 arm-run；送达不等于 armed。

使用顺序：

1. 各原会话连接项目，从 context/sessions 取完整原生身份，不猜 ID。
2. 在 coordination/handoffs/ 创建不可变 JSON，sessionbridge metadata 固定完整范围、准确身份、outcome/instance/run/attempt、未来 event_id 和提交后的 revision。真实结构查 `describe --query cli.byte-handoff --json`；Byte 起草工具不改变 owner。
3. Byte 用真实启动证据和同一 handoff/event/revision 提交 start-run。
4. 原主执行 byte-import，输入 `{handoff_id:项目相对路径}`。会桥核对已提交哈希、最新交接事件、当前 owner、冻结范围及各绑定的 profile/generation，再运输。重复导入保持原 task/message；未知投递只 recover，不重启作业。
5. 监督者用实际证据提交 arm-run，Bridge 不代填或代批。
6. 终态后 Byte 先提交 return-run 和反向 metadata：原执行者为 source，原主为 target/return_to；goal、验收和读写路径不变，固定新截止时间。
7. 用原 task_id 提交不可变 report，再 byte-import `{handoff_id,task_id}`。先 report 时若尚未交回，只保存结果并等待；交回后再 report 同样可行，不重复转移权限。
8. 原主独立检查并实际执行已授权行动，再满足 Byte ack-return 的证据要求；Bridge receive 不能代替它。

通知的 epoch 是已提交交接的 revision；之后 arm-run 可以增加 revision 而保留同一 current_handoff。过时运行、扩大范围、冻结路径冲突、原生 generation 变化、绑定歧义或来源漂移均拒绝。Byte state 存在或引擎未知时，不自动降级 standalone。

legacy relay 保留固定旧 helper 和四宿主限制。v1 不调用它转移权限；当前引擎语法接受八种应用，旧固定版本可能拒绝新名称。引擎/传输回归不等同于各应用真实模型、GUI 或调度全部验收。

旧的在途 handoff 若无 Bridge metadata，沿原来已记录的单一通道完成，不中途改写、导入或重发；在明确安全边界切换后续新交接。已有 Byte 原生 heartbeat 可继续使用，不要求再开 Bridge lease。若选择 Bridge 监督，已提交 run_launch 的 process.bridge_identity 必须是实际自有本地运行的完整 RunIdentity；注册前核对原任务、run/attempt、启动/命令/config/来源与进程证据，缺失即 blocked，不猜 PID 或重启工作。Bridge 自有 run_id 不可跨 Byte attempt 复用；保留原生监控即可。同输入 lease 幂等，更改周期/截止/路线需先停旧 lease；提交时复查取消、终态、绑定与截止，不复活已取消的轮询。
