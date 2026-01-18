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

---

## Research Findings (2026-01-18)

### Key Discovery: Claude Code Already Stores Conversations

Claude Code stores complete conversation data locally:

```
~/.claude/projects/{project-path-with-dashes}/
├── sessions-index.json          # Session index with metadata
├── {session-id}.jsonl           # Full conversation (can be 35MB+)
└── {session-id}/                # Session attachments
```

#### sessions-index.json Structure

```json
{
  "version": 1,
  "entries": [
    {
      "sessionId": "fd8588fb-297f-498c-ba41-33744624aa4e",
      "fullPath": "/Users/.../{session-id}.jsonl",
      "firstPrompt": "用户第一条消息",
      "messageCount": 45,
      "created": "2026-01-15T14:01:22.417Z",
      "modified": "2026-01-16T02:54:26.317Z",
      "gitBranch": "feat/opencode-support",
      "projectPath": "/Users/kleincr/Dev/mindfold/Trellis",
      "isSidechain": false
    }
  ]
}
```

#### Conversation JSONL Message Types

| Type | Description |
|------|-------------|
| `user` | User message with cwd, gitBranch, version, full content |
| `assistant` | AI response with model info |
| `summary` | Session summaries (auto-generated) |
| `file-history-snapshot` | File state snapshots |

#### User Message Example

```json
{
  "parentUuid": null,
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/kleincr/Dev/mindfold/Trellis",
  "sessionId": "496f942b-40a9-42d5-8ba3-a06793fdc55f",
  "version": "2.1.12",
  "gitBranch": "feat/team-collaboration",
  "type": "user",
  "message": {
    "role": "user",
    "content": "..."
  },
  "uuid": "efafe01c-f819-498c-a414-ead13586695e",
  "timestamp": "2026-01-18T06:57:29.339Z"
}
```

### Other Tools Comparison

| Tool | Storage | Complete History |
|------|---------|------------------|
| Claude Code | Local JSONL | ✅ Full |
| Cursor | Local SQLite | ⚠️ Lost on IDE close |
| Aider | `.aider.history.json` | ✅ JSON |
| Continue | SQLite | ✅ Full |
| Trellis (current) | Markdown traces | ⚠️ Summary only |

---

## Technical Approach Options

### Option A: Hook-Based Capture
- Use Claude Code hooks to intercept tool calls
- **Pro**: Automatic
- **Con**: Only captures tool calls, not full conversation

### Option B: Manual Export
- User runs `/save-conversation` command
- **Pro**: User control, privacy-friendly
- **Con**: Easy to forget

### Option C: Session Wrapper
- User starts via `trellis session start`
- **Pro**: Full control, highest customization potential
- **Con**: Changes user habit, limited adoption
- **Decision**: Not prioritized unless A+D cannot solve specific pain points. Keep as fallback option.

### Option D: Native Storage Sync
- Read from `~/.claude/projects/` directly
- **Pro**: Complete data, already exists
- **Con**: Depends on Claude Code internal format (may change)

