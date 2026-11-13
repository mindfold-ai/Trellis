# Design

## Boundaries and API
Existing CLI maintenance tasks/bindings/shared owns independent inspection, exact plans and recovery; Core `/task/maintenance` owns predecessor/projection/carrier validation. Keep `reopen_task` unchanged.

Add distinct `task_resume` maintenance kind and `prepareArchivedTaskResume` SDK entry. `inspect-task` accepts finite archive locators; ordinary active conversion/closeout retain active-only restrictions. Input names original archive key/ref, explicitly reviewed original active path, absent direct active destination, supported source kind, owner-authored complete Task2 projection, full artifact/fact dispositions, explicit reviewed resume intent and exact selected sessions/binding. Expose additive capability metadata.

## Data and semantics
Freeze the entire original archive read-only, copy retained artifacts to active destination, write validated Task2 and conversion provenance. Preserve TaskId/source/tree/metadata and generation; this is first model conversion, not formal reopen. Reject same-key active conflict. Original archive never participates in normal current selection. Native session identity resolver skips archives; creation uniqueness intentionally still reserves history.

Require no Completion/Closure and no live gates or synthetic active/empty Delivery. Import only real historical delivery outcomes with original-owner attribution; raw snapshot is valid for unknown outcomes. Require explicit accepted scope and next owner/reason; subsequent owner owns new planning, scope changes, approval and execution. Caller reviews private closeout responsibility; reject mechanically recognized incompatible public state.

## Sessions and ownership
Reuse Core carrier classification and unique branch authority. Inspect positively attributable original active-path carriers against explicit original_task_ref as well as archive identity; never infer this path from the archive basename; finite supported archived path carriers may be added when evidence requires. Never infer ownership from platform metadata. Explicit preservation/replacement/retirement only; schema3 with null Delivery is valid. Do not invent sessions for verification; explicit-task routing is legal. Inherited peers are read-only ownership evidence.

## Recovery
Reuse candidate fingerprint, fixed operation/identity, preimages, atomic writes and directory modes. Extend plan guard to cover selected archive and active destination only. Fresh source-tree and carrier checks reject ordinary additions/removals before apply, recovery and rollback writes. New same-Task sessions after resume block rollback even if task.json is unchanged. Reject target active same-TaskId records at every generation to match native ambiguity rules. Replay accepts source/target states, lost output returns original operation. Rollback rejects later edits/new files in active tree and protects unrelated work. Tool restoration remains separately reader-compatible.

## Evidence and tradeoffs
Core semantic tests and real-Git public CLI tests cover lifecycle, history, diagnostics, exact writes/recovery. Verify target installed identity/continuation and next public consumer, then packed exact CLI/Core pair. Only affected templates change, with dogfood parity and Python 3.9. Guru joint next-owner acceptance is separately reported; no mock proves it. Copying retains readable reversible provenance; restricting current gate authority avoids invented success and general recovery machinery.

## Planning review refinements
The public result must return the fixed restored TaskKey and active ref from the original plan. Resume intent identifies a caller-owned next action including evidence-only whole-task review, not just new Delivery creation. Original prearchive path is explicitly reviewed independently from destination; private closeout absence is an intent assertion, not inferred from old status.
