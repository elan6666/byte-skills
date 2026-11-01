# A real two-chat Bridge task

[Repository home](../README.md#example) · [简体中文](bridge-smoke.zh-CN.md)

On 1 November 2026, an isolated new-user acceptance test exercised the installed
Byte pack in two existing Codex chats. The worker's native configuration selected
gpt-6-luna. This was a small CSV utility task, with no research jobs or timers.

1. **Install:** skills CLI 1.7.4 discovered and copied exactly 14 Byte entries.
   Explicit Bridge bootstrap verified 202 runtime files and installed dependencies.
   The installed seven-step workflow template also validated and saved locally.
2. **Delegate:** main fixed the task, allowed paths, acceptance criteria and return
   route. Bridge delivered it to the enrolled worker through the native Codex queue.
3. **Execute and return:** worker implemented a Python standard-library CSV grouping
   CLI, ran four unit tests, and reported four hashed artifacts through Bridge.
4. **Independently verify:** main checked the primary output against its own Decimal
   calculation, generated previously undisclosed held-out input, ran the worker CLI
   as a black box, and reran its tests. The protected verifier remained unchanged.
5. **Continue:** main executed the previously fixed next step to record verified
   acceptance. Bridge matched both actions to completed native command records and
   reached `task=verified`, `return=main_continued`, `continuation_verified=true`.
6. **Clean up:** the owned test service stopped. No scheduled monitor or new chat
   remained to keep checking an empty task.

The test first exposed failures: a bare notification led to an old-topic answer;
an incorrect read-only command stalled another attempt; and a large main-chat
history prevented action proof lookup. Those failed tasks were retained and
cancelled. Receiver instructions and single-turn history reads were corrected;
a conversational reply now counts only as receipt, never completed work.

The repaired snapshot passed 219 Node tests, 122 Byte Python tests and nine Bridge
Python tests. The live run demonstrates these two identified Codex chats. It does
not establish immediate wakeup for every client, an unloaded chat, or long training.

To adapt this example, ask `$byte-bridge` to connect your selected existing chats
and delegate a bounded task with explicit files, acceptance and return route.
Enrollment, permissions and native client compatibility must be verified first.
Use `$byte-do` for natural-language capability selection, `$byte-auto` for the
default complete workflow, or `$byte-workflow` to save your own reusable process.
