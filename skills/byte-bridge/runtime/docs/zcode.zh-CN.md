# Codex 与 ZCode 一起开发

[English](zcode.md) · [返回首页](../README.zh-CN.md)

## 已打开的 ZCode 原会话（attached）

先从当前 Codex 主会话运行：

```bash
session-bridge setup --harness codex --with zcode --project /path/to/project --json
```

默认启动一小时的本地协调服务，重复执行复用同一服务且不延长期限。`needs_connection` / `needs_activation` 表示仍需原生连接，不是任务执行失败。服务检查／关闭用 `service status|stop --project /path/to/project`。此命令不启动模型，不改现有 provider，不重启应用。

安装后，在选定 ZCode 项目的 `.zcode/config.json` **合并**以下配置，保留其他现有字段：

```json
{
  "features": {"mcp": true},
  "plugins": {
    "enabled": true,
    "dirs": ["/path/to/project/.session-bridge-plugins/zcode"]
  }
}
```

由原应用加载／启用插件。更新文件后，原应用可能仍缓存旧 MCP 进程，需使用其原生重载入口；核对实际绑定的 generation 和期限，不能只根据模型口头确认认定新版已加载。不要重启工作会话。在当前会话让 Agent 查找 `sessionbridge_attach`，以 alias=`zcode-worker`、lifetime_seconds=900 连接。首次返回 challenge，保持所有原参数不变，只加入实际 challenge 再调用；**每次** wait/request/detach 也执行同样两步。来源来自这一轮原生工具历史，不填写来源会话 ID。若原应用尚未加载工具，使用其插件启用入口；不自动重启工作会话或另开替代聊天。

连接结果应明确为 `mode: attached, intake: native_tool_pull`。然后让原 Agent 在你授权的时间内调用 `sessionbridge_wait({timeout_seconds:60})`，按需再次等待；领取实际信封后执行约定范围内工作。停止主动等待后不会自动唤醒任意空闲聊天。原生权限确认仍然有效，插件不会代批；无人值守能力取决于用户本来授予的原生工具权限。

原会话其他调用通过 `sessionbridge_request({request:{method,params}})`，首次 challenge 后重复；例如 context、sessions、report_result。回报参数为 task_id、真实 summary、实际 artifact_paths。这个嵌套外壳与下方 managed 模式的 `{method,params}` 不同。`sessionbridge_detach({})` 只断开当前来源；不关闭其他会话。

连接有期限。断线／过期后原绑定失效，需要原会话显式重连；runtime generation 会改变。已领取但没回报的工作保留不确定状态，先用原 message_id 对账，不重发、不把“入队”当作完成。协调器可以停止／重新 setup，原 Agent 进程不由协调器执行；恢复后检查原任务与绑定再继续。电脑真休眠期间所有本地进程暂停，恢复后仍需检查时限和身份；已在专用原桌面会话验证一次真实 macOS 休眠恢复，同一检查进程继续并回报；macOS 的后台唤醒（DarkWake）可先恢复进程，前台网络流仍可能需要原生会话恢复；保留任务编号对账，不重新执行工作。长时间休眠与其他宿主仍需分别验收。系统定时唤醒不由会桥核心管理。

## 专用 App Server（managed）

## 1. 安装并初始化

先按首页从源码构建和安装。将下方 `/path/to/project` 换成实际开发项目目录：

```bash
session-bridge init --project /path/to/project
session-bridge install --harness codex --scope project --project /path/to/project
session-bridge install --harness zcode --scope project --project /path/to/project
```

另开终端保持项目服务运行：

```bash
session-bridge daemon start --project /path/to/project
```

安装仅放置项目文件，不改现有应用的模型、账号、插件配置，也不重启工作会话。

## 2. 启动专用 ZCode 执行会话

准备一个**单独的、已配置模型访问的原生 ZCode profile 目录**，保持其配置和历史与工作中的应用隔离。会桥不会复制其他应用凭据。当前适配 macOS 桌面随包的 `Resources/glm/zcode.cjs` 及其相邻 provider 资源；其他位置可通过配置中的绝对 `binary` 路径显式选择，并需版本核对。

把下面 JSON 保存为项目私有的 `.session-bridge/zcode-start.json`；其中没有 API Key。`profile_dir` 指向独立 profile 的 home，而非 `.zcode/cli` 子目录。模型配置由原生 ZCode 从该 home 的 `.zcode/v2/provider_config.json` 读取；请按 [ZCode 官方配置文档](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/03-config.md) 配置模型访问，不在会桥公共文件里放 Key。

```json
{
  "profile_dir": "/path/to/dedicated-zcode-home",
  "alias": "zcode-worker",
  "permission_mode": "build",
  "lifetime_seconds": 3600
}
```

`permission_mode` 必须显式选择：`build`、`edit`、`plan`、`yolo` 或 `guarded`，含义由原生 ZCode 决定。会桥不代批权限请求；需要交互确认的调用可能保持受阻。仅在你明确接受原生工具可直接执行的专用环境中选择 `yolo`。时间到或 Ctrl-C 会关闭本次专用执行者；不会终止其他应用或进程。

```bash
session-bridge host --harness zcode --project /path/to/project --stdin \
  < /path/to/project/.session-bridge/zcode-start.json
```

它先用原生工具登记来源，再输出 `state: connected`。保持这个终端运行。启动消息、模型回复和入队回执分别记录，不能据此声称任务已经完成。

## 3. 连接 Codex 原聊天

让选定的 Codex 聊天自己执行；聊天原生工作目录须包含选定项目：

```bash
session-bridge connect --harness codex --alias codex-main --project /path/to/project
session-bridge context --project /path/to/project --json
session-bridge sessions --project /path/to/project --json
```

已打开的应用若找不到命令，使用安装位置的绝对可执行路径，如 `$HOME/.local/sessionbridge/node_modules/.bin/session-bridge`。不填写或借用其他聊天的原生身份。新聊天可加载项目 `.agents/skills`；现有聊天可以显式读取所安装的 Skill。

## 4. 提出任务

在 Codex 中说：

```text
$sessionbridge-do 使用当前聊天作为主会话。
让已连接的 zcode-worker 实现 CSV 校验工具，读取 requirements.md，
只修改 src/、tests/、output/，20 分钟内完成。
验收：规范中的边界测试通过，输入文件不变。
让它回报实际文件和测试结果，由当前会话独立核验。
```

主聊天通过原生队列派发；ZCode 通过本会话的 `sessionbridge_request` 工具回报，标准服务自动回原主。主聊天接收后检查真实文件和测试结果；需要机器可核对的 `verified` / `main_continued` 状态时，使用 Codex 原会话 `action` 路线，见 [命令参考](cli.zh-CN.md)。

ZCode 忙碌时，会桥自己的私有队列等待当前轮次结束，不中断或恢复其他进程的会话。取消尚未送入原生执行者的消息可阻止后续派发。提交结果不明时保留原编号，先 recover；不会盲目重发。专用宿主退出后原连接失效，当前不承诺原会话进程重启恢复。
