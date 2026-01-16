# Conversation Persistence

## Problem

Currently, engineer-AI conversations are ephemeral. When a session ends, the full conversation context is lost. Only summaries in traces-N.md are preserved.

## Goal

Persist complete engineer-AI conversation records for future reference, debugging, and learning.

## Requirements

### Must Have

- [ ] Store full conversation history per session
- [ ] Link conversations to features/tasks
- [ ] Searchable conversation archive
- [ ] Privacy controls (what to persist, what to redact)

### Nice to Have

- [ ] Conversation replay/review UI
- [ ] Extract insights/patterns from past conversations
- [ ] Team-shared conversation knowledge base
- [ ] Export formats (markdown, JSON)

## Technical Considerations

- Storage format (JSON, SQLite, cloud storage?)
- Storage size management (conversations can be large)
- Privacy and security (may contain sensitive code/data)
- Integration with existing traces system
- How to handle conversation continuity across sessions?

## Status

Planning
