# Style Guide

> Writing style and content standards for documentation.

---

## Voice and Tone

### Guidelines

| Aspect     | Guideline                                               |
| ---------- | ------------------------------------------------------- |
| **Voice**  | Professional, friendly, direct                          |
| **Tense**  | Present tense ("Click the button" not "You will click") |
| **Person** | Second person ("You can..." not "Users can...")         |
| **Mood**   | Imperative for instructions ("Run the command")         |

### Examples

**Good:**

> Run the following command to start the server.

**Avoid:**

> The user should run the following command to start the server.

---

## Page Structure

### Standard Page Template

```mdx
---
title: 'Clear, Action-Oriented Title'
description: 'What the reader will learn or accomplish (150 chars)'
---

Brief introduction paragraph explaining what this page covers.

## First Major Section

Content here...

### Subsection if needed

More detail...

## Second Major Section

Content here...

## Next Steps

Links to related content or next actions.
```

### Heading Hierarchy

| Level | Usage                                    |
| ----- | ---------------------------------------- |
| H1    | Never use (title comes from frontmatter) |
| H2    | Major sections                           |
| H3    | Subsections                              |
| H4    | Rarely needed, avoid if possible         |

---

## Writing Guidelines

### Titles

| Type            | Format        | Example                               |
| --------------- | ------------- | ------------------------------------- |
| Page title      | Title Case    | "Getting Started with the API"        |
| Section heading | Sentence case | "Configure your settings"             |
| Description     | Sentence      | "Learn how to set up authentication." |

### Technical Architecture Openings

Open technical architecture pages with the system thesis, then immediately ground it in concrete scope, modules, and source-of-truth files. Product positioning is acceptable when it names the architecture being documented; audience storytelling is not.

**Good:**

> Trellis is a Team-level Agent Harness with built-in LLM wiki. In implementation terms, that means two systems share the same project files: the agent harness controls workflow execution, and the LLM wiki stores specs, tasks, research, and journals.

**Avoid:**

> This page is for contributors and fork modders: engineers extending Trellis itself, not end users.

**Why**: Architecture docs should preserve the conceptual model, but the opening must quickly become a technical map. Audience labels and unsupported positioning prose make the page feel like a pitch instead of a technical contract.

### Lists

**Use bullet lists for:**

- Non-sequential items
- Feature lists
- Requirements

**Use numbered lists for:**

1. Step-by-step instructions
2. Ordered processes
3. Prioritized items

### Code References

- Use backticks for inline code: `npm install`
- Use code blocks for multi-line code
- Always specify language for syntax highlighting

---

## Content Types

### Conceptual Content

Explains what something is and why it matters.

```mdx
## What is Authentication?

Authentication verifies the identity of users accessing your API.
It ensures that only authorized users can perform actions.
```

### Procedural Content

Step-by-step instructions for completing a task.

```mdx
## Set Up Authentication

1. Navigate to the Dashboard
2. Click **Settings** > **API Keys**
3. Click **Generate New Key**
4. Copy the key and store it securely
```

### Reference Content

Technical specifications and API details.

```mdx
## API Response Codes

| Code | Meaning      |
| ---- | ------------ |
| 200  | Success      |
| 400  | Bad Request  |
| 401  | Unauthorized |
| 500  | Server Error |
```

### Architecture Content

Architecture and system-overview pages should explain the request or
workflow path before listing components.

```mdx
## From one request

Explain how a user action moves through the system:
input -> state lookup -> context selection -> execution -> verification
-> persistence.

## Component recap

Summarize each component after the reader understands why it appears.
```

**Why**: Component-first pages force readers to memorize names before
they understand the problem each component solves. A workflow-first path
shows when each file, hook, script, or role becomes necessary, then the
recap table reinforces the model.

**Reference detail**: Put exhaustive field tables, path matrices, and
per-platform configuration in reference pages or appendices. The
architecture page should summarize and link to those references instead
of duplicating them.

---

## Formatting Standards

### Emphasis

| Style    | Usage                        | Markdown     |
| -------- | ---------------------------- | ------------ |
| **Bold** | UI elements, important terms | `**text**`   |
| _Italic_ | Introducing new terms        | `*term*`     |
| `Code`   | Commands, file names, code   | `` `code` `` |

### Links

