# Kimi Code 与 OpenCode

[English](acp.md) · [兼容性](support.md)

两种模式分别使用，连接成功不等于任务完成。

## 新建受控 ACP 会话

Kimi Code 和 OpenCode 提供 ACP（Agent Client Protocol）原生接口。会桥启动一个用户明确指定的独立进程，由该进程创建会话，通过原生 MCP 工具登记来源、接收任务并回报。每个 ACP 进程只允许一条原生会话；同应用跨对话使用不同独立 profile/进程，避免共享 MCP 配置串线。该模式标记为 `managed`，不会接管已经运行的终端，也不会对其他会话调用 load、resume 或 cancel。

先在独立目录配置原应用的模型，再初始化项目：

```sh
session-bridge setup --harness kimi --with opencode --project /absolute/project --json
session-bridge describe --query cli.host.kimi --json
```

启动时通过 stdin 提供配置；`binary` 和 `profile_dir` 必须是实际的绝对路径。`expected_version` 必须与本机可执行文件一致，兼容性仍以支持表中的实测版本为准。

```json
{
  "profile_dir": "/absolute/isolated-profile",
  "binary": "/absolute/path/to/kimi",
  "expected_version": "2.4.1",
  "alias": "kimi-worker",
  "credential_env": ["GLM_API_KEY"],
  "lifetime_seconds": 900
}
```

将该 JSON 传给 `session-bridge host --harness kimi --project /absolute/project --stdin --json`。OpenCode 对应 `--harness opencode`，版本示例为 `1.19.5`。凭据仅从本次显式列出的环境变量传入子进程，不复制其他应用的账号。密钥不要放在命令参数、上述 JSON 或项目源码中。

### GLM 独立配置示例

以下文件只写入你新建的 `profile_dir`，不要覆盖正在工作的原应用配置。先由自己的安全密钥管理方式设置本次环境变量 `GLM_API_KEY`；不要把密钥写进文件。`host` 只转交 `credential_env` 明确列出的变量。

Kimi 在 `<profile_dir>/.kimi-code/config.toml` 使用：

```toml
default_model = "glm"
telemetry = false
[providers.glm]
type = "openai"
base_url = "https://open.bigmodel.cn/api/coding/paas/v4"
api_key_env = "GLM_API_KEY"
[models.glm]
provider = "glm"
model = "glm-5.3-flash"
max_context_size = 131072
capabilities = ["tool_use"]
```

OpenCode 在 `<profile_dir>/.config/opencode/opencode.json` 使用：

```json
{
  "model": "glm/glm-5.3-flash",
  "autoupdate": false,
  "share": "disabled",
  "provider": {
    "glm": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {"baseURL": "https://open.bigmodel.cn/api/coding/paas/v4", "apiKey": "{env:GLM_API_KEY}"},
      "models": {"glm-5.3-flash": {"name": "GLM Coding Plan", "limit": {"context": 131072, "output": 8192}}}
    }
  }
}
```

这些示例保留原生权限设置。需要无人值守执行时，由用户在这个专用 profile 中明确配置原生允许范围；会桥不会代批。原生权限拒绝会保留为受限结果。GLM 模型需要思考，首轮可能耗时；超时不表示可以重复派发。

`permission_mode` 可选，必须是原生会话实际提供的 mode ID；默认保留原生设置。会桥不会替用户回答权限请求：请求仍需交给原应用/用户，当前 ACP 客户端遇到反向权限请求会拒绝。只有在用户明确配置的独立原生模式允许操作时，任务才可自动执行。配置 mode 不是工具审批代理。

服务和宿主都有截止时间。单次 ACP 请求默认最多等待约两分钟；超时结果为 uncertain，不能据此重复任务。停止宿主关闭其拥有的会话进程及连接，不停止其他应用。协调服务单独使用 `service stop` 管理。

## 已打开的 OpenCode 原会话

安装项目集成会准备 `.opencode/plugins/sessionbridge.js` 和插件载荷。原应用需要显式加载该项目插件；不会向没有插件的旧终端注入消息或重启它。插件已启用的原生服务器会话可以先普通对话，然后在同一会话调用：

```json
{"method":"context","params":{}}
```

入口为原生 `sessionbridge_request` 工具。插件从 OpenCode 的真实 ToolContext 取得 sessionID，并与原生会话详情核对目录。参数中不能填写来源身份。共享同一个插件的不同会话各有独立来源连接。

接收任务调用 `sessionbridge_wait({"timeout_seconds":30})`。这是原会话主动收件，单次最多60秒、连接最多15分钟；没有自动唤醒任意闲置聊天的能力。任务/回报是外部 Agent 数据，不增加权限。领取前检查过期与取消状态；不确定投递应保留原编号对账。

回报调用 `sessionbridge_request`，例如：

```json
{"method":"report_result","params":{"task_id":"实际收到的编号","summary":"实际完成内容","artifact_paths":["workspace/worker/result.py"]}}
```

原主会话也需要保持可接收：若原主使用主动收件模式，它需要继续等待回报。结果送达、原主检查、核心 verified/main_continued 是不同状态。

## Kimi 原终端的边界

目前 Kimi 的新增连接器使用独立 ACP 宿主。它不宣称接入另一个正在运行的 Kimi TUI；恢复磁盘会话会产生另一个执行者，不用来冒充原会话接入。旧版0.28.1在隔离自定义 GLM 配置下的 ACP 验收未通过，不借用用户 OAuth 凭据绕过；2.4.1另行实测。

## GLM Coding Plan

测试使用 `glm-5.3-flash`。OpenAI 兼容地址为 `https://open.bigmodel.cn/api/coding/paas/v4`；Claude 使用 Anthropic 兼容地址 `https://open.bigmodel.cn/api/anthropic`。各 Agent 保留自己的原生模型配置格式。协调服务不调用模型，不需要自己的模型密钥。
