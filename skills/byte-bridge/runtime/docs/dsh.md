# DSH original Desktop/Web chats

The DSH connector is an installable bundle (`dsh.bundle.patch`), with plain
JavaScript entries. Its host dependencies come from the selected DSH profile;
optional peers do not install a second copy of the host. Desktop profiles are
managed by Electron: use the application's Plugins page to install the local
`.session-bridge-plugins/dsh` directory, then enable it. Do not pass
`--scope profile` to Bridge, or use the DSH CLI to mutate a managed desktop
profile.

Version strings are diagnostic metadata, not an exact allowlist. The Host
adapter checks original Host/process identity, required enqueue/observe
permissions and the exact live session binding. A changed Host generation still
requires reconnection. Missing native interfaces fail on their actual operation;
an unfamiliar version label alone is not grounds to reject a working interface.

Run authorized Bridge `setup --harness dsh --project /absolute/project` first.
This installs files and starts a bounded, owned service; `needs_connection` is
expected until the native plugin enrolls the selected chats. Preserve the
service lifetime and exact task/message IDs during recovery. A service expiry
requires an authorized start; enabling a plugin is not an indefinite service
or monitoring grant.

The bundle inserts `sessionbridge` and `sessionbridge-command`. Add a user
profile patch targeting `sessionbridge`, with either a `sessions` array or a
`config_file` pointing to a local JSON file containing that array:

```yaml
- id: sessionbridge
  config:
    config_file: /absolute/project/.session-bridge/dsh-sessions.json
```

```json
{
  "sessions": [
    {
      "session_id": "exact-original-session-id",
      "root": "/absolute/project",
      "cwd": "/absolute/native-chat-directory",
      "alias": "main"
    }
  ]
}
```

Obtain IDs and working directories from the selected original sessions. `cwd`
can be omitted only when it equals `root`. An explicit cwd pin allows a selected
existing chat to keep its original working directory while using the selected
Bridge project; it does not change the chat's filesystem permissions. Other
sessions are never enrolled automatically. The plugin handles already loaded
Agents and later `agent/created` events, revokes a disposed Agent, and issues a
new generation when it reopens. Native remote-access checks still apply.

The model uses `sessionbridge_request({method,params})`. A person can use the
same guarded native tool from its original chat without invoking a model:

```text
/sessionbridge {"method":"context","params":{}}
/sessionbridge {"method":"sessions","params":{}}
```

The command registry supplies the actual receiving Agent; request data cannot
choose a source identity. Structured writes use the current context request ID
and the same schemas as the model tool. Plugin enablement and user patches may
hot-reload in a compatible original Host. Revalidate actual component state;
do not claim that every edit requires an application restart.

Local acceptance on Desktop 0.2.1-rc.5 (2026-11-03) covered installation,
hot activation, four exact existing chats, real DSH tool context/session reads,
main-to-worker execution with an on-disk artifact, result return, and main
artifact hash inspection. The queue may drain before the synchronous inbox
check; an `uncertain` response must be reconciled using the original message,
not sent again. A returned artifact or a main acknowledgement does not certify
`verified` / `main_continued`: the current native-action certification path is
separate and must not be fabricated from a Markdown verification note.
