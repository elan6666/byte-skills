---
name: byte-bridge
description: Connect agent chats, assign main and supervisor roles, delegate scoped work, supervise an identified long run, and return results through the bundled Byte Bridge runtime. Use for same-app or cross-app collaboration; short same-task helpers remain native subagents.
---

# Byte Bridge

Use Byte Bridge as Byte's cross-chat collaboration layer. Understand the
natural-language request in the current agent, then call its structured CLI or
native tools. The bridge connects selected existing sessions; it does not choose
models, grant tool permissions, or make its own model API calls.

## Select the intent

| Request | Action |
| --- | --- |
| “This chat is main; use that chat as supervisor” | Assign roles only. No job, baton transfer or timer. |
| “Have that agent do this task” | Delegate with acceptance, permitted paths, deadline and the return route. |
| “Watch this training run” | Supervise the exact verified run with the authorized cadence, repair scope and stop condition. |
| “What happened?” | Read status; recover the same request/message if delivery is uncertain. |
| “Bring the result back and continue” | Return evidence; main independently verifies and actually executes the authorized next step. |

For a short bounded wait in the current task, an authorized native subagent is
usually enough. Bridge is for independently identified chats and agent apps.

## Use the bundled runtime

Commands below are relative to this skill directory:

```bash
python3 scripts/bridge.py doctor
python3 scripts/bridge.py bootstrap
python3 scripts/bridge.py exec describe --query request --json
```

`doctor` is read-only. Bootstrap installs the pinned runtime's npm dependencies,
without launching a service, model or chat. Do not select an unrelated global
`session-bridge` binary or run an unverified downloaded installer. Read the
[setup and compatibility guide](references/setup.md) for first use.

From the original native chat, connect to the explicitly selected project;
for an existing Byte project, bind the exact source before starting its service.
Inspect `context` and query `sessions` by the user's alias. Require a unique
native identity including app, host, profile and runtime generation. Never fill
in another session's identity, borrow its environment, or use a “latest” file.
Other apps enroll using their own native plugin/extension. A newly managed ACP
session is a different mode from attaching an existing TUI.

Use `exec describe --query request.<operation> --json` and the bundled
[generated command reference](runtime/skills/sessionbridge-do/references/commands.generated.md)
for the current schema. Send JSON through stdin as data, with argv arrays and
`shell=False`; never interpolate user text into a shell command. Preserve the
same request ID and immutable scope across recovery. Prefer actual native
SessionBridge tools when available, following their schema and source challenge.

## One authority, one delivery route

Read [the Byte integration contract](references/byte-workflow.md) before work
in a project with `.byte-os/coordination/state.json`. Byte is the sole work
authority there; the bridge database records transport, supervision and receipts.
Bind the exact local helper source explicitly. A source mismatch is blocked,
not permission to overwrite state or fall back to standalone ownership.
An already in-flight handoff created before Bridge integration finishes through
its recorded original route. Do not re-import or resend it mid-flight. Switch
at an explicitly selected safe boundary; new handoffs then use Bridge. This
grandfathering is not a fallback for an uncertain new Bridge notification.

For `byte-workflow/v1`, the engine performs `start-run`, `arm-run`, `return-run`
and `ack-return`; Bridge imports the committed matching handoff and transports
it. Do not call legacy `relay_state.py handoff` around the engine. Legacy Relay
projects retain their existing owner gates. Do not migrate an active project
merely because this skill was loaded.

For each message, use the one route selected by Bridge. Do not also send a
manual Codex message or retry through a second connector. Uncertain delivery
requires status/recovery with the original IDs, not another delegation.

## Main → supervisor → main

Main owns design, core code, tests, launch and final acceptance. Verify real
startup and exact run identity before handoff. End the main turn to wait only
after the exact supervisor has acknowledged, future checks are active, and a
return-wake path is verified. The supervisor handles only its owned run and
explicit bounded repairs. Preserve terminal evidence before reporting.

Keep ordinary per-run monitoring off after return. For an explicitly authorized
continuous outcome loop, use one outcome monitor across phases until verified
overall acceptance, explicit pause or a concrete blocker with no independent
work remaining. No-change checks stay quiet. Do not add a second native timer
beside Bridge supervision for the same run. Service and binding lifetimes must
cover the authorized wait; an expired binding is not silently renewed.

Result delivery, independent acceptance and actual main continuation are separate
states. Acknowledgement, a model's final answer or `idle` proves none of the
later states. Immediate event-to-idle-chat wakeup remains client- and mode-specific;
keep a verified periodic fallback where needed. Never promise support for an
unloaded chat or arbitrary existing GUI/TUI.

`byte-design-supervise` is the training/ablation preset for this entry;
`byte-relay` retains local identity and evidence helpers for compatibility.
`byte-do`, `byte-auto` and custom `byte-workflow` projects use this same transport.

Canonical repository: [elan6666/byte-skills](https://github.com/elan6666/byte-skills).

Maintain the complete project only in `packages/byte-bridge` in that repository.
The installed `runtime/` is generated; former SessionBridge names are compatibility aliases.
