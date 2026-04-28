<p align="center">
<picture>
<source srcset="assets/trellis.png" media="(prefers-color-scheme: dark)">
<source srcset="assets/trellis.png" media="(prefers-color-scheme: light)">
<img src="assets/trellis.png" alt="Trellis Logo" width="500" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
</picture>
</p>

<p align="center">
<strong>Make AI coding reliable at team scale.</strong><br/>
<sub>A team AI coding harness for progressive specs, custom workflows, task context, and memory across Claude Code, Cursor, Codex, OpenCode, Kiro, Gemini CLI, and more.</sub>
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
<a href="https://www.npmjs.com/package/@mindfoldhq/trellis"><img src="https://img.shields.io/npm/dw/@mindfoldhq/trellis?style=flat-square&color=cb3837&label=downloads" alt="npm downloads" /></a>
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-16a34a.svg?style=flat-square" alt="license" /></a>
<a href="https://github.com/mindfold-ai/Trellis/stargazers"><img src="https://img.shields.io/github/stars/mindfold-ai/Trellis?style=flat-square&color=eab308" alt="stars" /></a>
<a href="https://docs.trytrellis.app/"><img src="https://img.shields.io/badge/docs-trytrellis.app-0f766e?style=flat-square" alt="docs" /></a>
<a href="https://discord.com/invite/tWcCZ3aRHc"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
<a href="https://github.com/mindfold-ai/Trellis/issues"><img src="https://img.shields.io/github/issues/mindfold-ai/Trellis?style=flat-square&color=e67e22" alt="open issues" /></a>
<a href="https://github.com/mindfold-ai/Trellis/pulls"><img src="https://img.shields.io/github/issues-pr/mindfold-ai/Trellis?style=flat-square&color=9b59b6" alt="open PRs" /></a>
<a href="https://deepwiki.com/mindfold-ai/Trellis"><img src="https://img.shields.io/badge/Ask-DeepWiki-blue?style=flat-square" alt="Ask DeepWiki" /></a>
<a href="https://chatgpt.com/?q=Explain+the+project+mindfold-ai/Trellis+on+GitHub"><img src="https://img.shields.io/badge/Ask-ChatGPT-74aa9c?style=flat-square&logo=openai&logoColor=white" alt="Ask ChatGPT" /></a>
</p>

<p align="center">
<img src="assets/trellis-demo.gif" alt="Trellis workflow demo" width="100%">
</p>

## What is Trellis?

Trellis is an AI coding harness for teams. It turns the huge system prompt you would normally put in `CLAUDE.md`, `AGENTS.md`, or `.cursorrules` into a progressive wiki of specs that agents load only when needed. That saves context window, reduces repeated prompting, and keeps AI output aligned with your project's conventions.

Because the same harness runs across your team, Trellis also optimizes the parts around coding: custom workflows, task management, cross-platform setup, multi-agent worktrees, and explicit session memory.

Most AI coding frameworks stop at personal productivity. Trellis is already used by individual builders, open-source maintainers, teams inside tech giants, labs at top universities, and software engineering departments at public companies. It is built for production projects with hundreds of thousands of lines of code, monorepos, multi-person teams, and mixed AI toolchains.

Trellis does not replace Claude Code, Cursor, Codex, OpenCode, Kiro, Gemini CLI, or other coding agents. It gives them the same project source of truth.

## How it works

Trellis installs a `.trellis/` directory into your repository and generates the right entry points for each AI coding platform you use.

| Layer                  | Purpose                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `.trellis/spec/`       | Team standards and coding guidelines that agents can load automatically.               |
| `.trellis/tasks/`      | PRDs, task context, status, review notes, and acceptance criteria.                     |
| `.trellis/workspace/`  | Per-developer journals for session continuity.                                         |
| `.trellis/workflow.md` | The shared lifecycle for planning, building, checking, finishing, and learning.        |
| Platform adapters      | Generated commands, hooks, skills, prompts, workflows, and agent files for your tools. |

The core loop is short:

