Load the `trellis-brainstorm` skill and iterate on prd.md with the user.
Phase 1.3 jsonl curation is **skipped** in inline dispatch mode — the main session loads `trellis-before-dev` directly in Phase 2 and reads spec context itself, so there is no sub-agent to inject jsonl into.
Then run `task.py start <task-dir>` to flip status to in_progress.
