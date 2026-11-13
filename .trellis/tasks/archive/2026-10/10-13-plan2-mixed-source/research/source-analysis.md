# Source analysis and evidence boundary

## Live source inspection on 2026-10-13

Base `fdb88e8e220b42df0f0b78f8b939e072d36b9be1`, tree
`b1967d4637e092c4db481705a838a40ff6a38a57`; clean main before task creation.
Four file hashes match the temporary proposal. Root workflow has
missing_runtime_contract, so retain legacy planning. This session now binds only
plan2-mixed-source, planning; inventory Task 09-30-issue-23 is unrelated.

| Anchor | Fact |
| --- | --- |
| migration2-schema.ts:50 | Closed source enum legacy/1.0, no row selector. |
| migration2.ts:341 | Entire plan parsed before writes. |
| migration2.ts:504 | Parse frozen original snapshots; history-only may retain unknown history. |
| migration2.ts:548, :587 | Global convert/defer dispatch. |
| migration2.ts:557, :573, :591 | Existing public projection, exact original history and raw defer. |
| migration2.ts:608 | Original identity groups drive retry; generation/provenance and unique authority remain required. |
| migration2.ts:1268, :1319, :1330 | Final topology/source checks precede atomic writer. |
| packages/core/src/task/migration.ts:8 | Public positive known-legacy classifier. |
| packages/core/src/task/migration-v2.ts:8 | Existing projection verifier. |
| .github/workflows/ci.yml | Node20, Python3.9 syntax/runtime, root quality/build/tests. |

CLI anchors above are under packages/cli/src/commands/. Inherited-copy tests at
migrate2.integration.test.ts:2091 and compatibility cases at :2611 provide real
Git/binding/recovery/reader helpers. Extend behavior, not a private model.

## Prior read-only evidence, not new executor proof

Sample `/private/tmp/531-406-history-validation-20261013/406` has actual installed
source `.3`. Prior public classifiers found 31 active: 28 strict schema1, three
known legacy, zero schema2. #406 is schema1/gen0. Known legacy directories:
10-08-311-cms-users-lite, 10-08-380-for-you-independent-metrics and
10-10-414-for-you-7d-2h-refresh. Strict schema1 rejected retired creator.
All record hashes/modes matched before/after probes. No raw business data copied.

Fixed predecessor source `1e40014023de53ddfd9368b3fb4d0a7a31e92293`;
artifact root `/tmp/plan2-worktree-copies-candidate-q9h3iZ`.
CLI tar SHA256 `185ed1db6865b72138bb10b6d799225721bf50fddfb370f84d8ec330558f472d`;
Core tar SHA256 `45bbfee507ed4964649610f703a90ba01c5f5cea21fb95d0845f92ed45302967`.
Earlier installed verification matched 713 CLI/270 Core regular file bytes/modes.
These are predecessor evidence, not a candidate or new Task pass.

In-memory probes rejected mixed/row fields. Full actual Plan2 dry-run/executor
were not run. Plan1 requires declared from earlier than target but allows
installed==target replay; do not overclaim all .3 operations are prohibited or
invent older provenance.

## Planning inputs

Reviewed temporary directory:
/var/folders/rd/kbzpxp956nb3p_h04vnfg3l80000gn/T/trellis-plan2-mixed-source-proposal-jztlgxcd

| File | SHA256 |
| --- | --- |
| proposal.md | 23ec76dd1245538a5afe3cfa80b642dbe7b257d0be56373a7c33916abf49eb1b |
| validation.md | c202f54c612dbff4efc242be1fbaf6758ff4551dd46f9c3cdb636545118e363f |
| write-set.json | c0d1be10a93b5306346d5bd2f41f028e6625dab5da2a57a307aef27ef44b8e5f |

Confirmation authorizes creation/binding/formal planning only. #31 stays closed;
#531/#406 remain externally owned. Upstream synthetic proof is independently
sufficient. No candidate, build, sample write, publication or outbound message
has been authorized. Prior archives are method references, never new proof.
