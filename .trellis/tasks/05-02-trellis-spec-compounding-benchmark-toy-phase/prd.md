# Trellis Spec-Compounding Benchmark (Toy Phase)

## Goal

Prove (or refute) that Trellis's structured spec accumulation produces a **measurable learning curve** across a sequence of related coding tasks — something existing one-shot benchmarks (SWE-bench, TerminalBench-2, HumanEval) cannot reveal.

The toy phase deliberately uses a synthetic repo with **planted, recurring conventions**, so the spec-compounding signal isn't drowned in real-repo noise. Only after the toy shows signal do we invest in SWE-bench scale.

## Why This Benchmark Doesn't Exist Yet

Surveyed benchmarks (Meta-Harness suite, SWE-bench, TerminalBench-2, HCAST) all evaluate **stateless one-shot** tasks. None measure cross-task knowledge accumulation. Trellis's core value proposition — "the project's spec library compounds, AI gets better as the repo's history grows" — has no existing yardstick.

## What I Already Know

- Three-arm comparison is the cleanest design:
  - **A. Bare** — wipe `.trellis/` between tasks (control: no memory)
  - **B. Free notes** — keep a single `NOTES.md` the AI writes freely (control: unstructured memory)
  - **C. Trellis** — keep `.trellis/spec/` + run `trellis-update-spec` after each task
- Test on **Haiku 4.5**: weak-model leverage is where Trellis's pitch lives ("Haiku + Trellis ≈ Opus bare").
- Toy uses ~10 sequential tasks in a synthetic repo with planted conventions that recur (Result type, log format, test layout, error wrapping, etc.).
- Each task ships with auto-grading tests (binary pass/fail).
- Inspired by Meta-Harness's protocol: held-out evaluation, multi-seed, tracked trace per attempt.

## Assumptions (to validate)

- Haiku 4.5 is reachable via API budget; budget ceiling for toy phase ≈ \$100.
- The Trellis CLI's existing `trellis-update-spec` skill can run unattended inside the bench loop without hand-holding (needs verification).
- A Claude Agent SDK driver script can wrap each "task attempt" as one autonomous run with tool access (Read/Edit/Bash + tests).
- Synthetic repo can be small: ~5 source files, grows to ~15 over the sequence.

## Open Questions (Blocking + Preference)

- **Q1 (Blocking)**: Budget approval — the toy needs ~\$50–\$100 of Haiku 4.5 API credit. Acceptable?
- **Q2 (Preference)**: Where does the benchmark code live? Options below in Approaches.
- **Q3 (Preference)**: What's the synthetic repo's flavor — TypeScript web API, Python CLI, or a Trellis-flavored mini-CLI? Affects how realistic the planted conventions feel.
- **Q4 (Blocking)**: Does the existing `trellis-update-spec` skill auto-run end-to-end without interactive confirmation? If not, design a lightweight bench-mode wrapper.
- **Q5 (Preference)**: Number of seeds per arm — 3 (cheaper, ~\$50) or 5 (tighter CIs, ~\$100)?

## Requirements (evolving)

- **Sequential task suite**: 10 ordered tasks in a synthetic repo, each with planted convention(s) that recur in later tasks.
- **Auto-grader**: every task ships unit/integration tests; one command returns pass/fail.
- **Three-arm runner**: a single CLI like `bench run --arm {bare,notes,trellis} --seed N` that drives Haiku 4.5 through tasks 1→10.
- **Per-attempt artifact**: each task attempt persists `attempt.log` (tool calls), `final_diff`, `test_output`, `pass/fail` to a results dir.
- **Aggregator**: produces the **learning curve** plot (x = task index, y = cumulative pass rate) and per-arm summary stats.
- **Reproducibility**: seed-controlled; full results dir checked in (or gitignored with a manifest).

## Acceptance Criteria (evolving)

- [ ] 10 toy tasks defined with planted recurring conventions and auto-grading tests
- [ ] Bench runner script supports all three arms with a single flag
- [ ] One full run (3 arm × 3 seed × 10 task) completes within budget
- [ ] Learning-curve plot generated end-to-end from results
- [ ] Decision rule documented: what slope/gap counts as "signal seen" → invest in Phase 3 (SWE-bench)
- [ ] Decision rule for "no signal" → root-cause memo before extending

## Definition of Done

- All artifacts (task suite, runner, aggregator, plot) checked into the repo
- Brief findings memo written to `research/findings.md` with the curve and a "go / no-go to Phase 3" recommendation
- Lessons captured into `.trellis/spec/` if any new conventions emerge

## Out of Scope (toy phase)

- Real-repo data (SWE-bench, sympy/astropy) — that's Phase 3
- Opus 4.6 runs — Haiku-only for cost
- Meta-Harness style automatic harness optimization — that's an aspirational Phase 4
- Multi-language repos
- Public benchmark submission / leaderboard packaging

## Technical Approach (to refine after Q&A)

Three feasible approaches for **where the benchmark lives**:

**Approach A: New `packages/bench/` workspace** (Recommended)
- How: add a sibling pnpm/uv package alongside `packages/cli/`
- Pros: lives with Trellis source, dogfoods our own monorepo conventions, easy to publish later
- Cons: pollutes the CLI release surface unless we mark it private

**Approach B: Sibling repo (e.g. `Trellis-bench/`)**
- How: separate git repo, depends on Trellis as a peer
- Pros: clean separation, can iterate independently, won't bloat CLI installs
- Cons: cross-repo workflow friction, harder to dogfood Trellis itself on it

**Approach C: `.trellis/workspace/bench/` inside this repo**
- How: keep bench scripts and synthetic project under workspace area
- Pros: zero packaging overhead, fastest start
- Cons: not reusable by external users, mixes evaluation infra with project state

Default driver: **Claude Agent SDK** (TypeScript or Python) wrapping each task attempt as one autonomous run with `Read/Edit/Bash` tools and a configured working directory.

## Research References

- Meta-Harness post (yoonholee.com/meta-harness) — protocol inspiration: held-out tasks, multi-model transfer, raw-trace diagnosis. Their "online classification" benchmark is the closest existing analogue and shows that **a sequential-with-memory benchmark is tractable to build**.

## Technical Notes

- Existing Trellis bits to leverage: `.trellis/scripts/task.py` (task lifecycle), `trellis-update-spec` skill (spec capture), `.trellis/spec/` structure (where compounded knowledge lands).
- Haiku 4.5 model id: `claude-haiku-4-5-20251001`.
- Cost rough math: 10 task × 3 arm × 3 seed × ~30 tool calls × ~5K tokens avg ≈ 1.35M output tokens → ≈ \$50 on Haiku.
