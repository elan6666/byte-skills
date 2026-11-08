# Reusable agent roles and task handoffs

Use this optional layer when the user wants durable roles across chats. It works
for development, research, operations and custom workflows. Keep domain-specific
roles, business rules and tools in the project's documents, not in Byte's generic
engine. Ordinary single-chat work needs none of these files.

## One document per durable agent

Store editable Markdown in `.byte-os/agents/AGENT_ID.md`. The main chat may create
or revise it within the user's request; the user may write or customize it directly.
Suggested content: responsibility, desired outcomes, working method, relevant
references, inputs/deliverables and collaboration agreements. These are suggestions,
not required headings or a new permission system. Use a stable ID; the title and
body can be in any language. Never overwrite an existing document during creation.

A logical agent is independent of a particular native chat. The optional workboard
`agents` array associates `{id,session:{harness,nativeId,hostId?,profileId?}}` with an
actual session observed through native context or Bridge sessions. Rebind after a
chat is replaced, keeping its document and original tasks. Unbound documents are
valid, so main can define a role before its chat exists. A binding does not create
a chat, display registration, native permissions or a Bridge connection.

Commands below run from the installed **byte-plan** directory (Node.js 24.15–24.x,
standard library only). Use the actual selected project root:

```bash
node scripts/agents.mjs --project /absolute/project --action create --id researcher --title Researcher
# Or create from a user/main-authored Markdown file:
node scripts/agents.mjs --project /absolute/project --action create --id reviewer --input /absolute/role.md
node scripts/agents.mjs --project /absolute/project --action bind --id researcher --input /absolute/native-context.json
node scripts/agents.mjs --project /absolute/project --action context --input /absolute/native-context.json
node scripts/agents.mjs --project /absolute/project --action org --output .byte-os/ORG.md
```

`context` loads the current contents/hashes of only the roles bound to that exact
native chat. On joining, resuming or receiving an assignment, use actual native
context to read those documents and the current task. For local work without a
Bridge connection, read an explicitly assigned document directly; do not require
installing Bridge. If no document is assigned, continue ordinary authorized work.
The host agent follows this rule when it uses Byte; this is not an app-wide hook
that automatically reads every idle or unrelated conversation.

`org` without `--output` prints a view. Saving generates an optional overview of
documents, bindings and tasks; a manually written or edited overview is preserved.
Edit responsibilities in each agent's Markdown, binding/task metadata in the board,
then regenerate the view. Do not keep another authoritative role-description copy
in ORG. Role documents describe work; they do not enforce filesystem isolation.
For parallel writes, agree task-specific scopes, or use isolated worktrees and
normal merge/review. Shared paths can be intentional; do not ban all overlap.

## Standard task contract

Keep existing workboard task IDs, steps, statuses and evidence. These fields are
optional additions to the existing task object, not a second task queue:

```json
{
  "agentId": "researcher",
  "inputs": ["data/input.json", "Compare the selected baseline"],
  "outputs": ["reports/comparison.json"],
  "dependsOn": ["prepare-data"],
  "readPaths": ["data/", "src/"],
  "writePaths": ["reports/"],
  "deadlineAt": "2099-01-01T00:00:00Z"
}
```

Use the actual task's deadline and authorized paths; the date above is illustrative.
The main agent can infer ordinary local details from the existing user grant.
Do not ask the user to choose every field. Inputs/outputs are deliverable references
or descriptions; read/write paths are explicit project-relative native task scopes.
They do not override native permissions. Missing write paths mean read-only work;
do not silently turn an output description into project-wide write access.
Dependencies refer to other existing plan IDs. A report is not acceptance: only
main's independently checked `done` task releases its dependent tasks.

## Assign, return, review and continue

1. Read the board and the role document. For actual cross-chat work, use Byte
   Bridge's current native `context` and `sessions` results, from the exact source.
   Select the bound target uniquely. Ordinary authorized local work stays local.
