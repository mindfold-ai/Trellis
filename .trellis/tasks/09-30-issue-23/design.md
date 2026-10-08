# Issue #23 Technical Design

## Runtime and Model

Remove User/personnel fields from Python TaskData/TaskInfo, task loading, creation, queue results, list filters and context output. Remove personnel-filter helpers and CLI flags rather than redirecting them to another identity source. Delete old entry scripts instead of keeping diagnostics. Remove task-derived Linear personnel mapping and its configuration examples; retain unrelated Linear issue operations.

Remove personnel fields from the core record interface, field ordering, validation and empty-record factory. New factories never populate them. Current record readers reject unknown schema fields, and writers emit only the current schema; optional current branch metadata remains supported. Do not add legacy parsing or write-back behavior; historical task files remain untouched and unsupported.

Remove init/update options, interactive prompts and ownership preflight. Bootstrap tasks use the current schema. Preserve task source, lifecycle identity, session bindings, priority, task tree and unrelated archive behavior.

## Brainstorm and Caller Ownership

The common brainstorm template is the canonical behavior source. Its input is a requirement/problem plus optional evidence context and caller-provided output destination. An active task is optional and is not selected by the skill. It explores evidence, asks one substantive decision at a time, converges requirements and produces requirements/design/execution-plan content as appropriate.

Remove task CLI commands, directory creation/selection, ownership questions, activation/archive operations, lifecycle confirmation gates and task JSONL validation from brainstorm. If no output path is supplied, return planning content in conversation without filesystem lifecycle effects. Preserve requirement convergence, lossless consolidation, evidence-first questions and a reviewable final planning summary.

Outer workflow owns consent, task creation and paths, then invokes brainstorm with that destination. It owns context manifests, artifact review, explicit implementation approval and activation after brainstorm returns. Synchronize start/continue hooks, commands, descriptions and workflow breadcrumbs so they neither delegate lifecycle ownership back to brainstorm nor depend on personnel input.

## Distribution and Historical Boundaries

Derive platform generation coverage from the live platform registry. Edit canonical templates first and synchronize tracked installed copies. Remove former identity/history path checks, Git exclusions, migration detectors, guides and active references from runtime, templates, maintained specs and tests. Keep historical files on disk without loading them into the current runtime. Generic project-boundary and ownership safety must not rely on names of former data stores. Remove channel-thread personnel assignment rather than preserving a parallel active feature.

Do not edit independent submodule repositories as part of source synchronization. Record relevant external maintained references and downstream follow-up explicitly.

## Breaking Compatibility and Versioning

Remove personnel CLI flags, SDK record fields, Python fields and queue helpers. Unsupported flags produce ordinary argument errors. Old task JSON is not a supported input and receives no migration or supplemental information.

Use the next installable castbox candidate with paired CLI/core versions. The current runtime must not load historical manifests for compatibility. Old installed versions fail before reading their project data; fresh init and same-version reapply remain supported. Do not publish implicitly.

Delete the cumulative retirement module and its generated migration task. Replace special historical-path guards with generic project-boundary checks where needed; ownership-based removal must leave unknown historical files untouched. Current-version update uses normal managed-file conflict handling without content inspection for old instructions.

## Validation and Rollback

Test new creation, bootstrap, text/JSON listing and context; continuation/archival of current records; rejected old options; taskless brainstorm; caller-owned lifecycle; channel behavior; full registry generation; fresh init and same-version reapply. Verify old-version update rejects before historical reads or writes.

Run meaningful targeted tests, then repository lint/typecheck/build and full existing suites for the shared-model blast radius. Static skill checks establish prompt contracts; actual Guru model behavior requires downstream validation and must not be reported as passed from static inspection.

Rollback is a scoped revert of this unpublished change. Historical files are never transformed.
