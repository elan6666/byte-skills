# 兼容性与限制

[English](support.en.md) · [简体中文](support.md) · [返回首页](../README.zh-CN.md)

SessionBridge 0.1 是本地会话接入原型。连接成功、消息送达、模型执行和任务验收是不同状态。用户应按应用版本、会话模式和实际任务分别确认能力。

## 运行条件

- 核心需要 Node.js 24.15.x–24.x。当前本地通信实现面向 macOS/Linux；Windows 接入尚未验证。
- 每个参与聊天需要在原应用内连接所选项目。部分应用需要显式启用插件或重载扩展。
- 周期监督需要项目协调服务保持运行。电脑休眠会暂停本地服务和作业；恢复后继续检查，不保证即时响应或自动重启应用。
- 应用原有账号、模型访问和工具权限继续由原应用管理。

## 应用连接

| 应用 | 接入方式 | 使用边界 |
| --- | --- | --- |
| Codex | 原聊天 connect、匹配桌面版本的原生队列与只读历史 | 精确适配 0.163.0-alpha.11、0.163.0-alpha.11.2 、0.164.0-alpha.11.1 与 0.166.0-alpha.5.1；桌面是唯一执行者；归档、未加载或已关闭聊天不保证唤醒；升级后重新验证 |
| Claude Code | 原生插件生命周期与 later inbox | 接口适配 2.1.306；需原应用启用插件；工具执行受 Claude 权限约束 |
| Pi | 原生扩展与 followUp | 接口适配 1.3.0；切换或重载会话后旧连接失效；不通过 interrupt 抢占执行 |
| dsh | Web/Desktop Cordis 插件绑定原 Agent | 接口适配 0.2.1-rc.2；Web 模式支持范围较明确，任意桌面实例需另行确认；各入口语法以原应用能力为准 |
| Hermes | 原生插件与 canonical gateway TUI 队列 | 普通 CLI 的忙碌注入受限，桌面 GUI 接入尚未验证 |
| ZCode | 原会话原生 MCP 主动收件 ＋ 专用 App Server | 0.17.0 精确版本；`attached/native_tool_pull` 需原会话显式插件与限时 wait，不自动唤醒空闲聊天。`managed` 需独立 profile。权限由原应用决定。见[上手](zcode.zh-CN.md)。 |
| Kimi Code | 独立 ACP 原生进程 | 2.4.1；`managed`，每进程一会话，使用独立 profile。已有 TUI 接入不受支持；旧0.28.1自定义 GLM ACP 未通过。见[指南](acp.zh-CN.md)。 |
| OpenCode | 独立 ACP ＋ 原生项目插件主动收件 | 1.19.5；ACP 每进程一会话。原会话需预先启用项目插件并主动 wait，不自动唤醒。GUI 单独验收，不由 CLI 结果推定。见[指南](acp.zh-CN.md)。 |

版本号表示接口适配条件，不是自动升级要求。插件安装不会重启应用或接管其他聊天。

## 原会话与新会话分别看

以下是指定版本的范围，不代表任意 GUI 或所有主控组合都已通过：

| 应用 | 已打开的原会话 | 新建专用会话 |
| --- | --- | --- |
| Claude Code | 原 CLI 先对话后 `/reload-plugins`，保留原会话和进程；需要原生允许 | 独立 CLI/profile；工具按原生权限执行 |
| dsh | 原 Cordis Host 内原 Agent，插件绑定原生上下文；Web/Desktop 边界分别确认 | 独立原生 Host/profile，使用相同插件 |
| Hermes | 已启用原生插件的 canonical gateway TUI；普通 CLI 和未测 GUI 不等价 | 独立 profile 的真实 TUI/gateway |
| Pi | 原 CLI 会话加载或重载扩展；不通过 interrupt 抢占 | 独立 CLI/profile 与原生扩展 |
| Kimi Code | **不支持接管另一个已运行 TUI** | 2.4.1 独立 ACP，每进程一会话 |
| OpenCode | 1.19.5 已启用插件的原生服务器会话，需主动限时 wait | 独立 ACP；同应用双会话各用独立进程/profile |

上述六种应用已使用 GLM Coding Plan `glm-5.3-flash` 完成真实软件任务、执行测试、回报和原主检查；原主为 OpenCode。OpenCode 另验证同一原生服务器内两条已打开会话的派发、回报、核验与取消待收任务。任务程序另经独立边界用例检查。一次通过不等于全组合、长期稳定或自动唤醒认证；非 Codex 的 `verified/main_continued` 行动证明仍受下节限制。

## 任务与恢复

- 消息发送结果不明时保留原编号，使用 recover 对账。不要换编号或通道盲目重发。
- 服务记录任务、运行身份、产物摘要和回报。进程退出或聊天回复不能单独证明任务达标。
- 原主聊天需要实际核验结果。通用的原生命令行动证明目前主要用于 Codex，其他宿主不承诺等价能力。
- cancel 取消未来投递或监督，不会停止独立运行的作业。
- 本工具的权限范围用于防止误投和错误归属，不是针对同一操作系统用户下任意程序的安全沙箱。

## 可选项目管理集成

普通项目使用独立任务模式。已有 Byte 项目以其 state/engine 为唯一工作权限；先显式固定项目源码，再运行服务。v1 仅导入引擎已提交的 start-run/return-run handoff，原生角色语法由固定引擎校验，当前可接受八种应用身份；这属于引擎与传输契约验证，不等同于八种运行中应用都完成了 Byte 实操。legacy relay 保留旧接口及 codex/claude/dsh/zcode 限制，其他宿主明确 blocked。Bridge 不调用 v1 所有权变更、不替代 arm-run/ack-return；未配 pin、漂移或未知引擎均拒绝写入，不降级 standalone。见 [Byte 接入](byte.zh-CN.md)。
