# Research: Cherry Studio Skill Discovery & Why `npm i -g @mindfoldhq/trellis` Is Invisible

- **Query**: How does Cherry Studio (https://github.com/CherryHQ/cherry-studio) discover, install, and manage "Agent skills"? Why can't a user who installed `@mindfoldhq/trellis@beta` via global npm see/manage Trellis inside `Agent → 属性 → 技能`?
- **Scope**: external (Cherry Studio is open source; investigation done via GitHub repo, PRs, issues, release notes)
- **Date**: 2026-04-30
- **Cherry Studio version analyzed**: v1.9.1 → v1.9.3 (latest at time of research)
- **License**: AGPL-3.0

---

## Summary (TL;DR)

1. **A "skill" in Cherry Studio is NOT a CLI / npm package.** It is a directory containing a `SKILL.md` (with YAML frontmatter `name`, `description`, optional `tools`), shaped after Anthropic's Claude Code skill format. Cherry Studio scans for `SKILL.md` / `skill.md` on disk — it has no concept of "an installed npm CLI is a skill."
2. **Storage is internal to the app, not the global npm prefix.** Skills live under Electron `userData`, namely `{userData}/Data/Agents/{shortId}/.../skills/` (per-agent default workspace) and a global skills storage root managed by `SkillService` (`{dataPath}/Skills/{folderName}/`). Discovery walks these paths via `findAllSkillDirectories()` (`src/main/utils/markdownParser.ts`) — depth-limited to 10, looks only for `SKILL.md`/`skill.md`. **Nothing scans `npm root -g`, `~/.claude/skills/`, `~/.codex/skills/`, or any well-known external location.**
3. **The error message you saw (`skills MCP 服务器工具 已完成 / 在技能市场中未找到名为 "Trellis" 的技能`) comes from a `skills` MCP tool that the agent uses to query the in-app marketplace** (the unified Skills marketplace introduced in v1.9.1, which renamed "Plugins" to "Skills"). Per PRs #14184 and #13779, this `skills` tool wraps `SkillService` (`installSkill`, `installFromDirectory`, `search/list/install/remove/init/register`) and queries Cherry Studio's bundled marketplace, not `skills.sh`. There is no evidence Cherry Studio ships a built-in proxy to https://skills.sh — the third-party `brandonqr/skillsh-mcp` server exists but is **not** wired into Cherry Studio out of the box.
4. **There IS a manual-install escape hatch — but it expects a SKILL.md, not a CLI.** PR #12426 added drag-and-drop install from (a) a ZIP file or (b) a local directory, plus a marketplace URL path. PR #14184 added MCP-driven `init` + `register` so an agent itself can author a skill into the global Skills directory. All paths funnel through `SkillService.installFromDirectory` → `SkillInstaller.install`, which requires a parseable `SKILL.md` at the source. A bare CLI on `$PATH` with no `SKILL.md` cannot register.
5. **Roadmap is clear: Cherry Studio team has committed to a fuller marketplace** (issue #13758: "我们下个大版本会支持" / "we will support this in the next major version"), and issue #14408 plans a unified v2 "资源库 (Library)" page combining Assistants + Agents + Skills. Today the `skills` tool's marketplace lookup only finds skills that are present in Cherry Studio's own catalog — hence "在技能市场中未找到名为 'Trellis' 的技能".

**Bottom line for Trellis:** Being on global npm gives Cherry Studio zero discovery signal. To appear in `Agent → 属性 → 技能`, Trellis must (a) ship a `SKILL.md` directory the user can drag-and-drop or unzip into Cherry Studio's skills folder, (b) get listed in Cherry Studio's marketplace, or (c) have the user invoke the `skills` MCP `init`+`register` actions pointing at a Trellis-authored skill folder. Listing on https://skills.sh alone will not solve issue #205 because Cherry Studio doesn't talk to skills.sh.

---

## 1. Cherry Studio's "Agent Skill" Architecture

### What is a skill?

A skill is a **directory** with these characteristics (sourced from `.agents/skills/README.md` in the repo and `src/renderer/src/types/plugin.ts`):

- Mandatory file: `SKILL.md` (case-insensitive — `skill.md` also accepted)
- YAML frontmatter requires `name` and `description`; `tools` array is optional
- Body is a concise workflow / prompt the LLM consumes
- Folder name is sanitized; `MAX_FOLDER_NAME_LENGTH = 80`
- Identical model/format to Anthropic Claude Code's Skill spec (`.claude/skills/<name>/SKILL.md`) — the repo's own `.claude/skills/` is just a symlink to `.agents/skills/`

This is the **same** SKILL.md schema Claude Code, OpenCode, Codex, etc. use. There is no Cherry-Studio-proprietary manifest.

### Storage on disk (Electron app)

From PRs #14337, #14184, #14247, #13126, and the `agents_skills` SQLite schema:

- **Global skill library**: `{dataPath}/Skills/{folderName}/` — managed by `SkillService` (`src/main/services/agents/skills/SkillService.ts`)
- **Per-agent default workspace**: `{userData}/Data/Agents/{shortId}/` (path case was `agents` → `Agents` per #13126 review; lowercase may exist for legacy installs)
- **Custom workspace**: any path the user picks via `accessible_paths[0]`
- **Workspace symlinks**: when a skill is globally enabled, a symlink is created at `{agentWorkspace}/.claude/skills/{folderName}/` pointing at the global library entry, so Claude Code (the underlying agent runtime) can see it (commit `0477bd0` and refactor `6d3ec62`)
- **Database**: SQLite with `skills` and `agent_skills` tables (Drizzle ORM); columns include `id`, `folder_name` (unique), `is_enabled`, `installed_at`, `updated_at`, `content_hash` (SHA-256), `version`, `author`, `tools`. The repo recently flipped between per-agent enablement and a global flag (`6d3ec62`) — currently global-toggle, but symlinks are created across every agent workspace.

### Registration

Skills are registered via two entry points, both of which write to the SQLite `skills` table and emit a symlink:

1. `SkillService.installFromDirectory(directoryPath)` — copies (or in-place adopts) a folder containing SKILL.md into `{dataPath}/Skills/`
2. `SkillService.installFromZip(zipFilePath)` — extracts a `.zip`, then runs the directory pipeline. Includes path-traversal and ZIP-bomb protection.

**Cherry Studio does not auto-scan arbitrary system directories.** Scanning is bounded to (a) the global Skills library, (b) the agent's accessible workspace paths. Walker is `findAllSkillDirectories()` in `src/main/utils/markdownParser.ts`, max depth 10, dedupes by skill name.

---

## 2. The `skills` MCP Server

### Is it bundled?

**Yes — it is a built-in in-memory MCP server**, registered alongside `memory`, `sequentialThinking`, `braveSearch`, `fetch`, `filesystem`, `difyKnowledge`, `python`, `didiMCP`, `browser`, `hub` in `src/main/mcpServers/factory.ts`. Built-in MCPs are flagged `installSource: 'builtin'`, `provider: 'CherryAI'` (see `src/renderer/src/store/mcp.ts`).

### What does it do?

From PR #14184 ("fix(skills): support agent-authored skills via skills tool init/register") and PR commit logs, the `skills` MCP tool exposes these actions to the agent at runtime:

| Action | Behavior |
|---|---|
| `search` | Search Cherry Studio's bundled marketplace catalog |
| `list` | List installed skills + their on-disk paths (so the agent can Read/Edit them) |
| `install` | Marketplace install by skill name → resolves to a marketplace entry → downloads → `installFromDirectory`; auto-toggles enabled |
| `remove` | Uninstall + delete symlink |
| `init name=...` | Create/resolve absolute target dir under global Skills root, return path to agent so the agent can write SKILL.md into it |
| `register name=...` | Run `installFromDirectory` against the in-place dir, toggle on |
| `toggle` | Enable/disable a skill |

### Does it talk to `skills.sh`?

**No evidence.** The marketplace endpoint is Cherry Studio's own (and Claude-plugins-style — `MARKETPLACE_API` URL referenced in PR #12426 review pointed at `https://api.claude-plugins.dev`, configurable). The `MarketplaceManifestSchema` in `src/renderer/src/types/plugin.ts` follows Anthropic's `.claude-plugin/marketplace.json` spec (`https://code.claude.com/docs/en/plugin-marketplaces#marketplace-schema`) — `owner`, `plugins[]` with `source: { github | npm | git }`.

The user-visible error `skills:skills MCP 服务器工具 已完成 / 在技能市场中未找到名为 "Trellis" 的技能` is the agent's `skills.search`/`skills.install` returning empty against Cherry Studio's own catalog — **not** a failed lookup against skills.sh. The Chinese phrase "技能市场" maps to Cherry Studio's internal marketplace, not to skills.sh's domain.

A separate, independent project `brandonqr/skillsh-mcp` (https://github.com/brandonqr/skillsh-mcp) does proxy https://skills.sh's API (`search_skills`, `get_popular_skills`, `get_skill_details`, `get_install_command`) — but it is a stdio MCP for Claude Code/Cursor and is **not** installed in Cherry Studio out of the box.

### Local registration via the MCP tool

Yes. `skills.init` + `skills.register` (PR #14184) lets the agent — invoked from chat — author a skill on the user's machine and persist it. This is the only "manual register without dragging files" path. The agent must produce a valid SKILL.md.

---

## 3. Local Discovery of npm-installed CLIs

**Cherry Studio does not scan global npm.** Concrete evidence:

- No code in the repo references `npm root -g`, `npm list -g`, `process.env.npm_config_prefix`, or `~/.npm`. (Search returned only the hub MCP's `npx -y` command for installing MCP servers, which is unrelated.)
- `findAllSkillDirectories()` only walks paths it is explicitly handed: the global Skills library and an agent's `accessible_paths`.
- It also does **not** scan `~/.claude/skills/`, `~/.codex/skills/`, `~/.cursor/extensions/`, or any cross-tool well-known directory. Cherry Studio reads `.claude/skills/` only inside the agent's own workspace (and only because IT created a symlink there).
- Issue #14660 ("Skills installed via Skillhub CLI to `Project\skills\` cannot be internally indexed") confirms this: a CLI-installed skill outside Cherry Studio's workspace is invisible. The agent literally responds with "previously installed via Skillhub CLI to the project\skills\ directory are local files, not in the Agent SDK's skill management list, and need to be called directly via file path."
- Issue #14192 confirms even Cherry Studio's own agent-created skills get lost when written to the wrong path (no working dir selected) — discovery is path-strict.

**Implication:** `npm install -g @mindfoldhq/trellis@beta` writes to a location Cherry Studio never looks at. The user's CLI binary on `$PATH` is invisible to the Skills panel by design.

---

## 4. Manual Registration Paths (What Actually Works)

Five user-visible install paths, all requiring SKILL.md somewhere:

1. **Drag-and-drop a ZIP** of a skill bundle into the Skills settings UI (PR #12426, `PluginZipUploader.tsx`). The ZIP must contain a SKILL.md (or `.claude-plugin/plugin.json` for the plugin variant; PR #13779 adds skill-fallback so SKILL.md-only ZIPs work).
2. **Drag-and-drop a local directory** (folder drop) — same backend pipeline.
3. **Marketplace install** via the in-app UI — only finds skills published to Cherry Studio's marketplace catalog. PR #13779 made this fall back to SKILL.md scanning when the marketplace entry is a plain skill repo rather than a `.claude-plugin` package.
4. **Agent-driven install** via chat: ask the agent "install the X skill"; the `skills` MCP tool calls `installSkill` with auto-enable.
5. **Agent-authored**: ask the agent "create a skill that does X"; the `skills` MCP tool's `init` returns a path under the global Skills root, the agent writes SKILL.md there, then calls `register`.

**There is NO path to "register an arbitrary npm-installed CLI as a skill."** The schema literally does not model that — `InstallPluginOptions` and `InstallSkillFromZipOptions` only accept `sourcePath` / `directoryPath` / `zipFilePath` (`src/renderer/src/types/plugin.ts`).

A user could manually create a `~/Library/Application Support/CherryStudio/Data/Skills/trellis/SKILL.md` that says "to use Trellis, run `trellis ...` from the terminal" — but that just teaches the model to shell out; Cherry Studio is not actually running Trellis, it's just including the SKILL.md content in the agent prompt.

---

## 5. Roadmap & Commitments

Strong public signal that the team plans to expand this:

- **Issue #13758** — maintainer reply (Chinese, machine-translated): "we will support this in the next major version" (next major after 1.9 cycle). Specifically calls out skill discovery, search, categorization, version management, and one-click install/update. Closed/answered, not yet shipped.
- **Issue #14408** — open RFC for a v2 "资源库 (Library)" page that unifies Assistants, Agents, and Skills behind one browse/manage UI built on the new v2 DataApi + SQLite + Drizzle. Phase-1 explicitly **excludes** "Skill marketplace browsing inside the library" and "Import/Export (JSON/YAML)" — these are deferred. Skills will still be installable via marketplace / zip / directory.
- **PR #14258** — already shipped: an "Add More Skills" button on the agent settings Skills tab that deep-links to `Settings → Skills`, improving discovery flow.
- **Release v1.9.1 breaking change** — "Plugins" system was renamed to "Skills"; the Plugin marketplace was replaced by a unified Skills management interface. This is when the architecture you're seeing was finalized.
- **Issue #12290** — older request for manual install + showing manually-copied skills in the installed list. PR #12426 partially addresses (drag-and-drop), but the "show externally-copied skills" half is still aspirational.

Nothing in the public roadmap mentions integration with `skills.sh`, third-party skill registries, or scanning npm/system PATH for skills. The model is clearly: Cherry Studio owns the storage, Cherry Studio's marketplace owns discovery.

---

## 6. Workarounds Users Have Tried

From issue threads, comparable Chinese tools, and community traces:

- **Skillhub CLI (Tencent, https://skillhub.cn/)** — issue #14660. User installed skills via Skillhub's `npm`-style CLI prompt to `Project\skills\`. They became invisible to Cherry Studio's Agent SDK. The workaround the agent itself proposed: "call them directly via file path" — i.e. abandon the Skills panel and just point the LLM at the file path manually. **This is exactly the analogous failure mode to Trellis on `npm i -g`.**
- **Manual copy into the agent workspace** — implied workaround in issue #12290 (predates drag-drop). Users would `cp -r` skill folders into their agent's workspace; the agent could see them at runtime via Claude Code's `.claude/skills` walker, but they didn't appear in the Cherry Studio "Installed" list.
- **Symlink trick** — repo's own `.claude/skills/ → .agents/skills/` symlink is the canonical pattern; documented for Windows Developer Mode requirement.
- **OpenClaw deployment guide** (developer.aliyun.com) — a Chinese walkthrough showing `npm install -g openclaw@latest` + Cherry Studio. OpenClaw is a sibling product (also from CherryHQ — listed in the repo's GitHub topics). This deployment is for a *gateway service*, not a skill. It reinforces that "global npm install" in the Cherry Studio ecosystem means "install a backend service Cherry Studio talks to," not "install a skill."

No V2EX/Zhihu/掘金 thread directly addresses `npm i -g <foo>` → "show in Cherry Studio Skills panel" — likely because mainstream users don't expect that mapping in the first place; the Cherry Studio Skills concept is well-understood as Claude Code's SKILL.md format.

---

## Implications for Trellis

### Hard constraints (from research)

- **Listing on https://skills.sh does NOT make Trellis appear in Cherry Studio.** Cherry Studio has no built-in skills.sh client. (It has `skills` MCP, but it points at Cherry Studio's own marketplace catalog.)
- **Being a global npm CLI does NOT make Trellis appear.** Cherry Studio doesn't scan npm at all.
- **The only paths into the Skills panel are:** (a) drag-and-drop a SKILL.md folder/zip, (b) be listed in Cherry Studio's marketplace, (c) have the agent author a SKILL.md in-place via the `skills` MCP `init`/`register` flow.

### Realistic options to fix issue #205

| Option | Effort | What user does | Notes |
|---|---|---|---|
| **A. Ship a `SKILL.md` bundle for Trellis** alongside the npm package, document drag-and-drop install into Cherry Studio Skills | Low | Drags `trellis-skill/` folder onto Settings → Skills | Most direct. The SKILL.md just teaches the LLM how to invoke the `trellis` CLI that npm installed. CLI does the work; SKILL.md is the discovery surface. |
| **B. Submit Trellis to Cherry Studio's marketplace catalog** (Claude-plugin marketplace.json schema, source can be `npm`) | Medium | Click install in marketplace UI | Requires identifying Cherry Studio's marketplace registry endpoint and submission process — research did not surface a public submission flow; likely PR to a CherryHQ-controlled repo or coordinate with maintainers. |
| **C. Document the agent-driven install** ("ask Cherry Studio's agent: 'create a Trellis skill that runs trellis init when called'") | Low | Pastes a one-line prompt | Fragile (model behavior dependent), but works today via `skills.init`+`register`. |
| **D. Build & publish a Trellis-specific MCP server** that Cherry Studio users add via Settings → MCP | Medium | Adds MCP via URL/config | Sidesteps the Skills panel entirely; Trellis becomes an MCP tool, not a skill. Different UX surface. |
| **E. Wait for v2 "资源库" + a richer marketplace** (issue #14408 + #13758 commitment) | N/A | — | Not within our control; "next major version" timing unknown. |

### Recommended framing for the user-facing answer

The user expectation in issue #205 ("I `npm i -g` something, why isn't it in Cherry Studio's skills?") is a **category mismatch**. A Cherry Studio skill is a SKILL.md bundle, not a CLI. The fix is to ship Trellis as a SKILL.md bundle in addition to the CLI, and document the drag-and-drop install — Option A above is the lowest-friction win. Option B (marketplace listing) is the durable answer once a submission path is identified.

---

## Caveats / Not Found

- **Cherry Studio marketplace submission process**: not documented publicly; the `MARKETPLACE_API` URL was flagged in code review (PR #12426) as "should be configurable or at least documented" — the team may not yet accept third-party submissions.
- **Exact `skills.sh` integration status**: searched explicitly; no Cherry Studio code references `skills.sh`. If there is a hidden bridge it's not in `main` as of v1.9.3.
- **Whether Trellis would even be accepted as a marketplace skill**: skills there are SKILL.md prompt bundles, not workflow CLIs. A "Trellis skill" would essentially be a doc instructing the model to use the Trellis CLI — the team may or may not consider that on-brief.
- **WeChat/Discord chatter**: not crawled (gated channels).
