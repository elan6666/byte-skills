# Task plans and collaboration display

When a project has enabled Byte task tracking (`.byte-os/workboard.json` exists),
keep its actionable task plans current as part of normal work. The host agent
designs the plan using its existing model; there is no extra model service or
background transcript watcher. A website opened alone cannot design a plan from
an unseen chat. This tracking policy applies when the installed Byte skill is
used; it does not intercept arbitrary conversations in every client.

For a new actionable request, first read this small board and reuse the matching
task ID if continuing it. Save a concise objective/solution, ordered steps and
acceptance conditions. If still exploring alternatives, leave steps `todo`;
never interpret planning as permission to implement, delegate or launch a job.
After substantive work, update only steps supported by evidence. `review` and
`blocked` stay distinct from `done`. Include paths/receipts/test evidence when
marking a step done. The UI displays **recorded step progress**, not a model's
guessed percentage or independent acceptance. A failed experiment can complete
an experiment step without satisfying the overall scientific goal.

Use the bundled helper from this skill directory:

```bash
node scripts/workboard.mjs --project /absolute/project
node scripts/workboard.mjs --project /absolute/project --action task --input /absolute/task.json --revision RETURNED_REVISION
```

Task input example (replace IDs and identity with actual values):

```json
{
  "id": "stable-task-id",
  "title": "Build the selected feature",
  "objective": "Implement the agreed approach and verify the intended behavior",
  "status": "todo",
  "participants": [{"harness": "codex", "nativeId": "EXACT_NATIVE_CHAT_ID"}],
  "acceptance": ["The agreed behavior works in the real runtime"],
  "steps": [
    {"id": "design", "title": "Choose an approach", "status": "todo", "evidence": []},
    {"id": "build", "title": "Implement", "status": "todo", "evidence": []},
    {"id": "verify", "title": "Verify acceptance", "status": "todo", "evidence": []}
  ]
}
```

Supported statuses: `todo`, `in_progress`, `blocked`, `review`, `done`.
Reread and reconcile after a revision conflict; never overwrite a newer plan.
Writes use an exclusive lock and atomic rename; a busy lock is not permission to
delete it or retry an uncertain write blindly. Reading the board reconciles the
original task ID after an uncertain response.

`display` takes an array of `{harness,nativeId}`. It only controls visual inclusion,
not permissions or execution. The web picker limits selection to chats actually
observed in the project's exact directory. Do not automatically select every
historical chat or invent native IDs.

`collaboration` takes `{id,title,members,taskIds,bridgeTaskIds}`, with each member
`{harness,nativeId,role}` and `taskIds` pointing at saved plan IDs. Save real
participants and their agreed roles. A recorded collaboration is a **plan**;
Bridge still handles connection, delegation and execution. The visualization
matches exact native participants against actual project Bridge task records;
mere overlap is not proof that a planned task executed. No native collaboration
is created by drawing a graph edge or saving a role here.

This file is the presentation/task-plan ledger, not a replacement for Byte's
workflow engine, Bridge task state, run ownership or acceptance contract. If an
engine workflow already owns the task, link its evidence and mirror the relevant
step; don't maintain a second, contradictory execution authority.

No tracked file is automatically published. Keep secrets and raw transcripts
out of task descriptions and evidence references.
