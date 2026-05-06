# Docs-Site Release Lifecycle

> How `docs-site/` is structured across `release-only`, `release+beta`, `release+rc` states, and the three scripts that drive transitions.

---

## Convention: root = current stable

The directory layout pins one role per location:

| Path                                      | Role                                     |
| ----------------------------------------- | ---------------------------------------- |
| `docs-site/{start,advanced,...}` (root)   | **Current stable** (latest GA). Default. |
| `docs-site/beta/{start,advanced,...}`     | Active **beta** cycle (when one exists). |
| `docs-site/rc/{start,advanced,...}`       | Active **RC** cycle (renamed from beta). |

Non-versioned trees (`blog/`, `showcase/`, `contribute/`, `skills-market/`, `templates/`, `use-cases/`, `marketplace/`, `concepts/`, `essentials/`, `api-reference/`, `ai-tools/`, `guides/`, `snippets/`, `images/`, `logo/`) live only at root and are read by every version.

---

## 4 lifecycle states

```
T0  release-only          ← steady state between cycles
        │   docs.json: versions = ["Release"]
        │   files:     root/{start, advanced, ...}
        │
        ▼   start a beta cycle
T1  release + beta
        │   docs.json: versions = ["Release", "Beta"]
        │   files:     root/...    +  beta/{start, advanced, ...}
        │
        ▼   beta → rc
T2  release + rc
        │   docs.json: versions = ["Release", "RC"]
        │   files:     root/...    +  rc/{start, advanced, ...}     (rename beta/ → rc/)
        │
        ▼   rc → release (GA promote)
T3  release-only           ← back to T0; root is the new GA
        │   docs.json: versions = ["Release"]
        │   files:     root/...    (rc/* content folded into root, rc/ deleted)
        ▼
```

---

## Scripts

Three POSIX shell scripts in `docs-site/scripts/`:

| Script                  | Transition  | What it does                                                       |
| ----------------------- | ----------- | ------------------------------------------------------------------ |
| `docs-beta-start.sh`    | T0 → T1     | Copy versioned content (`start/`, `advanced/`, `index.mdx`) from root → `beta/`. Mirrors `zh/`. |
| `docs-beta-to-rc.sh`    | T1 → T2     | `git mv beta rc` (and `zh/beta` → `zh/rc`). Bulk text replace `@beta` → `@rc` inside `rc/*` content. |
| `docs-promote.sh`       | T2 → T3     | Detect dev tree (`rc/` preferred over `beta/`), overwrite root versioned content with dev content, mirror in `zh/`, `git rm` dev tree. |

All three are **content-copy / rename only**. They never touch `docs.json` or the banner — those follow as manual edits because they're decision-driven.

### Manual followups

Each script ends with a checklist of `docs.json` edits and content scrubs the maintainer must apply before committing. Always:

| After                  | Edit `docs.json`                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `docs-beta-start.sh`   | Add `"Beta"` version block to `versions[]`. Add banner. Bump beta install commands to `@beta`. |
| `docs-beta-to-rc.sh`   | Rename `"Beta"` label → `"RC"`. Update each page entry `beta/* → rc/*`. Update banner.        |
| `docs-promote.sh`      | Drop the `"Beta"` / `"RC"` version block from `versions[]`. Drop banner. Update navbar `href`. |

---

## When to use each

| Scenario                                                | Script                                | Trigger                                                |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| First beta of a new minor / major (e.g. `0.6.0-beta.0`) | `docs-beta-start.sh`                  | Right before `pnpm release:beta` for the `.0`          |
| Beta cycle stabilizing → first RC                       | `docs-beta-to-rc.sh`                  | Before `pnpm release:rc` for the `-rc.0`               |
| RC stable → cut GA                                      | `docs-promote.sh`                     | Before `pnpm release:promote`                          |
| Subsequent beta / rc patches (`-beta.1`, `-rc.1`, ...)  | (none — just write the changelog mdx) | Per-patch; no structural change needed                 |

**Per-patch flow** (`-beta.1` → `-beta.2`, `-rc.1` → `-rc.2`, ...): just create `changelog/v<version>.mdx` (en + zh), add to top of pages list in `docs.json`, bump navbar href. No script invocation.

---

## One-time historical flip (0.5.0 GA)

Before 0.5.0, the layout was inverted: `root/` held the **dev** content (RC), and `release/` held the **previous GA** archive (0.4.0). At 0.5.0 GA we flipped to the convention above:

- Root content (was `0.5.0-rc.X`) became the new stable `0.5.0` GA in place
- `release/` (0.4.0 archive) was deleted (`git rm -r`); 0.4.x docs remain accessible via the `v0.4.0` git tag
- `docs.json` collapsed from 2 versions to 1 (`Release` only)
- The 3 scripts were introduced to keep the lifecycle reproducible going forward

After this flip, every future cycle uses the scripts; no further manual restructure should be needed.

---

## Gotchas

### `docs.json` doesn't auto-update

Scripts only touch content trees. Forgetting the `docs.json` followup leads to:

- `T1 → T2`: pages still resolve at `beta/...` URLs but dropdown labels `RC` (404 on click)
- `T2 → T3`: stale `RC` dropdown remains while content is gone (404 on every page)

Always run `mintlify dev` locally after the script + manual edits to catch routing drift before push.

### Banner is sticky

The RC banner has been `"📦 Reading **RC** docs (0.5.0-rc.0)..."` literally across rc.0–rc.7 because nothing auto-bumps the version inside it. Either:

- Treat the banner as "RC docs in general — check `trellis --version` for your install" (current pattern), or
- Bump it as part of `docs-beta-to-rc.sh` followup (current scripts do not — they only print a reminder)

### MDX `<Note>` / `<Warning>` closing tags must NOT be indented

When a `<Note>` block contains a markdown list, prettier auto-indents the closing tag to align with the list:

```mdx
<Note>
- bullet
  </Note>   ← BREAKS Mintlify parser: "Expected closing tag </Note> after end of listItem"
</Note>     ← correct: closing tag at column 0
```

If you commit through `lint-staged` + prettier, expect re-indentation. Manually re-fix and commit, or add a `// prettier-ignore` if the project later supports it. Always run `pnpm dev` (mintlify) before pushing changelog mdx with these blocks.

### Stash workflow when RC and GA prep overlap

If you're staging GA content (`changelog/v0.5.0.mdx`, scripts/, `release/` deletions) while still needing to ship one more rc.X:

```bash
cd docs-site
git stash push -u -m "GA promote prep"  # park GA changes
# ... work on rc.X (changelog mdx + docs.json bump) ...
git commit && git push
git stash pop                            # restore GA prep; resolve docs.json conflict
```

The `docs.json` conflict at pop is expected — the rc.X commit added `v0.5.0-rc.X` at the top of pages list, while the stash had `v0.5.0` at the top. Keep both, with `v0.5.0` first (GA), then `v0.5.0-rc.X`, then older entries.