**Internal links:**

```mdx
See the [quickstart guide](/quickstart) for setup instructions.
```

**External links:**

```mdx
Read the [official documentation](https://example.com/docs).
```

### Images

```mdx
![Alt text description](/images/screenshot.png)
```

Always include descriptive alt text.

---

## Best Practices

### DO

- Start with the most important information
- Use concrete examples
- Keep paragraphs short (3-4 sentences max)
- Include code samples for technical content
- Link to related content

### DON'T

- Assume prior knowledge without linking to prerequisites
- Use jargon without explanation
- Write walls of text without visual breaks
- Skip alt text on images
- Use vague language ("simply", "just", "easily")

---

## Changelog / Release Notes Voice

Release notes (`docs-site/changelog/v*.mdx` and `docs-site/zh/changelog/v*.mdx`) are read by operators deciding whether to upgrade and by AI agents answering version questions. They are **reference docs**, not product storytelling. Match the tone of `kubectl` / Rust release notes, not marketing copy.

### Convention: Technical voice

**What**: Each section opens with one sentence stating what changed, followed by concrete identifiers (file paths, function names, flags, migration entries). Prefer tables, code blocks, and bullets over paragraphs. No rhetorical questions, no emotional language, no filler adverbs.

**Why**: A user scanning a changelog wants to answer "does this affect me, and what do I do?" in seconds. Narrative background ("then what? then nothing") pushes the actual change further down the page and tells readers how to feel rather than what changed. It also ages badly — in six months the only reader is an AI grepping for `phase.py` or `init.ts:1370`, not someone reliving the UX story.

**Example (changelog entry)**:

```markdown
### Joiner onboarding task

`trellis init` now dispatches on two filesystem flags:

| `.trellis/` | `.trellis/.developer` | Generated task |
|---|---|---|
| missing | n/a | `00-bootstrap-guidelines` (creator, unchanged) |
| present | missing | `00-join-<slug>` (new: joiner flow) |
| present | present | none (same-dev re-init) |

`.trellis/.developer` is the per-checkout signal because it's listed in
`.trellis/.gitignore` and therefore absent on fresh clones.
`.trellis/workspace/<name>/` cannot serve this role — it's committed to git.
```

**Related**: `Best Practices > DON'T > use vague language` above. Changelog narrative flourishes are the same anti-pattern at document level.

### Don't: Narrative storytelling in changelogs

**Problem**:

```markdown
### Joiner 引导任务——新开发者不再进来一脸懵

这个版本之前，新开发者在一个已有 Trellis 项目上第一次跑 `trellis init` 几乎啥都不做：
只往 `.trellis/.developer` 写了个身份文件，然后呢？然后就没然后了。打开 AI 工具面对
的是一片空白，不知道 Trellis 是什么、团队约定在哪、自己该做什么。队友只能反复在
群里解释工作流。

beta.9 起，`trellis init` 按两个文件的存在状态分三种场景派发：
```

**Why it's bad**:

- Rhetorical questions ("然后呢？然后就没然后了") and emotional framing ("一脸懵", "反复在群里解释") don't help an upgrade decision.
- The actual change (dispatch on two flags → three branches) is buried three paragraphs in.
- Language ages badly. In six months "一脸懵" reads as noise; the dispatch table still holds.
- Title is an outcome statement ("不再进来一脸懵"), not a feature name. Hard to grep for.

**Instead**:

```markdown
### Joiner onboarding task

`trellis init` now dispatches on (`.trellis/`, `.trellis/.developer`) presence
to generate three task types: creator bootstrap, joiner onboarding, or no task.
```

Lead with the change. Background (if any) goes into a second paragraph or a collapsed "Why" subsection — not in the opening sentence.

### Section heading rules

- **Use feature names, not outcomes**: `### Joiner onboarding task`, not `### New developers aren't thrown into a black box anymore`.
- **Stable across translations**: same technical nouns in both `docs-site/changelog/` and `docs-site/zh/changelog/`.
- **Greppable**: include exact identifiers users might search for (`task.json`, `trellis init`, `/trellis:finish-work`).

### Backstory goes elsewhere

Product narrative ("why we're doing this", user quotes, design rationale) belongs in:

