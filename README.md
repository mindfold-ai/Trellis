<p align="center">
<picture>
<source srcset="assets/trellis.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/trellis.png" media="(prefers-color-scheme: light)">
<img src="assets/trellis.png" alt="Trellis Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>A multi-platform AI coding framework that rules</strong><br/>
<sub>Supports Claude Code, Cursor, OpenCode, iFlow, Codex, Kilo, Kiro, Gemini CLI, Antigravity, Trae, and Qoder.</sub>
</p>

<p align="center">
<a href="./README_CN.md">简体中文</a> •
<a href="https://docs.trytrellis.app/">Docs</a> •
<a href="https://docs.trytrellis.app/guide/ch02-quick-start">Quick Start</a> •
<a href="https://docs.trytrellis.app/guide/ch13-multi-platform">Supported Platforms</a> •
<a href="https://docs.trytrellis.app/guide/ch08-real-world">Use Cases</a>
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@mindfoldhq/trellis"><img src="https://img.shields.io/npm/v/@mindfoldhq/trellis.svg?style=flat-square&color=2563eb" alt="npm version" /></a>
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/mindfold-ai/Trellis/stargazers"><img src="https://img.shields.io/github/stars/mindfold-ai/Trellis?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://docs.trytrellis.app/"><img src="https://img.shields.io/badge/docs-trytrellis.app-0f766e?style=flat-square" alt="docs" /></a>
<a href="https://discord.com/invite/tWcCZ3aRHc"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
</p>

## Why Trellis?

| Capability | What it changes |
| --- | --- |
| **Auto-injected specs** | Write conventions once in `.trellis/spec/`, then let Trellis inject the relevant context into each session instead of repeating yourself. |
| **Task-centered workflow** | Keep PRDs, implementation context, review context, and task status in `.trellis/tasks/` so AI work stays structured. |
| **Parallel agent execution** | Run multiple AI tasks side by side with git worktrees instead of turning one branch into a traffic jam. |
| **Project memory** | Journals in `.trellis/workspace/` preserve what happened last time, so each new session starts with real context. |
| **Team-shared standards** | Specs live in the repo, so one person’s hard-won workflow or rule can benefit the whole team. |
| **Multi-platform setup** | Bring the same Trellis structure to 11 AI coding platforms instead of rebuilding your workflow per tool. |

## Quick Start

```bash
# 1. Install Trellis
npm install -g @mindfoldhq/trellis@latest

# 2. Initialize in your repo
trellis init -u your-name

# 3. Or initialize with the platforms you actually use
trellis init --cursor --opencode --codex -u your-name
```

- `-u your-name` creates `.trellis/workspace/your-name/` for personal journals and session continuity.
- Platform flags can be mixed and matched. Current options include `--cursor`, `--opencode`, `--iflow`, `--codex`, `--kilo`, `--kiro`, `--gemini`, `--antigravity`, `--trae`, and `--qoder`.
- For platform-specific setup, entry commands, and upgrade paths, use the docs:
  [Quick Start](https://docs.trytrellis.app/guide/ch02-quick-start) •
  [Supported Platforms](https://docs.trytrellis.app/guide/ch13-multi-platform) •
  [Real-World Scenarios](https://docs.trytrellis.app/guide/ch08-real-world)

## Use Cases

### Teach AI your project once

Put coding standards, file structure rules, review habits, and workflow preferences into Markdown specs. Trellis loads the relevant pieces automatically so you do not have to re-explain the repo every time.

### Run multiple AI tasks in parallel

Use git worktrees and Trellis task structure to split work cleanly across agents. Different tasks can move forward at the same time without stepping on each other’s branches or local state.

### Turn project history into usable memory

Task PRDs, checklists, and workspace journals make previous decisions available to the next session. Instead of starting from blank context, the next agent can pick up where the last one left off.

### Keep one workflow across tools

If your team uses more than one AI coding tool, Trellis gives you one shared structure for specs, tasks, and process. The platform-specific wiring changes, but the workflow stays recognizable.

## How It Works

Trellis keeps the core workflow in `.trellis/` and generates the platform-specific entry points you need around it.

```text
.trellis/
├── spec/                    # Project standards, patterns, and guides
├── tasks/                   # Task PRDs, context files, and status
├── workspace/               # Journals and developer-specific continuity
├── workflow.md              # Shared workflow rules
└── scripts/                 # Utilities that power the workflow
```

Depending on the platforms you enable, Trellis also creates tool-specific integration files such as `.claude/`, `.cursor/`, `AGENTS.md`, `.agents/`, `.kilocode/`, and `.kiro/`.

At a high level, the workflow is simple:

1. Define standards in specs.
2. Start or refine work from a task PRD.
3. Let Trellis inject the right context for the current task.
4. Use checks, journals, and worktrees to keep quality and continuity intact.

## What's New

- **v0.3.1**: adds background watch mode for `trellis update`, improves behavior in repos with existing `.gitignore`, and refreshes the docs set.
- **v0.3.0**: expands support from 2 platforms to 9, adds Windows compatibility, remote spec template fetching, and `/trellis:brainstorm`.
- **Docs refresh**: the official docs now cover quick start, architecture, commands, customization, real-world scenarios, and ongoing changelog entries.

## FAQ

<details>
<summary><strong>How is this different from <code>CLAUDE.md</code>, <code>AGENTS.md</code>, or <code>.cursorrules</code>?</strong></summary>

Those files are useful, but they tend to become monolithic. Trellis adds structure around them: layered specs, task context, workspace memory, and platform-aware workflow wiring.

</details>

<details>
<summary><strong>Is Trellis only for Claude Code?</strong></summary>

No. Trellis currently supports Claude Code, Cursor, OpenCode, iFlow, Codex, Kilo, Kiro, Gemini CLI, and Antigravity. The detailed setup and entry command for each tool lives in the supported platforms guide.

</details>

<details>
<summary><strong>Do I have to write every spec file manually?</strong></summary>

No. Many teams start by letting AI draft specs from existing code and then tighten the important parts by hand. Trellis works best when you keep the high-signal rules explicit and versioned.

</details>

<details>
<summary><strong>Can teams use this without constant conflicts?</strong></summary>

Yes. Personal workspace journals stay separate per developer, while shared specs and tasks stay in the repo where they can be reviewed and improved like any other project artifact.

</details>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mindfold-ai/Trellis&type=Date)](https://star-history.com/#mindfold-ai/Trellis&Date)

## Community & Resources

- [Official Docs](https://docs.trytrellis.app/) - Product docs, setup guides, and architecture
- [Quick Start](https://docs.trytrellis.app/guide/ch02-quick-start) - Get Trellis running in a repo fast
- [Supported Platforms](https://docs.trytrellis.app/guide/ch13-multi-platform) - Platform-specific setup and command details
- [Real-World Scenarios](https://docs.trytrellis.app/guide/ch08-real-world) - See how the workflow plays out in practice
- [Changelog](https://docs.trytrellis.app/changelog/v0.3.1) - Track current releases and updates
- [Tech Blog](https://docs.trytrellis.app/blog) - Product thinking and technical writeups
- [GitHub Issues](https://github.com/mindfold-ai/Trellis/issues) - Report bugs or request features
- [Discord](https://discord.com/invite/tWcCZ3aRHc) - Join the community

<p align="center">
<a href="https://github.com/mindfold-ai/Trellis">Official Repository</a> •
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE">AGPL-3.0 License</a> •
Built by <a href="https://github.com/mindfold-ai">Mindfold</a>
</p>
