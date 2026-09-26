# coordination/ schema and write rules

## state.json

```json
{
  "stage": "build | review | supervise | fix",
  "owner": "codex | claude | dsh | zcode",
  "owner_session": "codex:<native-thread-id>",
  "roles": { "codex": "builder", "zcode": "supervisor", "claude": "reviewer" },
  "participants": {
    "codex:<main-thread-id>": { "harness": "codex", "role": "builder", "host_id": "local" },
    "codex:<supervisor-thread-id>": {
      "harness": "codex",
      "role": "supervisor",
      "host_id": "local",
      "reports_to": "codex:<main-thread-id>"
    }
  },
  "next_action": "single concrete instruction for the current owner",
  "acceptance": "observable criteria that close this stage",
  "frozen_paths": ["glob patterns no role may modify"],
  "updated_at": "ISO-8601 with timezone",
  "history": [
    {
      "ts": "ISO-8601",
      "from": "codex",
      "to": "codex",
      "from_session": "codex:<main-thread-id>",
      "to_session": "codex:<supervisor-thread-id>",
      "note": "why the baton moved"
    }
  ]
}
```

### Field rules

- `stage` and `owner` move together: a handoff that changes work type should
  change the stage in the same write.
- `owner_session` is optional for backward-compatible one-session projects. It
  is mandatory once two sessions from the same harness participate and is then
  the exact authority key.
- `participants` records session-scoped roles and optional Codex `host_id` and
  `reports_to`; harness-wide `roles` remains a compatibility/default map.
- `next_action` is one instruction, not a list. Long plans belong in
  `handoffs/` linked from the note.
- `history` is append-only. New entries go last; past entries are never edited.
- `updated_at` is written on every state change.

## Directory layout

```
.byte-os/coordination/
├── state.json
├── sessions.json # durable harness/session/locator and code-snapshot registry
├── tasks/        # one markdown file per task; front-matter: owner, stage, status
├── receipts/     # machine-readable execution and verification receipts
├── reviews/      # generated BASE..HEAD review packages and diff files
└── handoffs/     # append-only交接文档; never edit an existing handoff
    └── sessions/ # <harness>-<native-session-id>.md; latest is only an index
```

## sessions.json

`state.json` answers **who may act next**. `sessions.json` answers **which
conversation, harness, model, checkout, and code snapshot produced the work**.
Keep these concerns separate so relay authority stays small and auditable.

```json
{
  "schema_version": 1,
  "project": { "root": "/absolute/path/to/project-a" },
  "sessions": {
    "codex:01a0-example": {
      "harness": "codex",
      "native_session_id": "01a0-example",
      "alias": "design-build",
      "locator": "codex://threads/01a0-example",
      "host_id": "local",
      "role": "builder",
      "reports_to": null,
      "stage": "build",
      "provider": "openai",
      "model": "gpt-5",
      "project_root": "/absolute/path/to/project-a",
      "branch": "main",
      "commit": "0123456789abcdef",
      "status": "handed_off",
      "created_at": "ISO-8601 with timezone",
      "updated_at": "ISO-8601 with timezone"
    },
    "zcode:task-example": {
      "harness": "zcode",
      "native_session_id": "task-example",
      "alias": "ablation-supervise",
      "locator": null,
      "role": "supervisor",
      "stage": "supervise",
      "provider": "zcode",
      "model": "glm-flash",
      "project_root": "/absolute/path/to/project-a",
      "branch": "main",
      "commit": "0123456789abcdef",
      "status": "active",
      "created_at": "ISO-8601 with timezone",
      "updated_at": "ISO-8601 with timezone"
    }
  },
  "active_by_harness": { "zcode": "zcode:task-example" },
  "updated_at": "ISO-8601 with timezone"
}
```

### Session registry rules

- The key is `<harness>:<native_session_id>`; a display alias is never an
  identity and may be reused.
- `harness` identifies the application. `provider` and `model` identify the
  inference backend. Do not collapse them into one field.
- `locator` is optional. The native ID remains authoritative because local
  deep-link formats may change or may not exist.
- Registration snapshots the Git branch and commit. A downstream experiment
  must also record its own run ID, config, log path, and scheduler/process ID
  in the task or handoff.
- Only the current `state.owner` may register or mutate its session record.
  When `state.owner_session` exists, the exact session must also match. Any
  harness or session may list the registry read-only.
- Update `sessions.json` atomically through `sessions.json.tmp` and rename it
  over the destination. Preserve `created_at` when updating an existing key.
- Session digests are durable by identity. `<harness>-latest.md` is a
  replaceable pointer to the session-specific digest, not the digest itself.

## Write rules (enforced by every harness running byte-relay)

1. **Atomic writes only.** Write to `state.json.tmp` in the same directory,
   then `rename(2)` over `state.json`. Never write in place.
2. **Owner-only writes.** Only the harness named in `owner` may modify
   `state.json`. When `owner_session` exists, only that exact session may write;
   every other session, including another Codex task, is read-only.
3. **Authority gate.** Work requires matching harness, exact session when set,
   and stage. On mismatch: report and exit.
4. **Frozen paths.** No role may modify files matching `frozen_paths`, for any
   reason, including "the task seems to require it". Frozen means frozen.
5. **No silent retries.** A failed `next_action` is reported in a handoff with
   evidence and diagnosis; ownership returns to the previous owner. The next
   owner decides whether and how to retry.
6. **One baton.** The repo is shared, the baton is singular. Concurrent work
   requires splitting the repo or an explicit `frozen_paths` split agreed by
   both parties in a handoff.
7. **Trace the conversation and run separately.** A session record proves who
   discussed or launched work; a task or handoff must still identify the
   concrete experiment run and artifacts being supervised.
8. **Durable before direct.** Write the handoff and atomically transfer the
   state before sending a Codex cross-task message. Messages notify or wake the
   new owner; they do not transfer authority.

## Task receipt rules

- Receipt identity is the task ID; `owner_session` is the authoritative
  `<harness>:<native_session_id>` that performed the work.
- `start` requires the current relay owner and a registered session, then
  snapshots the Git base commit before work begins.
- `complete` requires the same owned session, records the current head commit,
  and appends fresh verification. A failed command or incomplete acceptance
  cannot produce a `complete` receipt.
- Rulings explain material review decisions. Deviations explain departures from
  the accepted plan or handoff. Neither replaces evidence.
- Review packages must use the recorded `base_commit..head_commit` range, verify
  that base is an ancestor of head, and keep the full diff in a linked file.
