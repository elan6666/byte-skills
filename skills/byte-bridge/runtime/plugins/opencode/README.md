# OpenCode SessionBridge

Two distinct modes are available:

- Managed ACP: `session-bridge host --harness opencode --stdin --json`. Configure an isolated native profile first. Each process owns one session.
- Existing native server session: install the project integration, explicitly load `.opencode/plugins/sessionbridge.js`, then call `sessionbridge_request({method:"context",params:{}})` from the original session. Source identity comes from native ToolContext. Receive tasks/results with an authorized bounded `sessionbridge_wait({timeout_seconds:30})`.

A plugin-enabled native server can host multiple original sessions. This does not inject into an unprepared TUI or wake an arbitrary idle GUI. Credentials remain native configuration/environment references. See [English guide](../../docs/acp.md) or [中文指南](../../docs/acp.zh-CN.md).
