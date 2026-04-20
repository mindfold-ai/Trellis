/**
 * Trellis Context Injection Plugin
 *
 * Injects context when Task tool is called with supported subagent types.
 * Uses OpenCode's tool.execute.before hook.
 */

import { existsSync, readdirSync } from "fs"
import { join } from "path"
import { TrellisContext, debugLog } from "../lib/trellis-context.js"

// Supported subagent types
const AGENTS_ALL = ["implement", "check", "research"]
const AGENTS_REQUIRE_TASK = ["implement", "check"]

/**
 * Get context for implement agent
 */
function getImplementContext(ctx, taskDir) {
  const parts = []

  const jsonlPath = join(ctx.directory, taskDir, "implement.jsonl")
  const entries = ctx.readJsonlWithFiles(jsonlPath)
  if (entries.length > 0) {
    parts.push(ctx.buildContextFromEntries(entries))
  }

  const prd = ctx.readProjectFile(join(taskDir, "prd.md"))
  if (prd) {
    parts.push(`=== ${taskDir}/prd.md (Requirements) ===\n${prd}`)
  }

  const info = ctx.readProjectFile(join(taskDir, "info.md"))
  if (info) {
    parts.push(`=== ${taskDir}/info.md (Technical Design) ===\n${info}`)
  }

  return parts.join("\n\n")
}

/**
 * Get context for check agent
 */
function getCheckContext(ctx, taskDir) {
  const parts = []

  const jsonlPath = join(ctx.directory, taskDir, "check.jsonl")
  const entries = ctx.readJsonlWithFiles(jsonlPath)
  if (entries.length > 0) {
    parts.push(ctx.buildContextFromEntries(entries))
  }

  const prd = ctx.readProjectFile(join(taskDir, "prd.md"))
  if (prd) {
    parts.push(`=== ${taskDir}/prd.md (Requirements) ===\n${prd}`)
  }

  return parts.join("\n\n")
}

/**
 * Get context for finish phase (final check before PR)
 */
function getFinishContext(ctx, taskDir) {
  // Finish reuses check context (same JSONL source)
  return getCheckContext(ctx, taskDir)
}


/**
 * Get context for research agent
 */
