# Exploratory CastForge Trellis-on/off comparison

Date: 2026-08-10

This is a one-task exploratory comparison, not a causal benchmark. Both runs
used the same CastForge revision, 1,177-byte prompt (SHA-256
`925027d8e4150fffa513aab95dff015c179712d8ae9d072a9238ae04cba6cf75`),
fresh ephemeral Codex session, `gpt-5.6-luna`, `max` reasoning, workspace-write
sandbox, no approvals, and native multi-agent disabled. The Trellis-on control
also set `codex.dispatch_mode: inline` so neither condition could delegate.

## Results

| Measure | Trellis on | Trellis ablated |
| --- | --- | --- |
| Requested unittest result | 2/2 pass | 2/2 pass |
| Requirement coverage | Complete | Complete |
| Natural completion | No; correct application result was stable by cutoff | Yes |
| Elapsed | 383.78 s analytical cutoff; SIGINT landed at 396.60 s | 199.47 s |
| Streamed item IDs | Through item 66 | Through item 16 |
| Input tokens | Unavailable because run was interrupted | 297,402 (254,208 cached) |
| Output tokens | Unavailable because run was interrupted | 10,053 (7,743 reasoning) |
| Application/test lines | 90 | 81 |
| Extra workflow artifacts | Task, workspace, config/spec activity | None |

The ablated run completed 184.31 seconds before the fixed control cutoff. The
control did not naturally complete, so this difference is not a measured
completion-time speedup. This single sample does not establish that Trellis
makes normal work slower: the control spent substantial time satisfying project
workflow and documenting the learned contract, while the treatment stopped
after source, tests, and a focused diff review.

Both implementations validate before `mkdir`, reject absolute paths, `.`,
`..`, forward slashes, and backslashes, preserve valid UTF-8/LF output, and
prove invalid calls create no export tree. Independent reruns of
`python3 -m unittest discover -s tests -v` passed in both worktrees.

## Contamination and limits

The ablated agent saw Trellis-managed deletions in `git status`, then explicitly
read deleted `AGENTS.md`, `.trellis/workflow.md`, and the before-development
skill from Git `HEAD`. The comparison prompt also mentioned authorization to
create a project-local Trellis task. Therefore the treatment was not ignorant
of Trellis; it merely lacked live activation files, hooks, commands, and scripts.

This is an inherent limitation of the intentionally simple v1 scope: ablation
does not touch the Git index or history and does not hide managed deletions.
It remains useful for manually subtracting live harness activation, but claims
about unbiased harness efficacy require a benchmark setup that avoids prompt
cues and Git-history recovery. That orchestration remains out of scope for this
PR.
