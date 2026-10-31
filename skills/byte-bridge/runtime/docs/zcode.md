# Develop with Codex and ZCode

[简体中文](zcode.zh-CN.md) · [Back to README](../README.md)

## Attach an already-open original ZCode conversation

From the original Codex main chat:

```bash
session-bridge setup --harness codex --with zcode --project /path/to/project --json
```

This starts a one-hour bounded local core; repeated setup reuses its original deadline. `needs_connection` / `needs_activation` means native enrollment is still required. Inspect or stop the owned service with `service status|stop --project /path/to/project`. Setup starts no model, changes no provider, and restarts no app.

Merge into the selected ZCode project's `.zcode/config.json`, preserving its existing fields:

```json
{
  "features": {"mcp": true},
  "plugins": {
    "enabled": true,
    "dirs": ["/path/to/project/.session-bridge-plugins/zcode"]
  }
}
```

Enable/load the plugin through the original app. After an update, the app may cache the previous MCP process; use its native reload path and verify the actual binding generation and deadline instead of trusting a model's description. Do not restart working conversations. Ask the current agent to find `sessionbridge_attach`, using alias `zcode-worker` and lifetime_seconds 900. The first call returns a challenge: repeat the exact same input with that challenge added. **Every** wait/request/detach call uses this two-step proof too. Never supply a source session ID. If the app has not loaded the tools, use its native activation path; do not restart working conversations or create substitute chats.

Expect `mode: attached, intake: native_tool_pull`. Within the user's authorized deadline, call `sessionbridge_wait({timeout_seconds:60})` and wait again if appropriate. The original agent receives the actual envelope and works within its granted scope. There is no arbitrary idle-chat wake after the agent stops waiting. Native permission prompts remain in force; the plugin grants no permissions. Unattended operation depends on the permissions the user already chose in the native app.

Use `sessionbridge_request({request:{method,params}})` for context, sessions, report_result and other operations, repeating with the returned challenge. report_result takes task_id, actual summary and artifact_paths. This nested input differs from managed mode's `{method,params}`. `sessionbridge_detach({})` disconnects only this caller.

Expiry or disconnect invalidates the original binding; explicitly reconnect from that conversation, observing the new runtime generation. Claimed work without a report remains uncertain: reconcile its original message_id rather than resending or declaring completion. You may stop/restart the coordinator without taking over the native executor; recheck bindings/tasks afterward. Whole-machine sleep pauses local processes; check deadlines and identities after wake. One actual macOS sleep/wake was validated in a dedicated original Desktop conversation, with the same check process continuing and reporting. macOS DarkWake can resume background work before foreground network streams recover; a native session may need explicit recovery. Reconcile existing task IDs without rerunning work. Long sleep and other harnesses require separate validation. OS wake scheduling is outside the bridge core.

## Dedicated App Server (managed)

## Initialize the project

Build and install from the README, then use your actual project directory:

```bash
session-bridge init --project /path/to/project
session-bridge install --harness codex --scope project --project /path/to/project
session-bridge install --harness zcode --scope project --project /path/to/project
session-bridge daemon start --project /path/to/project
```

Keep the daemon in its own terminal. Installation places project integration files without editing existing app accounts/model settings or restarting working sessions.

## Start a dedicated ZCode worker

Prepare a separate native ZCode profile home with working model access. Its native `.zcode/v2/provider_config.json` supplies model configuration; follow the [official ZCode configuration guide](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/03-config.md). Byte Bridge does not copy credentials from other applications. The adapted macOS runtime is the desktop-bundled `Resources/glm/zcode.cjs` with adjacent provider resources; an explicit absolute `binary` override is available and remains version checked.

Save this non-secret JSON as the private project file `.session-bridge/zcode-start.json`:

```json
{
  "profile_dir": "/path/to/dedicated-zcode-home",
  "alias": "zcode-worker",
  "permission_mode": "build",
  "lifetime_seconds": 3600
}
```

`profile_dir` is the dedicated home, not its `.zcode/cli` subdirectory. Choose `build`, `edit`, `plan`, `yolo`, or `guarded` explicitly; ZCode defines their semantics. Byte Bridge does not approve native permission requests, so actions requiring an interactive decision can remain blocked. Select `yolo` only for a dedicated environment where you explicitly accept direct native tool execution. The deadline or Ctrl-C closes this dedicated runtime without stopping other applications.

```bash
session-bridge host --harness zcode --project /path/to/project --stdin \
  < /path/to/project/.session-bridge/zcode-start.json
```

The session enrolls through its own native MCP tool before printing `state: connected`. Keep this terminal running. Startup, transport confirmation, model completion, and task acceptance are separate states.

## Connect the original Codex chat

Ask the selected original chat to run these commands from its native working directory, which must contain the scoped project:

```bash
session-bridge connect --harness codex --alias codex-main --project /path/to/project
session-bridge context --project /path/to/project --json
session-bridge sessions --project /path/to/project --json
```

Use the installed executable's absolute path if an already-running app cannot find it, such as `$HOME/.local/sessionbridge/node_modules/.bin/session-bridge`. Do not borrow another chat's identity. New chats can discover the project Skills; an existing chat can explicitly read the installed Skill.

Then ask the Codex chat:

```text
$sessionbridge-do Use this chat as main. Ask the connected zcode-worker
 to implement the CSV validator described in requirements.md.
Only modify src/, tests/, and output/. Finish within 20 minutes.
Acceptance: boundary tests pass and input files remain unchanged.
Return real files and test results here for independent verification.
```

ZCode reports through its native `sessionbridge_request` tool; the standard daemon returns results to the original Codex chat. The main chat checks real files and tests. Codex's native `action` route provides recorded verification and continuation when `verified` / `main_continued` states are needed; see the [CLI reference](cli.md).

The private queue waits while ZCode is busy. It never interrupts or resumes another process's session. Canceling a message before native submission prevents subsequent dispatch. Uncertain submissions retain their original IDs for reconciliation and are not blindly retried. Exiting this dedicated host invalidates its connections; process-restart session recovery is not promised.
