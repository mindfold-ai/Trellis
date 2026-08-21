import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Declared entry points let an installed wrapper pack (for example a company
 * command pack that wraps `/trellis:finish-work` behind its own finish-work
 * command) tell Trellis which surface agents should be routed to for a
 * workflow. Trellis consults the declaration when it writes routing text and
 * falls back to its own literals when nothing is declared, so behavior in a
 * repository without a declaration is unchanged.
 *
 * The declaration lives at `.trellis/entry-points.json` in the target
 * repository and is owned by whatever installed it — Trellis never writes it:
 *
 * ```json
 * {
 *   "schemaVersion": 1,
 *   "entryPoints": {
 *     "start": "/sd:sd-start",
 *     "continue": "/sd:sd-continue",
 *     "finish-work": "/sd:sd-finish-work",
 *     "update-spec": "sd-update-spec"
 *   }
 * }
 * ```
 *
 * Every key is optional. Values are surface names rendered verbatim into
 * routing text (a slash command or a skill name), so they are bounded and
 * validated strictly; any invalid file, shape, key, or value disables the
 * whole declaration rather than applying it partially.
 */
export interface DeclaredEntryPoints {
  start?: string;
  continue?: string;
  "finish-work"?: string;
  "update-spec"?: string;
}

export const ENTRY_POINTS_FILE = "entry-points.json";

const ENTRY_POINT_KEYS = new Set([
  "start",
  "continue",
  "finish-work",
  "update-spec",
]);

const ENTRY_POINT_VALUE_RE = /^\/?[A-Za-z0-9][A-Za-z0-9/:._-]{0,63}$/;

const MAX_DECLARATION_BYTES = 16 * 1024;

/**
 * Routing literals each declared key replaces in written template content.
 * Only exact command/skill routing tokens are mapped; bare skill-identity
 * names such as `trellis-start` are deliberately not rewritten, because they
 * also name the installed skill directories themselves.
 */
const ENTRY_POINT_LITERALS: readonly (readonly [
  keyof DeclaredEntryPoints,
  string,
])[] = [
  ["finish-work", "/trellis:finish-work"],
  ["continue", "/trellis:continue"],
  ["start", "/trellis:start"],
  ["update-spec", "trellis-update-spec"],
];

let declaredEntryPoints: DeclaredEntryPoints | null = null;

/**
 * Read and validate `.trellis/entry-points.json` under `projectPath`.
 * Returns `null` (fall back to Trellis literals) for a missing, oversized,
 * unparsable, or in any way invalid declaration. Never throws.
 */
export function loadDeclaredEntryPoints(
  projectPath: string,
): DeclaredEntryPoints | null {
  const filePath = path.join(projectPath, ".trellis", ENTRY_POINTS_FILE);
  let raw: string;
  try {
    if (statSync(filePath).size > MAX_DECLARATION_BYTES) return null;
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const root = parsed as Record<string, unknown>;
  if (root.schemaVersion !== 1) return null;
  if (
    Object.keys(root).some(
      (key) => key !== "schemaVersion" && key !== "entryPoints",
    )
  ) {
    return null;
  }
  const points = root.entryPoints;
  if (points === null || typeof points !== "object" || Array.isArray(points)) {
    return null;
  }
  const result: DeclaredEntryPoints = {};
  for (const [key, value] of Object.entries(
    points as Record<string, unknown>,
  )) {
    if (!ENTRY_POINT_KEYS.has(key)) return null;
    if (typeof value !== "string" || !ENTRY_POINT_VALUE_RE.test(value)) {
      return null;
    }
    // A declared value must not embed a routing literal this transform also
    // replaces: such a value would make repeated substitution passes
    // non-idempotent, and pointing an entry at a Trellis literal is already
    // what the fallback does.
    if (value.includes("/trellis:") || value.includes("trellis-update-spec")) {
      return null;
    }
    result[key as keyof DeclaredEntryPoints] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Install the declaration consulted by `applyDeclaredEntryPoints`. Called
 * once per init/update run after the project path is known; pass `null` to
 * clear (used by tests and by runs without a declaration).
 */
export function setDeclaredEntryPoints(
  value: DeclaredEntryPoints | null,
): void {
  declaredEntryPoints = value;
}

/**
 * Replace Trellis routing literals in template content with the declared
 * entry points. No-op when nothing is declared. Applied at the same
 * init/update write chokepoints as `replacePythonCommandLiterals`, so the
 * update-time template hash tracking hashes the same transformed content it
 * writes. Idempotent: the loader rejects declared values that embed a
 * replaced literal, so no substitution can introduce new match sites.
 */
export function applyDeclaredEntryPoints(content: string): string {
  const declared = declaredEntryPoints;
  if (declared === null) return content;
  let result = content;
  for (const [key, literal] of ENTRY_POINT_LITERALS) {
    const value = declared[key];
    if (value !== undefined && value !== literal) {
      result = result.replaceAll(literal, value);
    }
  }
  return result;
}