1. Capture the task as a PRD.
2. Inject the relevant project specs.
3. Let the agent implement inside a clear boundary.
4. Run checks before handoff.
5. Promote reusable lessons back into specs.
6. Record the session so the next one starts with context.

For the deeper product model, see the [docs](https://docs.trytrellis.app/) and [real-world scenarios](https://docs.trytrellis.app/guide/ch08-real-world).

## Install

Prerequisites:

- **Node.js** >= 18
- **Python** >= 3.10 for hooks and automation scripts

Install Trellis:

```bash
npm install -g @mindfoldhq/trellis@latest
```

Initialize a repository:

```bash
# Start Trellis and create a developer workspace
trellis init -u your-name

# Or configure the AI tools you already use
trellis init --claude --cursor --codex --opencode -u your-name
```

Add more platforms when needed:

```bash
trellis init --claude --cursor --opencode --iflow --codex --kilo --kiro --gemini
trellis init --antigravity --windsurf --qoder --codebuddy --copilot --droid
```

See the [Quick Start](https://docs.trytrellis.app/guide/ch02-quick-start) and [Supported Platforms](https://docs.trytrellis.app/guide/ch13-multi-platform) guides for setup details.

## First task

Command names are exposed as slash commands, skills, workflows, prompts, or hooks depending on the platform. The workflow is the same:

```text
/start        # Load project context
/brainstorm   # Turn a rough request into a PRD
/before-dev   # Load relevant specs before coding
/check        # Review changes against project specs
/finish-work  # Run the pre-commit quality gate
/update-spec  # Capture reusable lessons into specs
/record-session
```

For large work, `/parallel` splits independent tasks into isolated git worktrees.

## Supported platforms

Trellis supports Claude Code, Cursor, OpenCode, iFlow, Codex, Kilo, Kiro, Gemini CLI, Antigravity, Windsurf, Qoder, CodeBuddy, GitHub Copilot, and Factory Droid.

## Learn more

| Need                            | Link                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Install Trellis in a repo       | [Quick Start](https://docs.trytrellis.app/guide/ch02-quick-start)            |
| Understand platform differences | [Supported Platforms](https://docs.trytrellis.app/guide/ch13-multi-platform) |
| See the workflow in practice    | [Real-World Scenarios](https://docs.trytrellis.app/guide/ch08-real-world)    |
| Start from spec templates       | [Spec Templates](https://docs.trytrellis.app/templates/specs-index)          |
| Track releases                  | [Changelog](https://docs.trytrellis.app/changelog/v0.4.0)                    |

## FAQ

<details>
<summary><strong>How is Trellis different from <code>CLAUDE.md</code>, <code>AGENTS.md</code>, or <code>.cursorrules</code>?</strong></summary>

Those files are useful entry points, but they tend to become monolithic. Trellis adds scoped specs, task PRDs, workflow gates, workspace memory, and platform-aware generated files around them.

</details>

<details>
<summary><strong>Is Trellis only for Claude Code?</strong></summary>

No. Trellis is a project layer that works across multiple coding agents and IDEs.

</details>

<details>
<summary><strong>Is Trellis for solo developers or teams?</strong></summary>

Both. Solo developers use it for memory and repeatable workflow. Teams get the larger benefit: shared standards, task boundaries, reviewable context, and platform portability.

</details>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mindfold-ai/Trellis&type=Date)](https://star-history.com/#mindfold-ai/Trellis&Date)

## Community & Resources

- [Official Docs](https://docs.trytrellis.app/)
- [GitHub Issues](https://github.com/mindfold-ai/Trellis/issues)
- [Discord](https://discord.com/invite/tWcCZ3aRHc)
- [Tech Blog](https://docs.trytrellis.app/blog)

<p align="center">
<a href="https://github.com/mindfold-ai/Trellis">Official Repository</a> •
<a href="https://github.com/mindfold-ai/Trellis/blob/main/LICENSE">AGPL-3.0 License</a> •
Built by <a href="https://github.com/mindfold-ai">Mindfold</a>
</p>
