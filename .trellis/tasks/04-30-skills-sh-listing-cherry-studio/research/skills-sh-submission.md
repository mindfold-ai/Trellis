# Research: skills.sh listing for Trellis (Cherry Studio integration angle)

- **Query**: Whether and how to list `@mindfoldhq/trellis` on skills.sh; relevance to Cherry Studio
- **Scope**: external
- **Date**: 2026-04-30

## Summary (TL;DR for main agent)

- **skills.sh is not a registry you "submit" to. It is a leaderboard owned by Vercel that auto-discovers any GitHub repo containing a `SKILL.md` file the moment somebody runs `npx skills add owner/repo`.** Source: Vercel blog "Building a self-driving skills.sh leaderboard" by Andrew Qu.
- **The artifact format is strict: an Anthropic-style Skill** — a directory with a `SKILL.md` that has YAML frontmatter (`name`, `description` required) plus optional `scripts/`, `references/`, `assets/`. **NPM packages, MCP servers, and plain prompts are NOT accepted.** A CLI tool like Trellis cannot be listed as such; only Skill-shaped content packaged inside a GitHub repo can.
- **Cherry Studio (as of v1.9.x) does NOT use skills.sh as its source.** Its skill marketplace is backed by `https://api.claude-plugins.dev` (the kamalnrf/claude-plugins registry — different project). The premise in the task brief — "Cherry Studio uses skills.sh as its sole skill installation channel" — appears to be incorrect. This is the most important finding and changes the whole strategy.
- **There is no submission form, PR queue, email, or human review.** Listing happens automatically on first install via telemetry; an LLM-based safety scanner re-reviews on each content-hash change. Suspicious skills are hidden from search but still reachable by URL.
- **Recommended action for Trellis**: (a) for skills.sh, simply ensure the existing `templates/claude/skills/*` directories live in a public repo that follows the discovery layout, then run `npx skills add mindfold-ai/Trellis` once to seed the leaderboard; (b) for Cherry Studio specifically, target `claude-plugins.dev` instead — that's the actual registry Cherry Studio queries.

---

## 1. What is skills.sh?

