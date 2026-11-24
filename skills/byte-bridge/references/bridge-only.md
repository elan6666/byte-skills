# One Bridge, app-specific native connections

Use this procedure for the first selected pair or to repair its connection.
Do not run all-app setup for a request involving only two clients. Normal
status/return handling reuses the exact existing task and needs no new setup.

## 1. Observe before starting

From the actual main chat, use the installed launcher, the explicitly selected
project, and the actual source harness:

The Python examples below are relative to the installed `byte-bridge` skill
directory, not an arbitrary project cwd. `preflight` is a CLI observation,
not an invented native tool method. If that CLI is unavailable inside a native
plugin, inspect its real `context`/`sessions` tools and the table below instead.

```bash
python3 scripts/bridge.py exec preflight --harness codex --with claude,opencode,zcode,dsh,hermes --project /absolute/project --json
```

Replace that list with only the requested participants. This is read-only;
it does not initialize an empty project or migrate an old database. A connected
record is not live native-context verification, permission approval, task
execution or main continuation. `--query` selects an exact alias or binding ID;
ambiguous matches need selection, never a "latest session" guess.

If setup is authorized, `exec setup --harness SOURCE --with TARGETS --project
PATH --stdin --json` accepts `{"lifetime_seconds":1800}`. For an existing Byte
engine, first use its exact source pin and integration contract. Setup starts no
models. It may install successfully and start its bounded service yet return
`needs_activation`/exit 3 because an original app still needs its native plugin.
Preserve the returned IDs and inspect the missing step; do not rerun blindly.

## 2. Activate the matching native route

| Client | Existing selected session | Explicit dedicated-worker option | Native calls |
| --- | --- | --- | --- |
| Codex | Original-chat `connect`; supported desktop native queue | Not the generic `host` command | Installed CLI from that original chat; shared MCP alone is not source proof |
| Claude Code | Installed plugin lifecycle/MCP and native inbox; authorized native plugin load/reload | Separate native CLI/profile if explicitly selected; not generic `host` | Plugin MCP tools using their actual schemas |
| OpenCode | Project plugin and bounded active intake | `host --harness opencode`, isolated configured ACP profile | `{method,params}`; original session uses `sessionbridge_wait` |
| Zcode | Enabled project plugin, attach and bounded active intake | `host --harness zcode`, isolated configured App Server profile | Attached `{request:{method,params},challenge?}`; managed `{method,params}` |
| dsh | Plugin in the selected original Cordis Host/Agent | A new native Host is a different session, requiring explicit selection | `{method,params}` |
| Hermes | Plugin-enabled canonical gateway TUI | New explicitly selected native TUI/profile; not generic `host` | `{command,payload}`; report uses `command:"report"` |
| Pi | Native extension and followUp | Explicitly selected isolated native CLI/profile | `{method,params}` |
| Kimi | Existing TUI attachment unsupported | `host --harness kimi`, isolated ACP profile | `{method,params}` |

Installation does not activate a running app. Native plugin activation is part
of Bridge enrollment, not permission to type into a GUI or send an alternate
chat message. If the app cannot load the connector through an available native
route, give the precise native enable/reload step to the user. Do not restart a
working session, copy another profile's credentials, purchase model access or
silently replace an existing chat with a new worker.

Zcode attached tools challenge **each** attach/wait/request/detach operation:
keep every original argument, add only the returned challenge, then repeat.
Hermes does not accept the `{method,params}` wrapper used by dsh/Pi. Do not
flatten these client-specific source checks into a guessed universal call.

## 3. Resolve native permission blocks once, within scope

Native permissions remain effective. Preserve an existing authorized setting;
do not globally choose `yolo`, skip permissions, auto-approve prompts or alter
working profiles. A dedicated Zcode `edit` worker can fail enrollment when its
MCP call needs a confirmation that the headless host cannot supply. The host
reports `native_permission_required` and closes its owned runtime instead of
waiting for a generic timeout. No task exists until actual delegation succeeds.

Explain the exact tool and available native approval route. Only if the user
explicitly accepts a dedicated, limited worker may that worker use `yolo`.
Record its project, profile, task paths and maximum lifetime; the mode itself
does not sandbox files. Keep that choice in the one worker input, not global
config or future defaults. Use a new generation after a failed enrollment,
never borrow the failed session's identity. Existing active requests keep their
original IDs; uncertain writes require status/recovery, not a new dispatch.

## 4. Execute a real scoped round trip

1. Read the current native `context`; resolve one exact peer from `sessions`.
2. Delegate with a fresh context request ID, acceptance, permitted paths,
   actual deadline, main return route and any already-authorized next action.
3. The peer reads the exact persisted task, executes only that scope with its
   native tools, saves real artifacts, then reports their relative paths through
   its own Bridge tool. Standard service return is the sole return route.
4. Main reads the persisted result, checks real artifact hashes/content and
   tests independently, then executes the next authorized action. For Codex
   native action proofs, register `plan_next` before verification. Other main
   harnesses must preserve actual native execution evidence; do not claim their
   `verified/main_continued` certification from a plain reply.

For Codex `action`, save JSON to a private input file and invoke the installed
launcher directly as a native command containing `action --action-id TOKEN`,
with `--stdin < input.json`. Keep the marker visible in that command's output.
Do not hide that invocation inside a Python/JavaScript subprocess wrapper:
native evidence matching needs the actual command text. After command completion,
reconcile/acknowledge the saved evidence file and original action ID; do not
blindly rerun a completed action while waiting for native proof. Never echo a
saved marker to fabricate proof. A newer pending verification receipt must not
be replaced by an older background reconciliation.
5. Stop this completed task's monitor/worker and verify disconnect. Stop only
   an owned service no longer needed by another task. Preserve experiments,
   other native sessions and pending uncertain requests.

Report installation, connection, delivery, execution, independent verification
and continuation separately. Contract tests establish protocol behavior;
live per-client evidence establishes only the tested version and mode. Active
pull clients need a bounded native wait and cannot promise arbitrary idle wake.

## Reference boundaries

The bundled compatibility guide records the exact adapted versions/modes.
Upstream plugin mechanisms: [Claude Code](https://code.claude.com/docs/en/plugins),
[OpenCode](https://opencode.ai/docs/plugins/),
[Zcode configuration](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/03-config.md).
Upstream capabilities do not independently certify this Bridge adapter.
