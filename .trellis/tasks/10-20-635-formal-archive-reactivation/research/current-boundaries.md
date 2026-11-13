# Inspected maintenance boundaries

## Baseline and workflow

Inspected source: castbox/Trellis `6202fc2da435a4d1f0e2e67eb01f2e61ec50ca51`. Local and remote main matched at preparation. Native workflow has no runtime declaration: runtime-contract lookup reports `missing_runtime_contract`. `trellis-brainstorm` explicitly retains native legacy planning for this case. The planning Task therefore uses that existing native workflow, independently of the Task v2 data the new maintenance capability will produce.

## Source evidence

| Source anchor | Observed behavior |
| --- | --- |
| `packages/core/src/task/maintenance.ts:17` | Distinguishes strict schema1, known legacy and current schema2. |
| `packages/core/src/task/maintenance.ts:34` | Uses ordinary migration and original-owner attribution of commit/PR/completion-date facts. |
| `packages/core/src/task/maintenance.ts:61` | Manual resume requires explicit intent/accepted scope, rejects Completion/Closure and imported gates, and retains only genuine historical delivered outcomes. |
| `packages/core/src/task/migration-v2.ts:8` | Preserves identity, metadata, artifact origin, tree and generation. |
| `packages/cli/src/commands/maintenance/tasks.ts:538` | Active conversion rejects archive paths. |
| `packages/cli/src/commands/maintenance/tasks.ts:548` | Manual resume validates exact archive/original/destination paths and uses same-generation preparation. |
| `packages/cli/src/commands/maintenance/shared.ts:62` | Existing TaskGuard contains one generation. Formal conversion needs explicit source and target generation. |
| `packages/cli/src/commands/maintenance/shared.ts:807` | Manual result projects the preserved generation from that guard. |
| `packages/cli/src/templates/trellis/scripts/common/delivery_operations.py:219` | Ordinary reopen requires matching current Completion, increments generation and replaces accepted scope. Keep it unchanged. |

The earlier Guru investigation compared relevant files with its pinned provider source `7f050fa11ddd8569e5db4f728ea1b745b7500a98` (`0.7.0-castbox.5`) and found the same capability gap. This provider Task does not replace a public writer with a Guru companion-script implementation.

## Genuine predecessor lead

The original Guru investigation selected the following real historical input. During implementation coordination, read-only Git queries rechecked its Task identity/source/status, absent current-model terminal arrays, fixed tag commit, archive-result active-path removal and reachability from the existing Guru execution HEAD. This is still not a native reactivation success. Do not modify its original repository or copy private business state into a public package.

| Property | Value |
| --- | --- |
| Repository/tag | `castbox/guru-trellis`, `v0.7.0-guru.3` at `7d20a930341dae3e7dd2d214660ce3b99e28d863` |
| Archive | `.trellis/tasks/archive/2026-10/10-08-503-mixed-task-identity-reservation/` |
| Task | `issue-503-mixed-task-identity-reservation`, generation 0, exact source #503, completed schema1 |
| Archive creation | `b61304bdd30c6545fca734f8c02d33df0ea738c3` |
| Bookkeeping merge | PR #505, `b0289465d0d83f41f1979401aff081e0c30849e0` |
| Business merge | PR #504, `00865cd1177d58ac13f38be07132593015f4774e` |

The summary schema label differs from the Task schema. The record has no current Completion/Closure arrays. The exact archive result removed the active path. Tests may build a minimal equivalent public-data fixture with real Git actions; distinguish generated fixture facts from original historical provenance.

At the bookkeeping merge, the Task blob is `491550b6cfbd838ae6ce7f93a8c5c6127cd0d695`. The inspected original active locator is `.trellis/tasks/10-08-503-mixed-task-identity-reservation`; the selected merge tree has no entry at that locator. Only read-only source queries were used.

## Alternatives and responsibility

Manual resume followed by genuine new Completion/Closure/Finish and ordinary reopen is possible as real additional old-generation work. It introduces closeout/archive/resource duties solely to migrate an already completed predecessor. The selected route directly converts that archive to `g+1`, preserving history without manufacturing old terminal facts.

Guru owns formal-completion judgment, history sufficiency, pending transactions and next semantic ownership. Provider owns pure data validation, exact Git/file checks, bounded writes and recovery. Old resource responsibility remains with original owners. Provider acceptance and Guru whole-task acceptance are separate.

## Applicable context

Load CLI/Core backend indexes, maintenance/Core SDK contracts, Task/Delivery lifecycle, filesystem safety, error/quality and test guidance before implementation. Any native changes additionally require script/platform guidance and template/dogfood parity. Test integration/mocking guidance applies to Git/package fixtures. Context manifests list specs and this research; code files are discovered directly by implementation/check agents.