- **Operator**: Vercel (specifically Vercel Labs). Open-source CLI lives at `github.com/vercel-labs/skills` (~15K stars). Andrew Qu, "Chief of Software" at Vercel, authored the engineering post describing the system.
- **Surface**: A web leaderboard (https://skills.sh) ranking community skills by install count across three views: All Time (`/`), Trending (`/trending`), Hot (`/hot`).
- **Business model**: No paid listings. Vercel positions it as part of the open Agent Skills ecosystem (Anthropic's standard, also used by OpenAI, Microsoft, GitHub, Cursor). It functions as a marketing/discovery surface that drives usage of the `skills` npm CLI; Vercel benefits from owning the canonical tool.
- **Open vs curated**: **Open** — anyone can publish a skill simply by creating a public GitHub repo with a `SKILL.md`. There is no curation gate; an automated LLM safety reviewer hides "suspicious" skills from rankings (but they remain accessible via direct URL with a warning banner).
- **Stated scale**: 45,000+ unique skills tracked since launch (per Vercel blog).

## 2. Artifact format

**Strictly Anthropic-style Skill folder.** From `vercel-labs/skills` README and `skills.sh/docs`:

```
skill-name/
├── SKILL.md              # required
│   ├── YAML frontmatter (name, description required)
│   └── Markdown body
└── (optional)
    ├── scripts/      # executable code agent can run
    ├── references/   # docs loaded on-demand
    └── assets/       # static files used in output
```

**Required frontmatter fields**:

| Field | Constraints |
|---|---|
| `name` | 1-64 chars, kebab-case (lowercase letters/numbers/hyphens only); MUST match folder name |
| `description` | 1-1024 chars; MUST describe both WHAT it does AND WHEN to use it |

**Optional**: `license`, `compatibility`, `metadata`, `allowed-tools`.

**NOT accepted as the listing artifact**:
- npm packages — irrelevant; the CLI clones the GitHub repo, not the npm tarball.
- MCP servers — different surface (skills.sh has no MCP-server type).
- Hosted manifest URL — not yet supported. Issue #531 (`skill.json` for publisher-side discovery) is open but unmerged. PR #377 attempted a YAML manifest and was not accepted.
- Plain markdown / prompt template — must be wrapped as a SKILL.md with frontmatter.

**Discovery layout inside a repo** (CLI scans these paths):
- repo root (if `SKILL.md` is there)
- `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`
- 40+ platform-namespaced paths: `.claude/skills/`, `.cursor/skills/`, `.codex/skills/`, `.iflow/skills/`, `.qoder/skills/`, `.continue/skills/`, `.windsurf/skills/`, `.goose/skills/`, etc.
- Plugin manifests: `.claude-plugin/marketplace.json` or `.claude-plugin/plugin.json` whose `skills:` array points at directories.

This means **Trellis's existing `templates/claude/skills/*` and `templates/codex/skills/*` are NOT in the discovery list** — they're under `templates/`, which the CLI ignores. To be discoverable, Trellis would need to either (a) move/copy the Skill folders to `skills/` at repo root, or (b) declare them via a `.claude-plugin/marketplace.json` whose `skills` array points to the existing template paths.

## 3. Submission flow

**There is no submission action.** Issue #880 (vercel-labs/skills, Apr 2026, "How to submit/publish a new skill?") was answered implicitly via PR #7 ("Add skills.sh universal install method and improve discoverability"): the answer is "you don't — push to GitHub, then trigger an install."

Concrete flow:

1. Push a public GitHub repo with `SKILL.md` files in a discoverable location.
2. Run `npx skills add <owner>/<repo>` (anyone, anywhere). The CLI fires anonymous telemetry (skill name, file hashes, timestamp — no personal/device info per `skills.sh/docs/cli`).
3. Telemetry hits Vercel's pipeline, which spins up a Vercel Sandbox, shallow-clones the repo, reads every text file in the skill folder (SKILL.md first, then scripts, configs, other markdown), and sends them to an LLM with a security-review system prompt.
4. The LLM returns a structured verdict (`safe` | `suspicious` | `malicious`) plus reasons, file paths, and line numbers for any concerns. Safe skills appear immediately on the leaderboard; suspicious ones are hidden from rankings/search but remain at their direct URL with a warning banner.
5. On every install where the skill folder's content hash changes, the review re-runs. Stale reviews get auto-reminders after 24h.

**Required metadata**: only `name` + `description` in YAML frontmatter. Everything else (author, repo URL, install count, stars) is derived automatically by the indexer from GitHub. There are no tags, categories, or version fields the author can set; version metadata isn't part of the spec yet (issues #165, #354 requested it; not implemented).

**Install command shown on listing pages** is auto-generated:
`npx skills add https://github.com/<owner>/<repo> --skill <skill-name>`

(See examples like https://skills.sh/jeffallan/claude-skills/cli-developer and https://skills.sh/anthropics/claude-plugins-official/skill-development.)

## 4. Curation / review

- **Automated only.** No human PR review, no email queue.
- **Turnaround**: effectively real-time — a Vercel Workflow runs per telemetry event.
- **Rejection criteria**: an LLM safety reviewer flags content as `suspicious` (e.g., obvious telemetry/credential exfil, prompt injection, obfuscated scripts). "Rejection" doesn't delete the skill; it hides it from rankings/search. A separate anomaly-detection agent watches install patterns and can throttle or exclude skills that appear to be gaming installs (per Issue #488 — Vercel maintainer confirmed leaderboard moderation is "fully automated" with rare manual revisions, e.g. collapsing `inference-sh-[1...]` namespace spam).
- **Manual interventions exist but are rare**: namespace grouping, install-count corrections after gaming detection. No human approves new entries.

## 5. Discovery surface — how clients (incl. Cherry Studio) find listed skills

**This is the critical section, and the task brief premise needs correction.**

### How skills.sh itself surfaces skills
- **Web leaderboard**: human browsing at skills.sh, /trending, /hot.
- **CLI search**: `npx skills find [query]` — searches the leaderboard.
- **No public REST API documented for skills.sh.** Third parties scrape it (see `NeverSight/learn-skills.dev`, which crawls skills.sh daily and republishes a JSON feed).

### How Cherry Studio actually discovers skills (evidence-based)

Cherry Studio v1.9.x ships a built-in `skills` MCP tool with `search`/`install`/`remove`/`list` actions. The relevant code (since removed in PR #14184 in favor of agent-authored skills, but historically the marketplace path) used:

```ts
const MARKETPLACE_BASE_URL = 'https://claude-plugins.dev'
```

And the install identifier format is `'owner/repo/skill-name'` — exactly the namespace shape used by `claude-plugins.dev`, NOT skills.sh.

PR #12426 ("add plugin package installation from ZIP, directory, remote") confirmed `MARKETPLACE_API_BASE_URL` is hardcoded to `https://api.claude-plugins.dev`, and a code review explicitly flagged: *"Hardcoded external API URL — `MARKETPLACE_API_BASE_URL` is hardcoded to `https://api.claude-plugins.dev`."* Skill install telemetry is `POST`ed to the same domain (`reportSkillInstall`).

So Cherry Studio's marketplace is backed by **claude-plugins.dev** (run by `kamalnrf/claude-plugins`, ~498 stars, advertises 11,989 plugins / 63,065 skills indexed). Not skills.sh.

The two registries are independent but overlap heavily because both auto-crawl GitHub for `SKILL.md` files. A skill that satisfies one usually satisfies the other, but the listing pipelines are separate.

### claude-plugins.dev (the one that matters for Cherry Studio)

- **Registry API**: `https://api.claude-plugins.dev`
  - `GET /api/skills/search?q=...&limit=20&offset=0` — returns `{ skills: [{ id, name, namespace: "@owner/repo/skill-name", sourceUrl, description, author, installs, stars }], total }`.
  - `GET /api/skills/:owner/:repo/:skillName` — skill detail.
- **Indexer**: a CRON job (`cron/skills-indexer.ts`) searches GitHub for *all* `SKILL.md` files (no path restriction), parses YAML frontmatter with Zod (requires `name` + `description`), and upserts into SQLite with `namespace = "@owner/repo/skillName"`.
- **Submission**: same model as skills.sh — push to a public GitHub repo. No form. The crawler discovers it within hours.
- **Install command exposed by Cherry Studio**: `'owner/repo/skill-name'` resolves through the API to the source URL, then Cherry Studio's `installFromDirectory` pipeline clones and installs into its global Skills storage root (`~/Library/Application Support/.../Skills/`).

## 6. Examples — already-listed CLI / dev-tooling skills similar in shape to Trellis

Pulled from skills.sh:

| Listing | URL | Install command | Notes on shape |
|---|---|---|---|
| `cli-developer` (jeffallan/claude-skills) | https://skills.sh/jeffallan/claude-skills/cli-developer | `npx skills add https://github.com/jeffallan/claude-skills --skill cli-developer` | Plain `SKILL.md` only; describes a CLI-building workflow. No scripts/. |
| `cli-builder` (eddiebe147/claude-settings) | https://skills.sh/eddiebe147/claude-settings/cli-builder | `npx skills add https://github.com/eddiebe147/claude-settings --skill cli-builder` | Pure markdown reference content. |
| `app-builder` (davila7/claude-code-templates) | https://skills.sh/davila7/claude-code-templates/app-builder | `npx skills add https://github.com/davila7/claude-code-templates --skill app-builder` | Closest analog to Trellis's purpose: scaffolding orchestrator with 13 templates referenced from `references/`. |
| `make-skill-template` (github/awesome-copilot) | https://skills.sh/github/awesome-copilot/make-skill-template | `npx skills add https://github.com/github/awesome-copilot --skill make-skill-template` | Meta-skill for scaffolding new Skills. |
| `golang-cli-cobra-viper` (bobmatnyc/claude-mpm-skills) | https://skills.sh/bobmatnyc/claude-mpm-skills/golang-cli-cobra-viper | `npx skills add https://github.com/bobmatnyc/claude-mpm-skills --skill golang-cli-cobra-viper` | Tech-stack-specific tutorial Skill. |
| `tooling-engineer` (404kidwiz/claude-supercode-skills) | https://skills.sh/404kidwiz/claude-supercode-skills/tooling-engineer | `npx skills add https://github.com/404kidwiz/claude-supercode-skills --skill tooling-engineer` | Decision-tree-style guide. |

**Pattern observation**: every listed dev-tooling skill is *advisory content* (instructions for an agent to follow), not a wrapper around an installable CLI. None of them say "install this npm package, then run it." This is a hint about positioning: Trellis's CLI itself is not what gets listed; what gets listed is a Skill that *teaches* an agent to use Trellis (e.g., "trellis-init" skill that tells the agent to run `npx @mindfoldhq/trellis init`, what flags exist, what the spec layout means).

The `trellis-meta` skill that already exists in this repo (`templates/claude/skills/trellis-meta/SKILL.md`) is exactly the right shape.

## 7. Gotchas

- **Naming collisions**: namespace is `owner/repo/skill-name`, so collisions are scoped to a single repo. The `name` field must be globally unique inside one repo and match the folder name.
- **Description "pushiness"**: per anthropics/skills/skill-creator, descriptions should be slightly aggressive about when to trigger ("Make sure to use this skill whenever the user mentions..."), since Claude tends to under-trigger skills. Minimal, neutral descriptions get under-installed.
- **Body length**: target 1,500-2,000 words for `SKILL.md`; move detail to `references/`. The combined `description` + `when_to_use` text is truncated at 1,536 characters in skill listings.
- **Content-hash re-review**: every push that changes a skill folder triggers an LLM re-scan. If a future change introduces patterns that look like exfiltration (e.g., a `scripts/` file that POSTs project state to a URL), the skill can be silently demoted from search.
- **Install gaming detection**: don't try to seed installs from many fake namespaces — Vercel collapses spam patterns (Issue #488 documents `inference-sh-[1...]` being collapsed manually, and rule-based throttling becoming permanent).
- **No Chinese-language requirement** for skills.sh. The leaderboard accepts English skills without issue. Cherry Studio is Chinese but its marketplace UI is bilingual; skill content language is not enforced.
- **No regional restrictions** observed. (Cherry Studio Issue #12603 mentions a user in mainland China who can't reach the marketplace, but that's a network connectivity issue, not a policy.)
- **Versioning expectations**: there are none. The latest commit on the default branch is what gets indexed. There's no semver, no "stable" tag honored. Issue #531 proposes structured `skill.json` with version + integrity hashes; not yet merged.
- **CLI vs Skill confusion**: Trellis the npm CLI cannot be listed. Only the Skill folders inside (or at the root of) a public repo can. The "listing" is for the agent-facing instruction artifact, not for the binary that scaffolds it.
- **License**: not enforced, but `license` is a recognized optional frontmatter field. Anthropic's published skills mostly use Apache 2.0 / MIT.

## Open questions / dead ends

- **Has Cherry Studio recently switched (or planned to switch) to skills.sh?** Searches across CherryHQ/cherry-studio repo, releases v1.9.0–v1.9.3 changelogs, and PRs from Feb–Apr 2026 show only `claude-plugins.dev`. No PR or issue mentions `skills.sh`. The task brief's premise that Cherry Studio uses skills.sh "as its sole skill installation channel" is unsupported by what's currently in the codebase. **Worth confirming with the user** — perhaps there's an out-of-band roadmap signal or a third-party fork.
- **Does Cherry Studio surface a built-in skills.sh search?** PR #14184 (Apr 2026) replaced the marketplace `search`/`install` MCP tool with `init`/`register` (agent-authored skills). The marketplace install path (`installSkill`) still exists and still hits `claude-plugins.dev`. No skills.sh path was added.
- **Is there a private API on skills.sh?** Documented endpoints are limited to the CLI's telemetry submission and leaderboard scraping. Third-party crawlers (NeverSight, Skillsmith) bypass skills.sh and crawl GitHub directly. If we needed programmatic access, we'd build the same kind of crawler — there is no public REST API.
- **Could a skill show up on both registries from a single source?** Yes, in practice — both crawl GitHub for `SKILL.md`. Push once, get listed in both within a day.
