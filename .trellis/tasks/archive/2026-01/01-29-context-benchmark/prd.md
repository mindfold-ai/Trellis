# Trellis Context Consumption Benchmark

## Background

A community user asked: "Have you tested how much context the Trellis + Skill + MCP approach consumes?"

This task documents and tests the actual context consumption of the Trellis framework.

## Research Findings

### Context Injection Points

| Injection Point | Trigger | Content |
|-----------------|---------|---------|
| **SessionStart Hook** | Session startup | workflow.md + 3 index files + start.md + context output |
| **PreToolUse Hook** | Task(implement/check/debug/research) | Agent-specific specs from jsonl files |
| **SubagentStop Hook** | Check agent stop | Feedback message only |

### Estimated Context Consumption

| Scenario | Lines | Est. Tokens |
|----------|-------|-------------|
| **Session Start (baseline)** | ~900 | ~6,700 |
| + Implement task (4 spec files) | +500-800 | +3,000-5,000 |
| + Check task (with fallback) | +400-600 | +3,000-4,000 |
| + Research task | +50 | +400 |
| **Typical workflow cycle** | ~1,900 | ~12,000-15,000 |

### Total Available Spec Content

| Category | Lines | Est. Tokens |
|----------|-------|-------------|
| Backend specs | 1,454 | ~10,900 |
| Frontend specs | 222 | ~1,700 |
| Guides | 199 | ~1,500 |
| **All specs** | 1,875 | ~14,100 |

## Test Plan

### Test 1: Baseline Session Start
- Start a fresh session with `/start`
- Measure: What gets injected by session-start.py

### Test 2: Implement Agent Context
- Set a task with implement.jsonl containing 4 spec files
- Call Task(implement)
- Measure: Total injected context

### Test 3: Check Agent Context
- Call Task(check) with check.jsonl
- Measure: Total injected context

### Test 4: Full Workflow Cycle
- Complete a full implement -> check cycle
- Measure: Cumulative context across the session

### Test 5: Compare with Skill + MCP
- Document what Skills add (from .claude/commands/)
- Document what MCP servers add (tool definitions only, not responses)

## Acceptance Criteria

- [ ] Document actual token counts for each scenario
- [ ] Create a clear summary table for community sharing
- [ ] Identify optimization opportunities if context is too high
- [ ] Provide recommendations for users with limited context windows

## Output

Create a report that can be shared with the community, including:
1. Clear numbers with methodology
2. Comparison to typical context limits (200k, 100k models)
3. Best practices for managing context
