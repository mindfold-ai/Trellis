# Derive platform template collection from a single description

## Goal

Stop describing each platform's generated files twice. Today `configure` in
`configurators/<platform>.ts` writes them to disk and `collectTemplates` in
`PLATFORM_FUNCTIONS` returns the same set as a map, and the two must agree
byte-for-byte or `trellis update` misreports drift.

21 platforms, 338 lines in the `PLATFORM_FUNCTIONS` block alone, roughly eight
of them hand-rolled rather than going through a shared helper.

## Why this one and not the other convergence

The session-identity audit found two structural duplications. The other — five
unrelated session-identity bridges — is deliberately **not** being touched: all
four of its non-ticket instances are on platforms that currently work, so the
payoff is tidiness and the risk is breaking the only things that work. Rule of
three applies; wait for a third platform to need command prefixing.

This one is different. There is no "it works this way for a reason" defence:
two descriptions of the same thing that disagree is simply a bug. It has already
cost us — removing the dead Codex skills loader this week meant deleting the same
loop from both places, and a one-sided edit would have shipped silently.

It also has a natural safety net. The two paths are required to be byte-identical
and that is already asserted, so a refactor that keeps the tests green is
provably equivalent.

## Do not start by refactoring

The obvious move — make `configure` call `collectTemplates` and write the map —
is right for platforms whose configuration really is "write these files". It is
wrong for any platform that merges into a user-owned file, preserves local
edits, sets permissions, or branches on what already exists on disk. Those
behaviors cannot be expressed as a `Map<path, content>` and quietly dropping
them would be a regression that no byte-comparison test can catch, because
`collectTemplates` never described them in the first place.

`configurators/codex.ts` is 240 lines against a 30-line `antigravity.ts`; that
spread is the tell.

**Phase 1 is an inventory, and its output decides the design.** For each of the
21 platforms, determine:

- what `configure` does that `collectTemplates` does not (merges, preserved user
  edits, `chmod`, conditional writes, directory creation with meaning);
- what `collectTemplates` covers that `configure` does not;
- whether the file set is genuinely identical, or only believed to be.

Write that inventory to `research/` before changing any behavior. If it shows
the two paths already diverge somewhere, that is a bug found — report it rather
than silently normalizing it.

## Requirements

- Phase 1 inventory lands as a document, per platform, with file:line evidence.
- Phase 2 converges only the platforms the inventory shows are pure
  file-emission. Each remaining platform keeps its imperative half with a
  comment saying what cannot be expressed declaratively and why.
- A platform's file set is described **once**. Where an imperative residue
  remains, it must not restate the file list — it operates after the shared
  writer, not instead of it.
- No behavior change. The byte-identity between the two paths is the oracle:
  if a test needed editing to pass, that is a behavior change and must be
  surfaced, not absorbed.
- No new abstraction that has one implementation. If only one platform needs a
  hook point, that platform keeps its code inline.

## Acceptance Criteria

- [ ] `research/configure-vs-collect-inventory.md` covers all 21 platforms with
      evidence, and states for each whether it is convergeable.
- [ ] Every platform the inventory marks convergeable derives its file set from
      one description; `git grep` shows no platform whose file list appears in
      two places.
- [ ] Platforms left un-converged carry a comment naming the specific behavior
      that blocked it.
- [ ] Any pre-existing divergence between the two paths found during the
      inventory is reported explicitly, with whether it was a live bug.
- [ ] `pnpm build`, `lint`, `typecheck`, `test`, `lint:py` clean; both script
      trees byte-identical; test count reported against the 1649 baseline.

## Out of Scope

- The five session-identity bridges.
- `_KNOWN_PLATFORMS`' missing entries.
- Adding or removing any generated file. This changes where the description
  lives, not what gets written.

## Rescope (2026-08-08, sd-ai-command-pack cross-repo review)

6ddd9412 appears to implement the core of this task. Verify that commit
against the acceptance criteria, then close/archive if it covers them.