- **Task PRD** (`.trellis/tasks/<task>/prd.md`) during development
- **Blog post** (`docs-site/blog/`) for marketing
- **Spec decision record** (`spec/*/` design-decision sections) for lasting architectural choices

The changelog just records what shipped and how users upgrade.

---

## Source-of-Truth Discipline for Code-Level Docs

When a page documents **code-level contracts** — JSON schemas, CLI subcommand tables, config field lists, file path references, default values — **open the source file first** and copy the list verbatim (field order, names, defaults) before writing a single line of prose. Don't document from memory, and don't propagate what existing docs already say without re-verifying.

### Why

Docs drift silently. `task.json` schema docs claimed `task.py create-pr` and `rejected` status existed for multiple releases — neither was ever in the source. The schema field order was shuffled, comments described behavior the code doesn't implement ("commit hash filled on archive" when `archive` only writes `completedAt`). Every one of these is a ~30-second verification away from the truth.

### Rule

Before writing or editing code-level reference docs:

1. Identify the **canonical source** — usually a single file (e.g. `task_store.py`, `init.ts`, a Zod schema). Link to it in the doc so reviewers can cross-check.
2. **Copy field order** from source. Don't alphabetize, don't reorder "for readability".
3. **Quote source line numbers** in commit messages (`task_store.py:147-172`) so the provenance is traceable.
4. When comments describe "when is this populated" — grep for every writer. If the only writer is `create()`, say "written as null; no other code paths update it" — don't invent imaginary lifecycle events.
5. When multiple writers exist with divergent shapes (e.g. `task_store.py` vs `init.ts` vs `update.ts`), either document all variants or document the canonical one and file a code-cleanup task to converge them. **Don't paper over divergence with optimistic prose.**

### Common Mistake: Documenting from prior docs

**Symptom**: Doc says field X or subcommand Y exists. Reader tries it. Nothing happens.

**Cause**: The doc was copied from a previous version of itself. The previous version was wrong. The field / subcommand was aspirational, removed, or never merged.

**Fix**: For every code-level claim, grep the source. If no code path writes/reads it, delete the claim.

**Prevention**: When editing an existing reference page, treat the prior content as unverified. The only trustworthy version is the source file.

---

## JSONL Context Injection Content

When writing docs, skills, commands, or templates that teach users about `implement.jsonl` / `check.jsonl` / `research.jsonl` entries, enforce this content rule:

### Rule

JSONL entries point at **spec files** (`.trellis/spec/**`) or the task's **research outputs** (`{TASK_DIR}/research/**`). They do NOT point at raw source files (`src/services/foo.ts`) or raw source directories (`packages/<pkg>/`).

### Why

Sub-agents already have `Read` / `Grep`. They pull code on demand. Injecting source files into the prompt:

- Burns tokens in every sub-agent spawn for code that may not even be relevant to this turn
- Makes JSONL entries decay fast (code moves; a path pinned by JSONL is stale the moment you refactor)
- Gives AI a false impression that the injected files are the "authoritative" code, biasing toward them even when better code exists elsewhere

Specs and research, by contrast, *are* the rules and background the sub-agent needs before touching code. They're the right payload.

### Example

```jsonl
# Good — specs + research
{"file": ".trellis/workflow.md", "reason": "Workflow contract"}
{"file": ".trellis/spec/backend/api-module.md", "reason": "API module conventions"}
{"file": ".trellis/tasks/02-27-user-login/research/", "type": "directory", "reason": "Upstream research outputs"}

# Bad — raw code
{"file": "src/services/auth.ts", "reason": "Existing auth patterns"}
{"file": "src/services/", "type": "directory", "reason": "Existing service patterns"}
```

### Writer's check

When you add a JSONL example or write a skill that calls `task.py add-context`:

- [ ] Is the path under `.trellis/spec/` or `{TASK_DIR}/research/`?
- [ ] If you're tempted to point at `src/` or `packages/`, ask: is this really a *rule* the agent needs up-front, or just code it could grep for itself when needed?

---

## Tombstone Sections: Delete, Don't Archive

When content becomes obsolete because a feature was removed, **delete the content outright**. Don't leave a "What was removed in vX.Y" table or a standalone "Appendix X: feature (removed)" page.

### Why

Tombstone sections:

