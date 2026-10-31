# Kimi Code and OpenCode

[简体中文](acp.zh-CN.md) · [Compatibility](support.en.md)

## Explicit managed ACP hosts

Run `session-bridge setup --harness kimi --with opencode --project /absolute/project --json`, then inspect `session-bridge describe --query cli.host.kimi --json`. Configure an isolated native profile first. Supply host configuration on stdin to `session-bridge host --harness kimi --project /absolute/project --stdin --json` (or `--harness opencode`):

```json
{
  "profile_dir": "/absolute/isolated-profile",
  "binary": "/absolute/native-agent",
  "expected_version": "2.4.1",
  "alias": "kimi-worker",
  "credential_env": ["GLM_API_KEY"],
  "lifetime_seconds": 900
}
```

The example Kimi version is2.4.1; OpenCode is1.19.5. Use actual paths and the verified installed version. Secrets are passed only through explicitly selected environment variables, never CLI arguments, this JSON, or source files. Existing application credentials are not copied.

Each host owns a new native ACP process and exactly one session. Same-harness collaboration uses separate isolated profiles/processes, because native MCP configuration may be shared within one ACP process. Bindings are `managed`. No loading/resuming/cancelling sessions from another running TUI. Each source MCP token belongs to one native session, whose ID comes from ACP, not the model. An optional `permission_mode` must match a mode advertised by the native session; the default preserves native settings. The connector never approves reverse permission requests: those requests are declined. Automatic execution requires an explicitly authorized native mode/policy in this isolated profile.

Hosts have absolute deadlines. Native requests wait approximately two minutes by default; timeout is uncertain, not permission to resend. Stopping an owned host disconnects its bindings and native process group; it does not stop other applications. Manage the project coordination service separately with `service status|stop`.

## Isolated GLM profiles

Configure only your new `profile_dir`. Keep `GLM_API_KEY` in your local secret manager/environment and explicitly list it in `credential_env`; never put its value in the JSON input or source files.

Kimi reads `<profile_dir>/.kimi-code/config.toml`:

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

OpenCode reads `<profile_dir>/.config/opencode/opencode.json`:

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

These examples preserve native permission defaults. Any unattended allowed-tool policy must be explicitly configured by the user in this dedicated profile. The bridge does not approve tools. GLM reasoning can take time; an uncertain timeout is not permission to repeat a task.

## An already-open OpenCode session

Project installation prepares `.opencode/plugins/sessionbridge.js` and the plugin payload. The original application must load the project plugin; installation does not restart or inject into a plugin-free terminal. Within a plugin-enabled original session, call the native `sessionbridge_request` tool with `{"method":"context","params":{}}` after an ordinary conversation. Identity comes from native ToolContext.sessionID and is checked against native session/project metadata. Shared plugin transports do not share source identities.

Call `sessionbridge_wait({"timeout_seconds":30})` to receive authorized work. This is active native-tool intake, at most60seconds per wait and15minutes per connection, not automatic idle wake. Cancellation and expiry are checked before receipt. External-agent data never expands native permissions. Report actual files through `sessionbridge_request({"method":"report_result","params":{"task_id":"actual-id","summary":"actual result","artifact_paths":["workspace/worker/result.py"]}})`.

A main using active intake must keep waiting to receive results. Delivery, native acceptance, independent verification and core verified/main_continued remain distinct.

## Kimi TUI boundary and GLM

Kimi support currently uses explicit managed ACP sessions, not another running TUI. Old0.28.1 failed the isolated custom-GLM ACP gate; no user OAuth credentials were borrowed. Version2.4.1 is tested independently.

GLM tests use `glm-5.3-flash` and the Coding Plan OpenAI endpoint `https://open.bigmodel.cn/api/coding/paas/v4`; Claude uses `https://open.bigmodel.cn/api/anthropic`. Each harness retains its native provider configuration. The coordination service itself requires no model key.
