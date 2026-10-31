
> Byte Bridge is maintained only in `elan6666/byte-skills`, under `packages/byte-bridge`. `skills/byte-bridge/runtime` is generated from this package. The former SessionBridge project is retired; existing `session-bridge` commands and protocol names remain compatibility aliases.

# ZCode native integration

The native plugin can connect an already-open original conversation through `sessionbridge_attach`, then receive work through an explicit bounded `sessionbridge_wait`. Every attach/wait/request/detach operation derives its caller from its exact native tool challenge, including shared MCP transports. Mode: **attached / native_tool_pull**. Enable this plugin in the selected project; original permissions apply. No UI message injection or automatic wake after the original agent stops waiting.

The separate `host --harness zcode` route creates a dedicated original App Server with an isolated profile, labeled **managed**. It never resumes another process's conversation. See the product ZCode guide for activation, request shapes, expiry and recovery.
