# Baseline and ownership

- Issue #46 and paired Guru #577 were read live on 2026-10-17. Baseline `upstream/main` and this branch start at `fda3e12181b72d7aa33cdad54066d33d3386b621`.
- Original main checkout was clean with no exact current-session Task. One unrelated project Task existed and was not selected or modified.
- Isolated managed checkout: `/Users/wumengye/.codex/worktrees/46-legacy-archive-resume/Trellis`, branch `codex/46-legacy-archive-resume`.
- Original workflow has no Delivery runtime declaration; current work Task is canonical schema1. It uses native Plan/Execute/Finish with curated manifests, not synthetic schema2 results.
- `classifyMaintenanceTask` supports finite known legacy/schema1; existing migration projection preserves generation and forbids changing/initializing artifact_origin.
- Native `session_storage.resolve_task_identity` skips archive; retained source and one active current projection can coexist. Creation uniqueness still reserves archive IDs and must not be reused blindly.
- Existing conversion and historical closeout share the independent fixed-plan executor. Formal `reopen_task` remains separate and requires actual Completion.
- Peer inheritance inspection establishes ownership only. No business repository restoration, cross-repository implementation, package publication, global installation or resource cleanup is authorized by this task scope.
- Guru #577 owns semantic intent/history review, private owner maintenance and joint next-owner acceptance. This repository must supply a reproducible matching installable candidate and targeted public/native evidence, and explicitly distinguish that from Guru integration.