- Pollute the TOC and in-page sidebar
- Repeat migration guidance that belongs in the changelog / migration manifest, not the reference docs
- Teach readers to skim-ignore sections — the "noise sections" train them to tune out legit content too
- Accumulate across versions (every release adds one; none ever removes one)

### Rule

When a feature is removed:

1. Delete the sections / pages that documented it.
2. Put the "what to do instead" guidance in **one place** — the release changelog or migration manifest's `notes` field. Link to it from the top-of-page `<Note>` for the one release that removes it, then drop the note the release after.
3. If a former section is heavily cross-referenced, check for incoming links and redirect them; don't keep the tombstone just to preserve URLs.

### Example

**Wrong** (actual regression seen in 0.5 audit):

```markdown
## Appendix E: worktree.yaml (removed)

This appendix previously documented…  Both the pipeline and this file
were removed in 0.5.0-beta.0 along with…
```

**Right**: delete `appendix-e.mdx`, remove it from `docs.json`. Note in the 0.5.0-beta.0 changelog that Multi-Agent Pipeline was removed and `worktree.yaml` is no longer read.

---

## Managing the Release / Beta Dual Track

The docs-site has two version tracks: **Beta** (tracks the latest `@beta` npm release, currently 0.5.x) and **Release** (tracks the latest stable, currently 0.4.0 GA). Users pick one from the version dropdown. Only part of the content is version-coupled.

### What's dual, what's single-source

| Lives in `release/` and `zh/release/` too | Single-source (top-level only) |
|---|---|
| `guide/ch01` – `ch13` (concepts, commands, platform matrix) | `use-cases/` |
| `guide/appendix-a` – `appendix-f` | `showcase/` |
| `guide/index.mdx`, `index.mdx` (landing) | `blog/` |
| `changelog/` (version entries) | `skills-market/` |
|  | `templates/` |
|  | `contribute/` |

**Rule of thumb**: anything that describes *how Trellis works right now* is dual (because that changes per version). Anything marketing, community, or resource-discovery stays single-source — those pages don't change per version, so maintaining two drift-prone copies burns effort for no user benefit.

When in doubt, ask: "Would a 0.4 user genuinely see something different on this page than a 0.5 user?" If no, it's single-source.

### Source of truth for platform counts

Platform count drifts across releases (0.4 = 14 platforms, 0.5 = 13 after iFlow removal). **Always derive the count from the CLI source for the version you're documenting, not from prior docs.**

```bash
# For Release track (documents 0.4.0 GA)
git ls-tree v0.4.0 packages/cli/src/configurators/ | grep '\.ts$' \
  | awk -F'[\t/]' '{print $NF}' | grep -v 'index\|shared\|workflow'

# For Beta track (documents current HEAD)
ls packages/cli/src/configurators/*.ts | xargs -n1 basename \
  | grep -v 'index\|shared\|workflow'
```

The count is `(number of configurator files) - (index.ts + shared.ts + workflow.ts)`.

### Per-platform directory layout for a specific version

To document what `trellis init --<platform>` actually writes in a given version:

```bash
git show v0.4.0:packages/cli/src/configurators/qoder.ts | head -60
git ls-tree -r v0.4.0 packages/cli/src/templates/qoder/
```

Don't infer from memory or from current beta templates — 0.5 adds `hooks/` and `rules/` to platforms that didn't have them in 0.4, so a current-beta listing will mis-describe 0.4.

### Orphan changelog files

When a `release/changelog/v*.mdx` file exists on disk but has no entry in `docs.json`'s Release dropdown, it's dead content — Mintlify doesn't render it in any nav, users can only reach it by guessing a URL. Delete it.

```bash
# List orphans (files on disk, not in docs.json)
cd docs-site
for f in release/changelog/*.mdx; do
  base=$(basename "$f" .mdx)
  grep -q "\"release/changelog/$base\"" docs.json || echo "$f"
done
```

Common source: when the track was forked from beta with `cp -r`, pre-release changelog files came along but the Release dropdown was manually whitelisted to stable versions only. Result: 30+ orphan MDX per locale.

### What each track is called

- **Beta track** = `guide/`, `changelog/`, `index.mdx` (at the top level) — latest `@beta` content
- **Release track** = `release/guide/`, `release/changelog/`, `release/index.mdx` — snapshot of the latest stable
- `docs.json` navigation has separate blocks for Beta and Release. Each language (EN, ZH) has both, so there are **4 navigation blocks total**.

