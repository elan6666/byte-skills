# coordination/ schema and write rules

## state.json

```json
{
  "stage": "build | review | supervise | fix",
  "owner": "codex | claude | dsh | zcode",
  "roles": { "codex": "builder", "zcode": "supervisor", "claude": "reviewer" },
  "next_action": "single concrete instruction for the current owner",
  "acceptance": "observable criteria that close this stage",
  "frozen_paths": ["glob patterns no role may modify"],
  "updated_at": "ISO-8601 with timezone",
  "history": [
    { "ts": "ISO-8601", "from": "codex", "to": "zcode", "note": "why the baton moved" }
  ]
}
```

### Field rules

- `stage` and `owner` move together: a handoff that changes work type should
  change the stage in the same write.
- `next_action` is one instruction, not a list. Long plans belong in
  `handoffs/` linked from the note.
- `history` is append-only. New entries go last; past entries are never edited.
- `updated_at` is written on every state change.

## Directory layout

```
.byte-os/coordination/
├── state.json
├── tasks/        # one markdown file per task; front-matter: owner, stage, status
└── handoffs/     # append-only交接文档; never edit an existing handoff
    └── sessions/ # digests produced by session_digest.py, <harness>-latest.md
```

## Write rules (enforced by every harness running byte-relay)

1. **Atomic writes only.** Write to `state.json.tmp` in the same directory,
   then `rename(2)` over `state.json`. Never write in place.
2. **Owner-only writes.** Only the harness named in `owner` may modify
   `state.json`. Everyone else has read-only access to coordination state.
3. **Authority gate.** A harness executes work only when `owner == self` and
   the invoked stage matches `stage`. On mismatch: report and exit.
4. **Frozen paths.** No role may modify files matching `frozen_paths`, for any
   reason, including "the task seems to require it". Frozen means frozen.
5. **No silent retries.** A failed `next_action` is reported in a handoff with
   evidence and diagnosis; ownership returns to the previous owner. The next
   owner decides whether and how to retry.
6. **One baton.** The repo is shared, the baton is singular. Concurrent work
   requires splitting the repo or an explicit `frozen_paths` split agreed by
   both parties in a handoff.
