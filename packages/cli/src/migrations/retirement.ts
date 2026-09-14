import path from "node:path";
import type { MigrationItem } from "../types/migration.js";
import { compareVersions } from "../utils/compare-versions.js";

// Lexical guards must run before filesystem probes, including ancestor moves.
const RETIRED_DATA = [
  ".trellis/.developer",
  ".trellis/workspace",
  ".trellis/agent-traces",
];

export function isRetiredDataPath(
  value: string,
  includeAncestors = false,
): boolean {
  const normalized = path.posix
    .normalize(value.replace(/\\/g, "/"))
    .replace(/\/$/, "");
  return RETIRED_DATA.some(
    (root) =>
      normalized === root ||
      normalized.startsWith(root + "/") ||
      (includeAncestors &&
        (root.startsWith(normalized + "/") || normalized === ".")),
  );
}

export function migrationTouchesRetiredData(item: MigrationItem): boolean {
  return (
    isRetiredDataPath(item.from, true) ||
    !!(item.to && isRetiredDataPath(item.to, true))
  );
}

export const RETIRED_RUNTIME_FILES = [
  ".trellis/scripts/common/developer.py",
  ".trellis/scripts/common/developer.sh",
  ".trellis/scripts/get_developer.py",
  ".trellis/scripts/init_developer.py",
  ".trellis/scripts/add_session.py",
  ".trellis/scripts/get-developer.sh",
  ".trellis/scripts/init-developer.sh",
  ".trellis/scripts/add-session.sh",
  ".github/prompts/record-session.prompt.md",
] as const;

export const RETIREMENT_GUIDE_MARKER = "<!-- trellis-retirement-guide:1 -->";

/** Cumulative target contract, not a rewrite of published historical prose. */
export function retirementGuide(
  from: string,
  target: string,
  allowDowngrade = false,
): string {
  const downgrade = compareVersions(from, target) > 0;
  if (downgrade && !allowDowngrade)
    throw new Error("Downgrades require explicit --allow-downgrade.");
  // The manifest chain starts at 0.1.9; pre-manifest 0.1.x installs are its
  // supported predecessors. All 0.2-0.6 stable/prerelease intervals survive.
  if (
    !/^0\.(?:[0-6])\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(from) &&
    !/^0\.7\.0-castbox\.\d+$/.test(from) &&
    from !== target &&
    !(
      downgrade &&
      allowDowngrade &&
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(from)
    )
  ) {
    throw new Error(
      `Unsupported migration source ${from}; reconcile the installation before updating to ${target}.`,
    );
  }
  return `${RETIREMENT_GUIDE_MARKER}
# Migration to ${target}

Supported sources: pre-manifest 0.0.x and 0.1.x installs, 0.2.x, 0.3.x,
0.4.x, 0.5.x, 0.6.x and their prereleases; earlier 0.7.0-castbox.N targets
and same-target reapply. Explicit --allow-downgrade installs this target's
identity-free runtime without reversing migrations or restoring retired APIs.

## Current task and context contracts
Use Python 3.9 or newer. Replace task.sh with an explicit Python invocation
of .trellis/scripts/task.py and get-context.sh with get_context.py.
Use python3, or the installed Python executable selected on Windows.
New tasks require --creator and --assignee; migration tasks use the fixed
creator trellis-update and an explicit --assignee. Existing task ownership stays intact.
Use list --assignee for explicit filtering. --mine and init --user are retired errors.
Identity, workspace APIs, record context and journal recording are retired,
without replacement stores. Leave .trellis/.developer, .trellis/workspace and
.trellis/agent-traces untouched, including indexes and arbitrary historical files.
Remove custom imports of the retired APIs and remove recording actions from active workflows.
Use task-only finish-work. task_auto_commit keeps the true archive default;
session_auto_commit is deprecated archive-only compatibility, never a recording switch.
Context now exposes the validated session task and project task inventory, not personal fields.

## Surviving cumulative changes
Use .trellis/spec for current specs and .trellis/tasks for task records.
The old multi-agent directory became multi_agent before the pipeline was retired;
do not port it to another script path: use the platform's native worktree primitives.
Replace backend/frontend before-dev and check variants with unified before-dev and check.
Skill directories and implement/check/research agents use the trellis- prefix.
Merge custom model selections deliberately; there is no forced default model.
Cross-layer checks belong to trellis-check; automatic joiner onboarding and legacy
recording commands have no replacement. The iFlow adapter and old pipeline hooks
are retired; select a currently supported platform explicitly.
For selected active tasks only, reconcile context entries referring to old skill paths.
Preserve existing task metadata; do not bulk rewrite historical task records.
Verify Claude SessionStart hookSpecificOutput with hookEventName and additionalContext,
UTF-8 subprocess output and platform-specific Python commands. Verify Codex hook
enablement in its platform configuration where required by that platform.

## AI Assistant Instructions
Inspect only the active managed files named in the resolved update plan and explicitly
selected custom automation. Never recursively scan .trellis or platform history.
Exclude retired data before any traversal, content read, backup or Git status/diff probe.
Reconcile custom enabled scripts, hooks and workflows before proceeding; skipped required
files or .new sidecars alone cannot complete retirement. Review the exact remaining
rename/delete plan, then run trellis update --migrate --assignee <explicit-owner>.
Verify enabled entry points and new task instructions; repeat update to confirm convergence.
`;
}

