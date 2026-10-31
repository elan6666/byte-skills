# Bridge setup and compatibility

Byte Bridge is maintained entirely inside the Byte Skills repository at
[`packages/byte-bridge`](https://github.com/elan6666/byte-skills/tree/main/packages/byte-bridge).
That directory contains the complete source, native plugins, scripts, unit,
integration and live-test suites, and product documentation. The former
SessionBridge project is retired; its protocol identifiers remain compatibility
aliases. No external source checkout is needed.

The `../runtime/` directory is a generated installation payload, not a second
editable project. `BYTE_SOURCE.json` records the canonical source-tree hash and
payload hashes. Historical origin metadata does not select a runtime source.
Node.js 24.15–24.x is required only for Bridge.

Install all Byte skills and explicitly install production Bridge dependencies:

```bash
./install.sh --all --bridge
```

Or run `python3 scripts/bridge.py bootstrap` from the installed `byte-bridge`
directory. This installs dependencies, not agent apps or model accounts.
Maintainers edit `packages/byte-bridge` and run the repository's
`python3 scripts/build_bridge_runtime.py --build`; `--check` rejects source or
payload drift. See the root README for development checks. Live tests require
separate authorization and suitable accounts; ordinary installation runs none.

## Original Codex chats

If the project already has Byte coordination state, explicitly bind its exact
Byte/Python source **before** starting the service with setup. Use `exec
byte-source --project /absolute/project --stdin --json` with the actual absolute
`source_root`, exact `source_commit` and absolute `python_bin`; see the
[integration contract](byte-workflow.md). Without a matching pin, setup blocks
safely. Pinning creates no owner transition or model session. A new project
without Byte state can use standalone Bridge authority.

From each original native chat, with the shared project's absolute path:

```bash
python3 scripts/bridge.py exec setup --harness codex --project /absolute/project --dry-run
python3 scripts/bridge.py exec setup --harness codex --project /absolute/project --json
python3 scripts/bridge.py exec connect --harness codex --alias main --project /absolute/project --json
python3 scripts/bridge.py exec context --project /absolute/project --json
python3 scripts/bridge.py exec sessions --query supervisor --project /absolute/project --json
```

Run the supervisor's own `connect --alias supervisor` inside that original chat.
Do not run both commands in one chat pretending to be two sources. Native cwd,
project, host, profile, session and generation must agree. Setup starts one
bounded service after authorization; its default one-hour lifetime is not enough
for every long experiment. Inspect setup's actual schema for an explicitly
authorized longer lifetime. Repeated setup reuses a service without extending it.

Assigning roles does not start supervision. Bootstrap does not connect a chat.
Installing a plugin does not prove native activation. Inspect the returned
`targets_ready`, connection state, next steps, `context` and `doctor`.

An already running service keeps its original source pin. After an explicitly
authorized source upgrade, rebuild that owned service only at a safe boundary;
the old provider refuses drift. Do not restart a service that is supervising
someone else's active job just to activate an updated skill.

## Other apps

Read the bundled [compatibility matrix](../runtime/docs/support.en.md) for exact
versions and mode-specific evidence. Available routes include:

| App | Mode boundary |
| --- | --- |
| Codex | Original-chat enrollment and version-matched queue; no guarantee for unloaded/archived chats. |
| Claude Code | Explicit plugin activation and native permission flow. |
| dsh | Plugin bound to the selected native Host session. |
| Hermes | Enabled plugin and supported TUI queue; arbitrary GUI attachment unverified. |
| Pi | Native extension; reload/session changes require renewed identity binding. |
| ZCode | Original native MCP active intake, or separately managed App Server; no arbitrary idle wake. |
| Kimi Code | Explicit managed ACP, one session per process; existing TUI attachment unsupported. |
| OpenCode | Managed ACP or plugin-enabled native-server active intake. |

Transport support does not imply the current Byte workflow engine accepts every
app as a write owner. If the pinned engine rejects a harness, report that exact
limit; never pretend it is Codex or create another owner record to bypass it.

Choose only the apps the user requested. Preserve existing accounts, model
configuration and working sessions. No model access is purchased or enabled by
loading `byte-bridge`. The bridge core itself makes no model API calls.
