# Worktree Isolation

## Problem

When multiple AI sessions work on the same codebase, they can interfere with each other's changes. Git worktrees provide branch isolation, but currently each session works in the same working directory.

## Goal

Each new AI session automatically uses an isolated git worktree, preventing conflicts and enabling true parallel development.

## Requirements

### Must Have

- [ ] Auto-create git worktree when session starts
- [ ] Unique branch naming convention (e.g., `session/{developer}/{timestamp}`)
- [ ] Clean worktree setup with proper .trellis context
- [ ] Auto-cleanup of worktrees when session ends or merges

### Nice to Have

- [ ] Worktree status in session context
- [ ] Easy merge workflow back to main branch
- [ ] Worktree listing and management commands

## Technical Considerations

- Where to store worktrees? (../project-worktrees/ ?)
- How to handle .trellis state across worktrees?
- How to sync agent-traces between worktrees?
- Integration with existing feature tracking

## Status

Planning
