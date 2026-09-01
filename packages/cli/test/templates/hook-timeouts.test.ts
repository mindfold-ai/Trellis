/**
 * Regression guard for default hook timeouts (GitHub issue #267).
 *
 * Windows Python cold start + session-start.py + nested subprocess calls
 * routinely exceed 10s, causing silent SessionStart drops. The defaults were
 * bumped from 10/5 seconds to 30/15 seconds across all hook-based platforms
 * (gemini uses milliseconds: 30000/15000). This test iterates the platform
 * config list dynamically so future drift surfaces immediately.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const TEMPLATES_ROOT = join(
  dirname(__filename),
  "..",
  "..",
  "src",
  "templates",
);

/**
 * Per-platform hook config descriptor.
 *
 * - `sessionStartEvent`: null when the platform has no SessionStart hook.
 *   Used to look up entries in `parsed.hooks[event]`.
 * - `userPromptEvent`: event key for the inject-workflow-state hook (varies:
 *   `UserPromptSubmit`, `BeforeAgent`, `userPromptSubmitted`,
 *   `beforeSubmitPrompt`).
 * - `sessionStartTimeoutField` / `userPromptTimeoutField`: usually "timeout";
 *   copilot uses `timeoutSec` for its userPromptSubmitted event only.
 * - `unit`: "ms" for gemini; "s" for everything else.
 *
 * Add new hook-based platforms here when introduced.
 */
const PLATFORM_HOOK_CONFIGS = [
  {
    platform: "claude",
    path: "claude/settings.json",
    schema: "nested",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "UserPromptSubmit",
    userPromptTimeoutField: "timeout",
    unit: "s",
  },
  {
    platform: "codebuddy",
    path: "codebuddy/settings.json",
    schema: "nested",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "UserPromptSubmit",
    userPromptTimeoutField: "timeout",
    unit: "s",
  },
  {
    platform: "droid",
    path: "droid/settings.json",
    schema: "nested",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "UserPromptSubmit",
    userPromptTimeoutField: "timeout",
    unit: "s",
  },
  {
    platform: "qoder",
    path: "qoder/settings.json",
    schema: "nested",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "UserPromptSubmit",
    userPromptTimeoutField: "timeout",
    unit: "s",
  },
  {
    platform: "gemini",
    path: "gemini/settings.json",
    schema: "nested",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "BeforeAgent",
    userPromptTimeoutField: "timeout",
    unit: "ms",
  },
  {
    // Copilot is unique: SessionStart uses `timeout` (seconds), while
    // userPromptSubmitted uses `timeoutSec`. Both still in seconds.
    platform: "copilot",
    path: "copilot/hooks.json",
    schema: "flat",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "userPromptSubmitted",
    userPromptTimeoutField: "timeoutSec",
    unit: "s",
  },
  {
    // Cursor's beforeSubmitPrompt schema accepts only `{continue, user_message}`
    // — it cannot inject context. The per-turn workflow-state hook is therefore
    // not wired for Cursor; only sessionStart carries Trellis context.
    platform: "cursor",
    path: "cursor/hooks.json",
    schema: "flat",
    sessionStartEvent: "sessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: null,
    userPromptTimeoutField: "timeout",
    unit: "s",
  },
  {
    platform: "codex",
    path: "codex/hooks.json",
    schema: "nested",
    sessionStartEvent: "SessionStart",
    sessionStartTimeoutField: "timeout",
    userPromptEvent: "UserPromptSubmit",
    userPromptTimeoutField: "timeout",
    unit: "s",
  },
] as const;

/**
 * Extract every leaf hook descriptor (with `timeout`/`timeoutSec`) under an
 * event entry. Handles both the "nested" schema (Claude-style:
 * `[{matcher, hooks: [...]}]`) and the "flat" schema (Cursor/Copilot-style:
 * `[{command, timeout}]`).
 */
function extractHookEntries(
  events: unknown,
  schema: "nested" | "flat",
): Record<string, unknown>[] {
  if (!Array.isArray(events)) return [];
  const out: Record<string, unknown>[] = [];
  for (const entry of events) {
    if (!entry || typeof entry !== "object") continue;
    if (schema === "nested") {
      const inner = (entry as { hooks?: unknown }).hooks;
      if (Array.isArray(inner)) {
        for (const hook of inner) {
          if (hook && typeof hook === "object") {
            out.push(hook as Record<string, unknown>);
          }
        }
      }
    } else {
      out.push(entry as Record<string, unknown>);
    }
  }
  return out;
}

describe("hook-timeouts: default timeouts survive Windows Python cold start (issue #267)", () => {
  const MIN_SESSION_START_S = 30;
  const MIN_USER_PROMPT_S = 15;

  for (const cfg of PLATFORM_HOOK_CONFIGS) {
    describe(cfg.platform, () => {
      const raw = readFileSync(join(TEMPLATES_ROOT, cfg.path), "utf-8");
      const parsed = JSON.parse(raw) as {
        hooks?: Record<string, unknown>;
      };

      if (cfg.sessionStartEvent !== null) {
        it(`SessionStart timeout >= ${MIN_SESSION_START_S}${cfg.unit}`, () => {
          const min =
            cfg.unit === "ms"
              ? MIN_SESSION_START_S * 1000
              : MIN_SESSION_START_S;
          const events = parsed.hooks?.[cfg.sessionStartEvent];
          const hooks = extractHookEntries(events, cfg.schema);
          expect(hooks.length).toBeGreaterThan(0);
          for (const hook of hooks) {
            const value = hook[cfg.sessionStartTimeoutField];
            expect(typeof value).toBe("number");
            expect(value as number).toBeGreaterThanOrEqual(min);
          }
        });
      }

      if (cfg.userPromptEvent !== null) {
        it(`${cfg.userPromptEvent} (inject-workflow-state) timeout >= ${MIN_USER_PROMPT_S}${cfg.unit}`, () => {
          const min =
            cfg.unit === "ms" ? MIN_USER_PROMPT_S * 1000 : MIN_USER_PROMPT_S;
          const events = parsed.hooks?.[cfg.userPromptEvent];
          const hooks = extractHookEntries(events, cfg.schema);
          expect(hooks.length).toBeGreaterThan(0);
          for (const hook of hooks) {
            const value = hook[cfg.userPromptTimeoutField];
            expect(typeof value).toBe("number");
            expect(value as number).toBeGreaterThanOrEqual(min);
          }
        });
      }
    });
  }
});