/** Reject legacy actionable APIs, while allowing explicit retirement explanations. */
export function hasRetiredInstructions(content: string): boolean {
  // Explanations apply to their own clause, not to later commands on the
  // same line. In particular, "retired" must not excuse "Run ...".
  let codeFence: string | undefined;
  return content.split("\n").some((line) => {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (!codeFence) codeFence = fence;
      else if (fence[0] === codeFence[0] && fence.length >= codeFence.length)
        codeFence = undefined;
      return false;
    }
    const codeLine = codeFence !== undefined && !/^\s*(?:#|\/\/)/.test(line);
    return line.split(/(?<=[.!?;])\s+/).some((clause) => {
      // Only a direct prohibition of an old action is harmless. "Never forget
      // to run" is an obligation, not a prohibition of running the command.
      const prohibited =
        /^\W*(?:do not|don't|never|must not|should not)\s+(?:run|invoke|call|execute|use|read|load|write|append|create|initialize|scan|inspect|update|check|export|import|record)\b/i.test(
          clause,
        ) && !/\b(?:and|but|then|while|instead|also)\b|[,;]\s*\S/i.test(clause);
      const imperative =
        /\b(?:run|invoke|call|execute|use|read|load|write|append|create|initialize|scan|inspect|update|check|export|import)\s+|^\W*(?:\d+[.)]\s*)?record\s+/i.test(
          clause,
        );
      const shellCommand =
        /^\s*(?:[$>]\s*)?(?:(?:python(?:\d+(?:\.\d+)*)?|py|bash|sh|zsh|node|npx|uv\s+run)\s+|(?:\.\/)?\.trellis\/scripts\/|TRELLIS_DEVELOPER\s*=)/i.test(
          clause,
        );
      const explanation =
        /\b(?:retired|deprecated|removed|unsupported|untouched|preserve|exclude|no longer supported)\b/i.test(
          clause,
        );
      if (
        prohibited ||
        (explanation && !imperative && !codeLine && !shellCommand)
      )
        return false;

      // Workspace and journal also describe unrelated package/database concepts.
      // Only explicit Trellis targets or direct legacy recording actions qualify.
      const retiredTarget =
        /(?:\.developer\b|\.trellis[\\/](?:workspace|agent-traces)(?:[\\/]|\b)|\bTrellis\s+(?:workspace|journal)\b|\bjournal-\d+\.md\b|--mine\b)/i.test(
          clause,
        );
      const journalRecording =
        /\b(?:append\s+to|record\s+in)\s+(?:(?:the|your)\s+)?journal\b/i.test(
          clause,
        );
      const shellHistoryAccess =
        /(?:^|[|;&]\s*|\$\()\s*(?:(?:sudo|env|command)\b(?:\s+[^|;&]+?)*\s+)?(?:cat|cp|mv|rm|find|grep|rg|sed|awk|head|tail|less|more|printf|echo|tee|install|python(?:\d+(?:\.\d+)*)?|py|node|bash|sh|zsh|npx)\b[^\n]*?(?:\.trellis[\\/](?:\.developer|workspace|agent-traces)(?:[\\/]|\b)|\.developer\b)/i.test(
          clause,
        ) ||
        /(?:>>?|<<)\s*[^\n]*?(?:\.trellis[\\/](?:workspace|agent-traces|\.developer)(?:[\\/]|\b)|\.developer\b)/i.test(
          clause,
        );
      return (
        /(?:get[-_]?developer|init[-_]?developer|add[-_]?session|get_?workspace_?dir|get_?active_?journal_?file|list_?my_?tasks|TRELLIS_DEVELOPER|(?:trellis[-:])?record-session)\b|--mode\s+record\b|(?:grep|rg)\s+-[^\n]*r[^\n]*\.trellis\//i.test(
          clause,
        ) ||
        (imperative && (retiredTarget || journalRecording)) ||
        shellHistoryAccess
      );
    });
  });
}
