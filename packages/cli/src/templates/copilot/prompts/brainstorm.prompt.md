---
description: "Explore requirements and produce planning content with or without a Trellis task."
---

# Trellis Brainstorm

## Non-Negotiable Planning Contract

A request to build, implement, fix, refactor, or "go ahead" is not approval to leave planning. The caller owns any lifecycle approval and activation.

For every non-trivial requirement, present a final planning summary for review. The caller decides how implementation approval is obtained.

While any user-owned product, scope, UX, compatibility, risk, or acceptance decision remains unresolved, end the turn with exactly one highest-value question. Do not edit product code or dispatch implementation.

## Non-Negotiable Evidence Rule

If a question can be answered by exploring the codebase, explore the codebase instead.

This is mandatory. Before asking the user a question, first check whether the answer is already available in code, tests, configs, docs, existing specs, or task history.

Do not ask the user to confirm facts that the repository can answer. Ask only for product intent, preference, scope, risk tolerance, acceptance behavior, or decisions that remain ambiguous after inspection.

Repository evidence establishes current behavior and technical constraints. The user's intended behavior, feature scope boundaries, and UX preferences are never answerable by repository evidence alone, even when an existing pattern exists; existing patterns are options and recommendation evidence, not decisions.

---

Use this skill to turn a requirement or problem into clear, reviewable planning content. It can run with or without a Trellis task.

## Input and Output

Start from the caller's requirement or problem, optional evidence context, and optional output destination. An active task is not required. Do not create or select a task or directory, bind a session, start or archive a task, or ask for lifecycle consent.

When the caller provides a planning document destination, update the documents there. Without a destination, return the planning content in the conversation. The caller owns task creation, output paths, context manifests, artifact review, approval, and activation.

## Planning Flow

1. Capture the user's request and initial known facts in the supplied planning destination, or in conversation when none is supplied.
2. Inspect available evidence before asking questions:
   - code, tests, fixtures, and configs
   - README files, docs, existing specs, and domain notes
   - related Trellis tasks, research files, and session history when present
3. Separate what you found into:
   - confirmed facts
   - product intent still needed from the user
   - scope or risk decisions still needed from the user
   - likely out-of-scope items
4. If a user-owned decision remains, ask the single highest-value question, include your recommendation and trade-off, then stop. Do not perform implementation work in the same turn.
5. After each user answer, update the planning content, recompute the decision inventory, and repeat from step 2.
6. When no user-owned decision remains, develop design and execution-plan content for complex work.
7. Run the requirement convergence gate, then the PRD convergence pass.
8. Present the final planning summary and return control to the caller. The caller applies its own review and implementation gates.

Do not invent a project-specific product/spec hierarchy. If the repository already has product, domain, or spec docs, use them. If it does not, proceed with the evidence that exists.

## Question Rules

Ask only one question per message.

Each question must include:

- the decision needed
- why the answer matters
- your recommended answer
- the trade-off if the user chooses differently

Do not ask process questions such as whether to search, inspect files, or continue brainstorming. Do the evidence work directly. Ask the user only when the remaining issue is a product decision, preference, scope boundary, or risk tolerance choice.

Recommendations are not default selections. Never choose a recommended product decision on the user's behalf merely because the user asked for implementation.

Do not manufacture clarification questions when the request and repository evidence already resolve every decision. In that case, proceed directly to the final planning summary.

When the caller uses a planning review gate, return a summary detailed enough for that review.

## Thinking Framework: First Principles Analysis

When requirements are vague, solutions feel over-engineered, or you're about to add complexity "because everyone does" — decompose to fundamental truths before reasoning upward.

### Step 1: Restate the Problem

Strip away implementation details to one sentence.

> Bad: "We need to add Redis caching to the user profile endpoint"
> Good: "User profile data takes too long to load"

### Step 2: List Fundamental Truths

What is absolutely true (not opinion or convention)?

| Category | Examples |
|----------|----------|
| **Physical constraints** | Network latency ≥ 0, disk I/O has limits |
| **Business rules** | "Users must see their own data" |
| **Technical invariants** | "Data must be consistent" |
| **User needs** | "The user wants X within Y seconds" |

### Step 3: Challenge Assumptions

For each component of the current plan:

- **Fact or convention?** "We always use REST" — why?
- **What if we removed this?** If nothing breaks, it's unnecessary.
- **Solving the actual problem or a symptom?** Trace the causal chain.
- **Who benefits from this complexity?** If "nobody", simplify.

### Step 4: Build Up from Truths

1. Start with the minimum viable mechanism satisfying all truths
2. Add complexity only when a specific truth demands it
3. Each addition must answer: "Which truth requires this?"

### Step 5: Validate

- Does the solution solve the original problem?
- What assumptions need verification?
- What's the simplest experiment to test this?

## Requirement Convergence Gate

Before final review, verify all of the following:

- the user outcome and product value are explicit
- in-scope and out-of-scope behavior are explicit
- acceptance criteria describe observable outcomes
- user-owned product, scope, UX, compatibility, and risk decisions are resolved
- blocking open questions are empty
- technical unknowns are researched or explicitly deferred without changing MVP behavior

Lightweight planning may omit design and execution detail; it may not skip evidence inspection or requirement convergence. The caller decides any implementation approval.

The final planning summary must show Goal, In Scope, Out of Scope, Acceptance Criteria, Key Decisions, relevant Risks or Deferred Items, and artifact status.

## Artifact Rules

Requirements content records:

- goal and user value
- confirmed facts
- requirements
- acceptance criteria
- out of scope
- open questions that still block planning

Design content records technical design for complex tasks:

- architecture and boundaries
- data flow and contracts
- compatibility and migration notes
- important trade-offs
- operational or rollback considerations

Execution plan content records implementation steps for complex tasks:

- ordered implementation checklist
- validation commands
- risky files or rollback points
- follow-up checks before implementation

When writing to a Trellis task destination, use `prd.md`, `design.md`, and `implement.md` as appropriate. The caller manages any task manifests and activation checks.

## PRD Convergence Pass

Before returning completed planning content, consolidate the requirements once against the final structure described above.

The pass must be lossless:

- Collapse repeated facts into one authoritative section.
- Fold temporary brainstorm sections such as `What I already know`, `Assumptions`, and resolved `Open Questions` into Goal, Background, Requirements, Technical Notes, or Acceptance Criteria.
- Remove resolved open questions instead of leaving empty or already-answered sections.
- Merge parallel bug and requirement lists when they describe the same work; keep each defect's severity, evidence, and file:line anchors on the owning requirement.
- Preserve every file:line anchor, decision, constraint, requirement ID, and acceptance-criteria mapping.
- Do not proceed to final review while any blocking open question remains.

After the pass, read the requirements top to bottom and verify that no fact is repeated across sections unless the repetition adds new information.

## Quality Bar

Before declaring planning ready:

- Requirements contain testable acceptance criteria.
- Requirements have passed the convergence pass: no unresolved temporary brainstorm sections, no duplicate facts across sections, and no lost anchors, decisions, or acceptance mappings.
- Repository-answerable questions have already been answered through inspection.
- Blocking open questions are empty.
- Complex tasks include design and execution planning content.
- A final planning summary is ready for the caller's review.

Do not start implementation from this skill.
