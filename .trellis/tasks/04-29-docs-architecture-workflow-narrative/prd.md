# docs: rewrite architecture page from workflow entrypoint

## Goal

Rewrite the Chinese architecture documentation so readers understand Trellis by following one end-to-end workflow path: a user gives an instruction, Trellis determines the current phase, persists the task, selects context, injects it through hooks or platform equivalents, delegates execution, verifies results, and records the session for next time.

The page should explain the architecture by peeling back each layer from the workflow entrypoint, rather than starting with a static component inventory.

## What I Already Know

* The current page is `docs-site/zh/advanced/architecture.mdx`.
* The current page mixes overall architecture, `workflow.md`, session startup, spec injection, JSONL field reference, and sub-agent flow in a component-first order.
* The preferred new narrative is workflow-first: start from the user's prompt and explain why each Trellis subsystem appears at that point.
* The rewrite should cover hooks and scripts, but as execution points in the workflow chain rather than as a detached file reference appendix.
* The architecture page should avoid duplicating exhaustive reference material already covered by pages such as custom hooks, multi-platform support, and JSONL appendix.
* Relevant existing docs inspected:
  * `docs-site/zh/advanced/architecture.mdx`
  * `docs-site/zh/advanced/custom-hooks.mdx`
  * `docs-site/zh/advanced/appendix-a.mdx`
  * `docs-site/zh/concepts/overview.mdx`
  * `.trellis/spec/docs-site/docs/index.md`

## Assumptions

* This task updates both the Chinese and English architecture pages in the same change.
* The goal is a substantive structure/content rewrite, not just wording polish.
* Diagrams can remain text-based if they are clearer and easier to maintain than images.

## Requirements

* Reframe the architecture page around the lifecycle of one user request.
* Explain the control plane:
  * `workflow.md`
  * workflow phases
  * workflow-state breadcrumbs
  * task status
* Explain the state and persistence layer:
  * `.trellis/tasks/`
  * `task.json`
  * `prd.md`
  * `research/`
  * `implement.jsonl`
  * `check.jsonl`
  * session runtime files
* Explain context routing:
  * `.trellis/spec/`
  * task research artifacts
  * JSONL as context routing manifests
  * what should and should not go into JSONL
* Explain execution roles:
  * `trellis-brainstorm`
  * `trellis-research`
  * `trellis-implement`
  * `trellis-check`
  * `trellis-update-spec`
  * `trellis-break-loop` where appropriate
* Explain hooks and platform equivalents in the request chain:
  * `SessionStart`
  * `UserPromptSubmit`
  * `PreToolUse`
  * extension-backed behavior
  * pull-based prelude behavior
  * no-hook agent-less behavior
* Explain the main project scripts by role:
  * `task.py` as the task lifecycle API
  * `get_context.py` as the context/report API
  * `add_session.py` as the workspace journal API
  * `init_developer.py` / `get_developer.py` as developer identity helpers
  * `hooks/linear_sync.py` as optional lifecycle integration
* End with a consolidated architecture overview after the workflow explanation, not before it.
* Link out to reference pages for detailed JSONL format, hook customization, platform layout, and file path appendix.

## Proposed Page Shape

1. From one user request
2. Session startup gives AI the project map
3. Each prompt receives the current workflow-state
4. Work becomes a task when it needs persistence
5. JSONL chooses the context instead of dumping the repository
6. Skills and sub-agents execute each phase
7. Hooks and platform equivalents inject context at the right moment
8. Finish-work writes the memory for the next session
9. Full architecture recap table
10. Links to reference docs

## Acceptance Criteria

* [ ] A reader can explain how a user prompt travels through Trellis from session start to finish-work.
* [ ] Hooks are described by where they intervene in the workflow, not only by event name.
* [ ] Scripts are described as local APIs with clear ownership of task lifecycle, context generation, and journal writing.
* [ ] JSONL is framed as a context routing manifest, with clear guidance not to use it as a source-code dump.
* [ ] The page avoids duplicating full JSONL field tables and full platform path matrices already covered elsewhere.
* [ ] Any examples match current 0.5 behavior, including agent-capable vs pull-based vs agent-less platform differences.
* [ ] The page links to deeper reference pages where needed.

## Definition of Done

* The relevant docs-site spec is consulted before implementation.
* The Chinese architecture page is rewritten according to the approved narrative.
* The English architecture page is rewritten in sync with the Chinese page.
* Docs formatting is valid MDX.
* Local docs lint/build/typecheck command is run if available.

## Out of Scope

* Changing Trellis runtime behavior.
* Reorganizing the entire docs navigation.
* Rewriting all advanced docs pages.
* Creating new visual assets unless text diagrams prove insufficient.

## Open Questions

* None currently.

## Technical Notes

* Current `task.py` subcommands include: `create`, `add-context`, `validate`, `list-context`, `start`, `current`, `finish`, `set-branch`, `set-base-branch`, `set-scope`, `archive`, `list`, `add-subtask`, `remove-subtask`, and `list-archive`.
* Current `get_context.py` modes include: `default`, `record`, `packages`, and `phase`.
* `add_session.py` writes session summaries to the workspace journal and can include branch, commit, package tag, and detailed content.
* `custom-hooks.mdx` already documents detailed hook configuration; the architecture page should summarize and link to it.
* `appendix-a.mdx` already lists key paths; the architecture page should not duplicate the full path table.
