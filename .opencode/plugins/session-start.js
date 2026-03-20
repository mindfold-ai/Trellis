/* global process */
/**
 * Trellis Session Start Plugin
 *
 * Injects context when user sends the first message in a session.
 * Uses OpenCode's chat.message + experimental.chat.messages.transform hooks.
 *
 * Compatibility:
 * - If oh-my-opencode handles via .claude/hooks/, this plugin skips
 * - Otherwise, this plugin handles injection
 */

import { existsSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import { platform } from "os"
import { TrellisContext, contextCollector, debugLog } from "../lib/trellis-context.js"

// Python command: Windows uses 'python', macOS/Linux use 'python3'
const PYTHON_CMD = platform() === "win32" ? "python" : "python3"

/**
 * Build session context for injection
 */
function buildSessionContext(ctx) {
  const directory = ctx.directory
  const trellisDir = join(directory, ".trellis")
  const claudeDir = join(directory, ".claude")
  const opencodeDir = join(directory, ".opencode")

  const parts = []

  // 1. Header
  parts.push(`<trellis-context>
You are starting a new session in a Trellis-managed project.
Read and follow all instructions below carefully.
</trellis-context>`)

  // 2. Current Context (dynamic)
  const contextScript = join(trellisDir, "scripts", "get_context.py")
  if (existsSync(contextScript)) {
    const output = ctx.runScript(contextScript)
    if (output) {
      parts.push("<current-state>")
      parts.push(output)
      parts.push("</current-state>")
    }
  }

  // 3. Workflow Guide
  const workflow = ctx.readProjectFile(".trellis/workflow.md")
  if (workflow) {
    parts.push("<workflow>")
    parts.push(workflow)
    parts.push("</workflow>")
  }

  // 4. Guidelines Index
  parts.push("<guidelines>")

  parts.push("## Packages")
  // Dynamic package discovery instead of hardcoded spec paths
  let packagesInfo = ""
  try {
    const scriptPath = join(trellisDir, "scripts", "get_context.py")
    if (existsSync(scriptPath)) {
      packagesInfo = execSync(`${PYTHON_CMD} "${scriptPath}" --mode packages`, {
        cwd: directory,
        timeout: 10000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }) || ""
    }
  } catch {
    // Ignore execution errors
  }
  parts.push(packagesInfo || "Not configured")

  parts.push("\n## Guides")
  const guidesIndex = ctx.readProjectFile(".trellis/spec/guides/index.md")
  parts.push(guidesIndex || "Not configured")

  parts.push("</guidelines>")

  // 5. Session Instructions - try both .claude and .opencode
  let startMd = ctx.readFile(join(claudeDir, "commands", "trellis", "start.md"))
  if (!startMd) {
    startMd = ctx.readFile(join(opencodeDir, "commands", "trellis", "start.md"))
  }
  if (startMd) {
    parts.push("<instructions>")
    parts.push(startMd)
    parts.push("</instructions>")
  }

  // 6. Final directive
  parts.push(`<ready>
Context loaded. Wait for user's first message, then follow <instructions> to handle their request.
</ready>`)

  return parts.join("\n\n")
}

export default async ({ directory }) => {
  const ctx = new TrellisContext(directory)
  debugLog("session", "Plugin loaded, directory:", directory)

  return {
    // chat.message - triggered when user sends a message
    "chat.message": async (input, output) => {
      try {
        const sessionID = input.sessionID
        const agent = input.agent || "unknown"
        debugLog("session", "chat.message called, sessionID:", sessionID, "agent:", agent)

        // Skip in non-interactive mode
        if (process.env.OPENCODE_NON_INTERACTIVE === "1") {
          debugLog("session", "Skipping - non-interactive mode")
          return
        }

        // Check if we should skip (omo will handle)
        if (ctx.shouldSkipHook("session-start")) {
          debugLog("session", "Skipping - omo will handle via .claude/hooks/")
          return
        }

        // Only inject on first message
        if (contextCollector.isProcessed(sessionID)) {
          debugLog("session", "Skipping - session already processed")
          return
        }

        // Mark session as processed
        contextCollector.markProcessed(sessionID)

        // Build and store context
        const context = buildSessionContext(ctx)
        debugLog("session", "Built context, length:", context.length)

        contextCollector.store(sessionID, context)
        debugLog("session", "Context stored for session:", sessionID)

      } catch (error) {
        debugLog("session", "Error in chat.message:", error.message, error.stack)
      }
    },

    // experimental.chat.messages.transform - modify messages before sending to AI
    "experimental.chat.messages.transform": async (input, output) => {
      try {
        const { messages } = output
        debugLog("session", "messages.transform called, messageCount:", messages?.length)

        if (!messages || messages.length === 0) {
          return
        }

        // Find last user message
        let lastUserMessageIndex = -1
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].info?.role === "user") {
            lastUserMessageIndex = i
            break
          }
        }

        if (lastUserMessageIndex === -1) {
          debugLog("session", "No user message found")
          return
        }

        const lastUserMessage = messages[lastUserMessageIndex]
        const sessionID = lastUserMessage.info?.sessionID

        debugLog("session", "Found user message, sessionID:", sessionID)

        if (!sessionID || !contextCollector.hasPending(sessionID)) {
          debugLog("session", "No pending context for session")
          return
        }

        // Get and consume pending context
        const pending = contextCollector.consume(sessionID)

        // Find first text part
        const textPartIndex = lastUserMessage.parts?.findIndex(
          p => p.type === "text" && p.text !== undefined
        )

        if (textPartIndex === -1) {
          debugLog("session", "No text part found in user message")
          return
        }

        // Prepend context to the text part (same approach as omo)
        const originalText = lastUserMessage.parts[textPartIndex].text || ""
        lastUserMessage.parts[textPartIndex].text = `${pending.content}\n\n---\n\n${originalText}`

        debugLog("session", "Injected context by prepending to text, length:", pending.content.length)

      } catch (error) {
        debugLog("session", "Error in messages.transform:", error.message, error.stack)
      }
    }
  }
}