Switching content between tracks is a `cp -r` with manual `docs.json` updates — there's no automation. Remember to update **all four navigation blocks** (EN Beta, EN Release, ZH Beta, ZH Release) when restructuring.

### When the stable GA bumps

When 0.5 reaches GA:

1. Decide whether to promote beta content → release (overwriting the frozen 0.4 snapshot) or keep both tracks. Usually promote.
2. `cp -r guide/ release/guide/` (EN) and `cp -r zh/guide/ zh/release/guide/` (ZH)
3. Update the release-track Changelog whitelist in `docs.json` to include the new stable version
4. Update the version-switcher label in the docs.json navbar (Release = "latest stable" not "0.4")
5. Delete pre-release changelog files from `release/changelog/` that shouldn't be in the stable-only whitelist
6. Beta track continues evolving toward the next major (0.6)

### Common Mistake: Documenting Release track from current templates

**Symptom**: You write Release-track docs (documenting 0.4.0 GA) and grab details from the current tree — e.g. `cat packages/cli/src/configurators/qoder.ts` or `ls packages/cli/src/templates/qoder/`. Result: the docs claim 0.4.0 generates paths that only exist on 0.5 betas (`.qoder/rules/`, `.qoder/hooks/`), or platforms that are 0.5-only get documented as 0.4. User tries to `trellis init --qoder` on 0.4.0 and sees a completely different layout.

**Cause**: The current tree is always beta-current. Release track docs must reflect the tagged stable version, which is what users on `@stable` actually get.

**Fix**: Always query the tagged version when writing Release docs. Every inline reference to a file path, config shape, or platform capability in the Release track should trace to `git show v<stable-version>:...` or `git ls-tree v<stable-version> ...`, never to the working tree.

**Prevention**: When you open a file to document a Release-track behavior, the first keystroke should be `git show v<version>:` not `cat`. If that feels like friction, keep a terminal tab pinned to `git log --oneline v<stable-version>^..v<stable-version>` so the tag is always in scope.

### Common Mistake: Counting platforms from existing docs

**Symptom**: Docs say Trellis supports N platforms, but the real count is different. Worst case: you inherit a wrong count from prior docs, propagate it, then spend a session re-fixing every mention. (Seen in 0.4.0 Release audit: prior docs claimed 6 platforms, next pass got to 12, actual was 14 — CodeBuddy and Antigravity were quietly shipped and never documented.)

**Cause**: Docs drift silently. When a platform is added to the CLI, documentation updates are manual and easy to forget. Counting from docs compounds every prior miss.

**Fix**: The canonical count is `git ls-tree v<version> packages/cli/src/configurators/ | grep '\.ts$' | grep -vE 'index|shared|workflow' | wc -l`.

**Prevention**: When a platform count appears in docs (tables, taglines, architecture diagrams, FAQs), cross-check it against the configurator directory for the target version before trusting prior docs. Treat every platform-count claim as unverified until you've run the count yourself.

---

## Quality Checklist

Before publishing:

- [ ] Title is clear and descriptive
- [ ] Description is under 160 characters
- [ ] Headings follow hierarchy (H2 > H3)
- [ ] Code examples are tested and correct
- [ ] Links are valid and point to correct pages
- [ ] Images have alt text
- [ ] Content is scannable (lists, tables, short paragraphs)
- [ ] For code-level reference pages: every field / subcommand / flag traces to a named source file you opened while writing
- [ ] JSONL examples inject specs or research, not raw code
- [ ] No "removed in vX.Y" tombstone sections for features already absent
- [ ] If you touched a dual-track page (`guide/*`, `appendix-*`, `index.mdx`), you updated both Beta and Release copies (EN and ZH each = 4 files to touch)
- [ ] If you touched a single-source page (`use-cases/`, `showcase/`, `blog/`, `skills-market/`, `templates/`, `contribute/`), you did NOT create a duplicate under `release/`
- [ ] Platform counts / lists trace to `git ls-tree v<target-version> packages/cli/src/configurators/`, not to prior docs or memory
- [ ] All four `docs.json` navigation blocks (EN Beta / EN Release / ZH Beta / ZH Release) are consistent