2. Prepare a native request, passing the actual context and session-list JSON:

   ```bash
   node scripts/collaboration.mjs --project /absolute/project --action prepare --id TASK_ID --context /absolute/native-context.json --sessions /absolute/sessions.json
   ```

   This saves an immutable request snapshot/correlation in the existing plan and
   returns `route: bridge` with `request`. It includes the role document's path,
   hash and snapshot plus the task contract. **It has not sent anything.** Submit
   only the `request` object through the original native Bridge request tool. For
   MCP `delegate_task`, map `target.query/harness/profile_id` to
   `target_query/target_harness/target_profile` and omit `operation/target`.
   Follow the installed Bridge schema and existing user authority. Do not invent
   source context or call another application's internal tools from the shell.
3. Query Bridge `status` with `for_request: ORIGINAL_REQUEST_ID`, save that native
   receipt, then query the returned task ID. Link these observations:

   ```bash
   node scripts/collaboration.mjs --project /absolute/project --action link --id TASK_ID --input /absolute/bridge-task-status.json --receipt /absolute/for-request-status.json
   ```

   The helper checks request/task correlation, exact native source/target, return
   route and frozen input. It records `bridgeTaskId` and plan progress; Bridge
   remains the source of delivery/execution truth. Saving metadata is not proof
   the target accepted or ran the task.
4. The receiving agent reconciles the actual Bridge task, reads its current role
   document, works within the task/user grant and reports actual artifacts back
   using the **same Bridge task**. Reconcile any role changes with the snapshot;
   a newer role document cannot expand a frozen task's permission scope.
5. Main reads native task status and returned artifacts. `--action review` with
   the task status puts the plan in `review`, never `done`. A first-time link also
   needs the `--receipt` above. Failed or needs-input tasks remain unresolved;
   record their real blocker rather than declaring a completed result.
6. Main independently checks acceptance with existing verification tools, saves
   evidence-backed steps and `done` through `workboard.mjs`, then runs
   `collaboration.mjs --project /absolute/project --action ready`. Execute the
   next ready authorized task in the current turn; do not stop at a proposed next
   action. `ready` computes eligibility only; it is not a scheduler or permission
   to launch jobs, create chats or send unsolicited messages.
   For Bridge work, also use its native verification and continuation tools with
   real evidence at the corresponding stages. Updating a plan does not perform
   those acknowledgements or certify native execution.

## Resume without duplicate dispatch

`prepare` on a task with a handoff returns `route: recover` and the original
request/task IDs instead of creating a new request. `--action recover --id TASK_ID`
also shows them. Read actual Bridge status using those IDs from the original
source; recover an existing uncertain message through Bridge, not another queue.
If a preparation was interrupted before submission, query the original
`for_request`, then run:

```bash
node scripts/collaboration.mjs --project /absolute/project --action resume --id TASK_ID --context /absolute/native-context.json --input /absolute/for-request-status.json
```

An observed request returns its existing task/message references. Only a native
`null` request observation from the original source returns the unchanged prepared
request for submission. Bridge still enforces idempotency. Never replace its ID
or change its snapshot/scope to get a retry through. Use a new plan/attempt for
new work after reconciling an old attempt; don't overwrite its receipt.

This helper records observations supplied by the host; it cannot authenticate
handwritten JSON or independently prove native delivery, runtime execution or
artifact quality. Preserve real tool outputs and use Bridge's own authorization.

## Existing workflow-engine projects

If `.byte-os/coordination/state.json` is owned by `byte-workflow/v1`, documents and
bindings still apply, but the pinned workflow owns steps, role ownership, outputs,
acceptance and transitions. `prepare` returns `route: workflow`; `ready` does not
create a parallel execution queue. Use engine `status`, `advance`, `start-run`,
`return-run`, `ack-return` and `accept`, plus Bridge's committed-handoff procedure.
Include the assigned role document in the authorized handoff context. Mirror plan
progress only as a view. Do not change the engine's state to follow a workboard
suggestion, create a second supervisor or add a new schedule.