### Recommended: A + D Combined

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code (existing)                    │
│  ~/.claude/projects/{project}/                              │
│  ├── sessions-index.json  ← Auto-maintained                 │
│  └── {session}.jsonl      ← Full conversation, auto-stored  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (D: Sync/Read)
┌─────────────────────────────────────────────────────────────┐
│                    Trellis Enhancement Layer                 │
│  .trellis/conversations/                                    │
│  ├── index.json          ← Link to features, add tags       │
│  └── {session}/                                             │
│      ├── metadata.json   ← Add: feature, developer, tags    │
│      └── transcript.md   ← Generate human-readable summary  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (A: Hook Enhancement)
┌─────────────────────────────────────────────────────────────┐
│                    Hook Auto-Association                     │
│  - Session start: Record current feature                    │
│  - Session end: Sync to .trellis/, generate summary         │
└─────────────────────────────────────────────────────────────┘
```

**User Journey**:
```
1. User uses Claude Code normally (no change)
2. Claude Code auto-stores to ~/.claude/
3. (Hook) Session end triggers trellis sync
4. Trellis reads Claude data, links to feature, generates summary
5. User can: trellis history search "keyword"
```

**Advantages**:
- ✅ Fully automatic
- ✅ Complete conversation (Claude already stores)
- ✅ Zero intrusion to user habits
- ✅ Simple implementation (read existing data)

---

## Open Questions

### 1. Claude Code Storage Format Stability ✅ RESOLVED

**Finding**: Format is stable across versions (tested 2.0.70 → 2.1.12)

**Core fields (stable across versions)**:
- `cwd`, `gitBranch`, `sessionId`, `timestamp`, `type`, `uuid`, `version`
- `message` (actual content - follows Claude API format)
- `parentUuid`, `isSidechain`, `userType`

**Message types**:
| Type | Count | Description |
|------|-------|-------------|
| assistant | 1357 | AI response with content blocks (text, thinking, tool_use) |
| user | 911 | User input with content (text, tool_result) |
| progress | 737 | Tool/hook execution progress |
| summary | 219 | Session summaries |
| file-history-snapshot | 81 | File state snapshots |
| queue-operation | 54 | Queue operations |
| system | 46 | System metadata (turn_duration, etc.) |

**Version changes are additive** (new fields/types), not breaking. Safe to depend on.

### 2. Privacy Considerations ⚠️ LOW RISK

**Analysis of existing conversations**:
- 0 actual API keys found (sk-xxx, ghp_xxx, sk-ant-xxx patterns)
- Previous "SECRET/PASSWORD" matches were discussions, not actual values
- UUIDs and session IDs are the only long strings

**Risk assessment**:
- Theoretical risk: User could paste secrets into conversation
- Practical risk: Low in analyzed data
- Recommendation: Implement redaction as safeguard, not blocker

**Mitigation options**:
- Option A: Don't copy data, only index (read from ~/.claude/ on demand)
- Option B: Copy with redaction patterns
- Option C: User-controlled export with opt-in redaction

### 3. Storage Strategy ✅ RECOMMENDED

**Options**:
- **Option A**: Copy to `.trellis/` - Safe but duplicates large files (35MB+)
- **Option B**: Index only, read from `~/.claude/` on demand - No duplication ✅
- **Option C**: Hybrid - Index + generate summaries

**Recommendation: Option B for MVP**
- Don't copy conversation data (already in ~/.claude/)
- Create `.trellis/conversations/index.json` with:
  - Session ID → Feature mapping
  - Developer tags
  - Custom metadata (labels, notes)
- Read conversation content on demand from `~/.claude/`

**Rationale**:
- Conversations can be 35MB+ each, copying is wasteful
- Claude Code already maintains the data reliably
- We only add Trellis-specific metadata (feature links, tags)

### 4. Team Learning vs Individual Use 🔴 CRITICAL DECISION NEEDED

**Problem identified**: If we only index locally (`~/.claude/`), other team members can't learn from conversations. This defeats the purpose.

**Two usage scenarios**:

| Scenario | Need | Storage |
|----------|------|---------|
| A. Personal review | Search own history | Index-only OK |
| B. Team learning | Share knowledge, onboard new members | Must save & share |

**If supporting team learning, need to decide**:

1. **Storage location**:
   - `.trellis/conversations/` (in git, shareable)?
   - Separate knowledge base?

2. **What to save**:
   - Full conversation? (large, 35MB+)
   - Selected excerpts? (user marks valuable parts)
   - AI-generated summary? (compact, readable)

3. **Privacy control**:
   - Some conversations may contain sensitive discussions
   - Need opt-in, not automatic sharing

**Possible approaches**:

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **Full save** | Copy to .trellis/ | Complete info | Large, privacy risk |
| **Selective save** | User runs `/save-conversation` | User control | Depends on habit |
| **Summary save** | AI generates summary | Small, readable | Info loss |
| **Excerpt tagging** | User marks valuable parts | High quality | Operation cost |

**Decision**: TBD - need to clarify primary use case before implementation.

### 5. Multi-Tool Support
- Current focus: Claude Code
- Future: Cursor, Aider, Continue
- Need abstraction layer for different sources

---

## Implementation Phases

### Phase 1: Read & Index (MVP)
- Read `~/.claude/projects/{project}/sessions-index.json`
- Create `.trellis/conversations/index.json` with feature links
- CLI: `trellis history list`

### Phase 2: Search & Summary
- Parse conversation JSONL files
- Generate human-readable `transcript.md`
- CLI: `trellis history search "keyword"`

### Phase 3: Auto-Sync via Hooks
- Hook on session start/end
- Auto-link to current feature
- Auto-generate summary on session end

### Phase 4: Privacy & Export
- Sensitive data detection and redaction
- Export to markdown, JSON formats
- Retention policy management

---

## MVP Design

### Trellis Conversation Index Schema

```json
// .trellis/conversations/index.json
{
  "version": 1,
  "claudeProjectPath": "~/.claude/projects/-Users-kleincr-Dev-mindfold-Trellis",
  "sessions": [
    {
      "sessionId": "496f942b-40a9-42d5-8ba3-a06793fdc55f",
      "feature": "16-conversation-persistence",
      "developer": "kleinhe",
      "tags": ["research", "planning"],
      "notes": "Initial research on conversation persistence",
      "linkedAt": "2026-01-18T08:00:00Z"
    }
  ],
  "lastSynced": "2026-01-18T08:00:00Z"
}
```

### CLI Commands (MVP)

```bash
# List sessions (reads from Claude + Trellis index)
trellis history list [--feature <name>] [--since <date>]

# Link session to feature
trellis history link <session-id> --feature <name>

# Search conversation content
trellis history search "keyword" [--feature <name>]

# Show session details
trellis history show <session-id>
```

### Hook Integration

```bash
# .claude/hooks/post-session.sh (or via CLAUDE_HOOKS env)
# Triggered when session ends
trellis history sync  # Auto-link to current feature
```

---

## Status

**Priority**: High
**Stage**: Research Complete → Pending Decision

**Research Completed** ✅:
- [x] Claude Code format stability (stable across 2.0.70 → 2.1.12)
- [x] Privacy risk assessment (low risk, redaction as safeguard)
- [x] Technical feasibility (A+D approach works)

**Pending Decision** 🔴:
- [ ] Team learning vs individual use - which is primary?
- [ ] Storage strategy depends on above decision

**Next Steps**:
- [ ] Implement `trellis history list` command
- [ ] Implement `.trellis/conversations/index.json` creation
- [ ] Add hook for auto-linking sessions to features
- [ ] Implement `trellis history search` command