function getResearchContext(ctx) {
  const parts = []

  // Dynamic project structure (scan actual spec directory)
  const specPath = ".trellis/spec"
  const specFull = join(ctx.directory, specPath)

  const structureLines = [`## Project Spec Directory Structure\n\n\`\`\`\n${specPath}/`]
  if (existsSync(specFull)) {
    try {
      const entries = readdirSync(specFull, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("."))
        .sort((a, b) => a.name.localeCompare(b.name))

      for (const entry of entries) {
        const entryPath = join(specFull, entry.name)
        if (existsSync(join(entryPath, "index.md"))) {
          structureLines.push(`├── ${entry.name}/`)
        } else {
          try {
            const nested = readdirSync(entryPath, { withFileTypes: true })
              .filter(d => d.isDirectory() && existsSync(join(entryPath, d.name, "index.md")))
              .sort((a, b) => a.name.localeCompare(b.name))
            if (nested.length > 0) {
              structureLines.push(`├── ${entry.name}/`)
              for (const n of nested) {
                structureLines.push(`│   ├── ${n.name}/`)
              }
            }
          } catch {
            // Ignore nested read errors
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  structureLines.push("```")

  parts.push(structureLines.join("\n") + `

## Search Tips

- Spec files: \`.trellis/spec/**/*.md\`
- Known issues: \`.trellis/big-question/\`
- Code search: Use Glob and Grep tools
- Tech solutions: Use mcp__exa__web_search_exa or mcp__exa__get_code_context_exa`)

  return parts.join("\n\n")
}

/**
 * Build enhanced prompt with context
 */
function buildPrompt(agentType, originalPrompt, context, isFinish = false) {
  const templates = {
    implement: `# Implement Agent Task

You are the Implement Agent in the Multi-Agent Pipeline.

## Your Context

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Understand specs** - All dev specs are injected above
2. **Understand requirements** - Read requirements and technical design
3. **Implement feature** - Follow specs and design
4. **Self-check** - Ensure code quality

## Important Constraints

- Do NOT execute git commit
- Follow all dev specs injected above
- Report list of modified/created files when done`,

    check: isFinish ? `# Finish Agent Task

You are performing the final check before creating a PR.

## Your Context

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Review changes** - Run \`git diff --name-only\` to see all changed files
2. **Verify requirements** - Check each requirement in prd.md is implemented
3. **Spec sync** - Analyze whether changes introduce new patterns, contracts, or conventions
   - If new pattern/convention found: read target spec file → update it → update index.md if needed
   - If infra/cross-layer change: follow the 7-section mandatory template from update-spec.md
   - If pure code fix with no new patterns: skip this step
4. **Run final checks** - Execute lint and typecheck
5. **Confirm ready** - Ensure code is ready for PR

## Important Constraints

- You MAY update spec files when gaps are detected (use update-spec.md as guide)
- MUST read the target spec file BEFORE editing (avoid duplicating existing content)
- Do NOT update specs for trivial changes (typos, formatting, obvious fixes)
- If critical CODE issues found, report them clearly (fix specs, not code)
- Verify all acceptance criteria in prd.md are met` :
      `# Check Agent Task

You are the Check Agent in the Multi-Agent Pipeline.

## Your Context

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Get changes** - Run \`git diff --name-only\` and \`git diff\`
2. **Check against specs** - Check item by item
3. **Self-fix** - Fix issues directly, don't just report
4. **Run verification** - Run lint and typecheck

## Important Constraints

- Fix issues yourself, don't just report
- Must execute complete checklist`,

    research: `# Research Agent Task

You are the Research Agent in the Multi-Agent Pipeline.

## Core Principle

**You do one thing: find and explain information.**

## Project Info

${context}

---

## Your Task

${originalPrompt}

---

## Workflow

1. **Understand query** - Determine search type and scope
2. **Plan search** - List search steps
3. **Execute search** - Run multiple searches in parallel
4. **Organize results** - Output structured report

## Strict Boundaries

**Only allowed**: Describe what exists, where it is, how it works

**Forbidden**: Suggest improvements, criticize implementation, modify files`
  }

  return templates[agentType] || originalPrompt
}

// OpenCode plugin factory: `export default async (input) => hooks`.
// OpenCode 1.2.x iterates every module export and invokes it as a function
// (packages/opencode/src/plugin/index.ts — `for ([_, fn] of Object.entries(mod)) await fn(input)`);
// the previous `{ id, server }` object shape failed with
// `TypeError: fn is not a function` in 1.2.x.
export default async ({ directory }) => {
  const ctx = new TrellisContext(directory)
  debugLog("inject", "Plugin loaded, directory:", directory)

  return {
      "tool.execute.before": async (input, output) => {
        try {
          debugLog("inject", "tool.execute.before called, tool:", input?.tool)

          const toolName = input?.tool?.toLowerCase()
          if (toolName !== "task") {
            return
          }

          const args = output?.args
          if (!args) return

          const subagentType = args.subagent_type
          const originalPrompt = args.prompt || ""

          debugLog("inject", "Task tool called, subagent_type:", subagentType)

          if (!AGENTS_ALL.includes(subagentType)) {
            debugLog("inject", "Skipping - unsupported subagent_type")
            return
          }

          // Read current task
          const taskDir = ctx.getCurrentTask()

          // Agents requiring task directory
          if (AGENTS_REQUIRE_TASK.includes(subagentType)) {
            if (!taskDir) {
              debugLog("inject", "Skipping - no current task")
              return
            }
            const taskDirFull = join(directory, taskDir)
            if (!existsSync(taskDirFull)) {
              debugLog("inject", "Skipping - task directory not found")
              return
            }
          }

          // Check for [finish] marker
          const isFinish = originalPrompt.toLowerCase().includes("[finish]")

          // Get context based on agent type
          let context = ""
          switch (subagentType) {
            case "implement":
              context = getImplementContext(ctx, taskDir)
              break
            case "check":
              context = isFinish
                ? getFinishContext(ctx, taskDir)
                : getCheckContext(ctx, taskDir)
              break
            case "research":
              context = getResearchContext(ctx, taskDir)
              break
          }

          if (!context) {
            debugLog("inject", "No context to inject")
            return
          }

          const newPrompt = buildPrompt(subagentType, originalPrompt, context, isFinish)

          // Mutate args in-place — whole-object replacement does NOT work for the task tool
          // because the runtime holds a local reference to the same args object.
          args.prompt = newPrompt

          debugLog("inject", "Injected context for", subagentType, "prompt length:", newPrompt.length)

        } catch (error) {
          debugLog("inject", "Error in tool.execute.before:", error.message, error.stack)
        }
      }
    }
}
