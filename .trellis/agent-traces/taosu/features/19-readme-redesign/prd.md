# PRD: Trellis README Redesign

## Background

Based on research of successful AI coding tools (Aider, Continue, Cursor, Cline), we need to redesign Trellis README to better communicate value and drive adoption.

**Key Insight**: All successful AI coding tools eventually built dedicated websites, but a well-structured README remains the first touchpoint for GitHub visitors.

## Research Summary

### Projects Analyzed

| Project | Stars | Key README Elements |
|---------|-------|---------------------|
| Aider | 39K | Social proof metrics, GIF demo, clear slogan |
| Cline | 57K | Feature screenshots, enterprise section, transparent pricing |
| Continue | 31K | Multi-product showcase, quick start |
| Cursor | 32K | Minimal, drives to website |
| OpenCode | 10K | Detailed tables, keyboard shortcuts |

### Must-Have Elements (Industry Standard)

1. **Slogan** - 4-8 words, clear positioning
2. **GIF Demo** - First-screen visual of core workflow
3. **One-Click Install** - Copy-paste command
4. **Features List** - Icon + short description
5. **Quick Start** - 3-5 steps to first value
6. **Community Links** - Discord + GitHub Issues

## Goals

1. New visitors understand Trellis value within 30 seconds
2. Installation to first `/start` command < 5 minutes
3. Clear differentiation from raw AI coding (workflow layer)

## Proposed README Structure

```markdown
# Trellis

> [Slogan - to be finalized]

![Demo](./assets/demo.gif)

[![npm](badge)] [![license](badge)] [![stars](badge)]

## What is Trellis?

One paragraph explaining the problem and solution.

## Features

- Feature 1 with icon
- Feature 2 with icon
- Feature 3 with icon
- Feature 4 with icon
- Feature 5 with icon

## Quick Start

1. Install
2. Initialize
3. Start session

## Supported Tools

| Tool | Status |
|------|--------|
| Claude Code | Supported |
| OpenCode | Supported |

## Commands

| Command | Description |
|---------|-------------|
| /start | Start development session |
| /finish-work | Pre-commit checklist |
| ... | ... |

## Documentation

- [Workflow Guide](link)
- [Command Reference](link)
- [Configuration](link)

## Community

- [GitHub Issues](link)
- [Discord](link) (if available)

## License

MIT
```

## Slogan Candidates

Based on Trellis's positioning as a "workflow layer for AI coding":

1. **"The missing workflow layer for AI coding"** - Problem-focused
2. **"Structure your AI coding sessions"** - Action-focused
3. **"AI development workflow framework"** - Category-focused
4. **"Make AI coding predictable and repeatable"** - Benefit-focused
5. **"Workflow templates for AI-assisted development"** - Feature-focused

**Recommendation**: Option 1 or 4 - they communicate the "why" clearly.

## Feature Descriptions

| Feature | Icon | Description |
|---------|------|-------------|
| Workflow Templates | Clipboard | Pre-defined commands for development workflow |
| Agent Delegation | Robot | Delegate complex tasks to specialized agents |
| Feature Tracking | Folder | Track feature development progress |
| Session Context | FileText | Maintain context across sessions |
| Multi-Tool Support | Wrench | Works with Claude Code, OpenCode |
| Progress Recording | BarChart | Record and review development history |

## Visual Assets Needed

### GIF Demo (Priority: P0)

**Content**: Show the core workflow
1. Run `/start` command
2. Session initializes with context
3. Create a feature
4. Delegate to implement agent
5. Run `/finish-work`

**Duration**: 15-30 seconds, looping

**Tool**: asciinema or similar terminal recorder

### Badges (Priority: P1)

```markdown
![npm version](https://img.shields.io/npm/v/@mindfoldhq/trellis)
![License](https://img.shields.io/badge/License-MIT-blue)
![GitHub stars](https://img.shields.io/github/stars/mindfoldhq/trellis)
```

## Implementation Tasks

### Phase 1: Content (P0)
- [ ] Finalize slogan
- [ ] Write "What is Trellis?" section
- [ ] Create features list with icons
- [ ] Write Quick Start guide (3 steps)
- [ ] Create commands table
- [ ] Add community/support links

### Phase 2: Visual Assets (P1)
- [ ] Record demo GIF
- [ ] Add badges
- [ ] Create assets/ directory if needed

### Phase 3: Polish (P2)
- [ ] Review against competitors
- [ ] Get feedback from early users
- [ ] Iterate based on feedback

## Success Metrics

- [ ] Time to understand value < 30 seconds (user testing)
- [ ] Installation success rate (track via npm/GitHub)
- [ ] GitHub stars growth after redesign

## References

- [kleinhe's research](../../kleinhe/features/15-marketing-readme/research-readme-patterns.md)
- [kleinhe's PRD](../../kleinhe/features/15-marketing-readme/prd.md)
- Research agents output (2026-01-19)

## Notes

- README is the first touchpoint; website comes later
- Keep it scannable - developers skim first
- Show, don't tell - GIF > text description
- Social proof matters when we have it (stars, installs, users)
