# Compatibility and limits

[English](support.en.md) · [简体中文](support.md) · [Back to README](../README.md)

SessionBridge 0.1 is a local session-integration prototype. Connection, delivery, model execution, and task acceptance are separate states. Check the app version, session mode, and actual task requirements independently.

## Runtime requirements

- The core requires Node.js ≥24.15.0 and <25. The local transport targets macOS/Linux; Windows integration is unverified.
- Each participating conversation must enroll from its original app. Some apps require explicit plugin activation or extension reload.
- Periodic supervision requires the project's coordination service to remain running. Machine sleep pauses local services and jobs; checks continue after waking, without a guarantee of immediate response or automatic app restart.
- Accounts, model access, and tool permissions remain under each original app's control.

## App connections

| App | Integration | Conditions |
| --- | --- | --- |
| Codex | Original-chat connect, matching desktop native queue and read-only history | Exact versions 0.163.0-alpha.11, 0.163.0-alpha.11.2 0.164.0-alpha.11.1, and 0.166.0-alpha.5.1. The desktop remains the only executor. Archived, unloaded, or closed chats are not guaranteed to wake. Revalidate after upgrades. |
| Claude Code | Native plugin lifecycle and later inbox | Adapted to 2.1.306. Activate the plugin in the original app; Claude controls tool permissions. |
| Pi | Native extension and followUp | Adapted to 1.3.0. Switching or reloading a session invalidates the old connection. Delivery does not interrupt execution. |
| dsh | Web/Desktop Cordis plugin bound to the original Agent | Adapted to 0.2.1-rc.2. Web mode has the clearer integration scope; individual desktop instances need separate checks. Entry syntax follows the original app. |
| Hermes | Native plugin and canonical gateway TUI queue | Busy injection in the ordinary CLI is restricted. Desktop GUI attachment is unverified. |
| ZCode | Original-session MCP active intake + dedicated App Server | Exact 0.17.0 artifact; `attached/native_tool_pull` requires an enabled native plugin and bounded active wait, without idle-chat wake. `managed` needs a separate profile. Native permissions apply. See [setup](zcode.md). |
| Kimi Code | Dedicated native ACP process | 2.4.1; managed, one session per process and isolated profile. Existing TUI attachment unsupported; old0.28.1 custom-GLM ACP failed. See [guide](acp.md). |
| OpenCode | Dedicated ACP + native project-plugin intake | 1.19.5; one session per ACP process. Original sessions require an enabled plugin and active wait. No arbitrary idle wake; GUI support is not inferred from CLI tests. See [guide](acp.md). |

Versions identify interface adaptation conditions, not an instruction to upgrade. Plugin installation does not restart applications or take over other conversations. Attaching an existing session and launching a new managed worker are distinct modes.

## Original sessions versus dedicated new sessions

These are version-specific boundaries, not claims about every GUI or main/worker combination:

| Application | Already-open original session | Dedicated new session |
| --- | --- | --- |
| Claude Code | Warm original CLI followed by explicit `/reload-plugins`; same process/session, native permission required | Isolated CLI/profile with native tool permissions |
| dsh | Original Agent inside its native Cordis Host; Web/Desktop boundaries must be checked separately | Isolated native Host/profile with the same plugin |
| Hermes | Plugin-enabled canonical gateway TUI; ordinary CLI and untested GUI are different | Isolated real TUI/gateway profile |
| Pi | Original CLI session with explicit extension load/reload, no interrupt takeover | Isolated CLI/profile and native extension |
| Kimi Code | **No takeover of another running TUI** | 2.4.1 ACP, one session per isolated process |
| OpenCode | 1.19.5 plugin-enabled native server session, bounded active wait required | Isolated ACP; separate process/profile per conversation |

All six applications completed real software work, tool-driven tests, result return and original-main checks using GLM Coding Plan `glm-5.3-flash`, with OpenCode as main. OpenCode also completed an original-session pair on one native server, including return, independent checks and cancellation before receipt. Worker artifacts received separate boundary-case checks. This does not certify all combinations, long-running reliability or arbitrary idle wakeup. Non-Codex `verified/main_continued` action proof remains subject to the limitations below.

## Tasks and recovery

- Keep the original message ID when delivery is uncertain and use recover to reconcile. Do not blindly retry under a new ID or channel.
- The service records task scope, run identity, artifact hashes, and returns. A process exit or assistant reply alone does not establish acceptance.
- The original main conversation must verify actual results. Generic native-command action proofs currently focus on Codex; equivalent guarantees are not claimed for other apps.
- cancel stops future delivery or supervision, not independent jobs.
- Scope checks help prevent misrouting and incorrect attribution. They are not a security sandbox against arbitrary programs running as the same OS user.

## Optional project management integration

Ordinary projects use standalone task mode. Existing Byte state/engine remains the sole work authority. Explicitly pin project sources before starting its service. v1 imports only engine-committed start-run/return-run handoffs; the pinned engine validates its native role grammar, currently eight harness names. Engine/transport contract tests do not certify every running app's full Byte workflow. Legacy relay keeps its four-harness boundary (Codex/Claude/dsh/ZCode). Bridge never performs v1 ownership mutations or replaces arm-run/ack-return. Missing/drifted pins and unknown engines block writes; no standalone fallback. See [Byte integration](byte.md).
