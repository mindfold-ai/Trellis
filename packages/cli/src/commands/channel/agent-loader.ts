/**
 * Load a Trellis agent definition from `.trellis/agents/<name>.md`.
 *
 * Format: YAML frontmatter (between `---` fences) + markdown body.
 *   The body becomes the system prompt injected into the worker.
 *
 *   ---
 *   name: architect
 *   description: System architect ...
 *   provider: claude       # claude | codex; used as default --provider
 *   model: claude-opus-4-7 # CLI-specific model id; optional
 *   labels: [design]       # optional metadata
 *   ---
 *
 *   You are a senior system architect ...
 *
 * Unknown frontmatter fields are preserved as metadata but ignored by
 * channel runtime (they may be consumed by other Trellis layers).
 */

import fs from "node:fs";
import path from "node:path";

export interface AgentDefinition {
  name: string;
  description?: string;
  provider?: "claude" | "codex";
  model?: string;
  labels?: string[];
  systemPrompt: string;
  raw: Record<string, string>;
  filePath: string;
}

const FRONTMATTER_FENCE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

const SAFE_AGENT_NAME = /^[A-Za-z0-9._-]+$/;

export function findAgentFile(
  name: string,
  cwd: string,
  trustedRoots: string[] = [],
): string | null {
  // Reject path-traversal attempts (`..`, `/`, etc.) — agent names must be
  // a single safe identifier. Without this, `--agent ../../etc/passwd`
  // would read arbitrary host files into the worker system prompt.
  if (!SAFE_AGENT_NAME.test(name)) {
    throw new Error(
      `Agent name '${name}' is not allowed (must match ${SAFE_AGENT_NAME.source})`,
    );
  }
  const agentsRoot = path.resolve(cwd, ".trellis", "agents");
  const candidates = [
    path.join(agentsRoot, `${name}.md`),
    path.join(agentsRoot, name, "AGENT.md"),
  ];
  for (const p of candidates) {
    // Defense in depth: confirm the resolved path stays under agentsRoot,
    // or one of the trusted roots (see context-trust.ts) — accommodates
    // `.trellis/agents` reached through a trusted `.trellis` symlink.
    const real = fs.existsSync(p) ? fs.realpathSync(p) : p;
    const inAgentsRoot =
      real === agentsRoot || real.startsWith(agentsRoot + path.sep);
    const inTrustedRoot = trustedRoots.some(
      (root) => real === root || real.startsWith(root + path.sep),
    );
    if (!inAgentsRoot && !inTrustedRoot) {
      continue;
    }
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function loadAgent(
  name: string,
  cwd: string = process.cwd(),
  trustedRoots: string[] = [],
): AgentDefinition {
  const file = findAgentFile(name, cwd, trustedRoots);
  if (!file) {
    throw new Error(
      `Agent '${name}' not found. Looked in:\n  ${[
        path.join(cwd, ".trellis", "agents", `${name}.md`),
        path.join(cwd, ".trellis", "agents", name, "AGENT.md"),
      ].join("\n  ")}`,
    );
  }

  const raw = fs.readFileSync(file, "utf-8");
  const m = FRONTMATTER_FENCE.exec(raw);
  if (!m) {
    throw new Error(
      `Agent '${name}' at ${file} has no YAML frontmatter (expected --- ... --- block at top)`,
    );
  }

  const fm = parseFrontmatter(m[1] ?? "");
  const body = (m[2] ?? "").trim();

  const provider = normalizeProvider(fm.provider);
  const labels = fm.labels
    ? fm.labels
        .replace(/[[\]]/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  return {
    name: fm.name?.trim() || name,
    description: fm.description?.trim() || undefined,
    provider,
    model: fm.model?.trim() || undefined,
    labels,
    systemPrompt: body,
    raw: fm,
    filePath: file,
  };
}

function normalizeProvider(
  v: string | undefined,
): "claude" | "codex" | undefined {
  if (!v) return undefined;
  const t = v.trim().toLowerCase();
  if (t === "claude" || t === "codex") return t;
  return undefined;
}

/**
 * Very small flat-YAML parser for the frontmatter dialect we expect:
 *   key: value
 *   multiline_key: |
 *     line one
 *     line two
 *
 * Lists / nested objects beyond this are returned as their raw string form.
 */
// Dangerous keys that would corrupt Object.prototype if assigned naïvely.
// We use Object.create(null) as the bag, but also reject these to keep
// callers safe when they iterate / spread the result.
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function parseFrontmatter(text: string): Record<string, string> {
  // Prototype-less object: assignment to `__proto__` etc. won't traverse
  // up to Object.prototype.
  const out: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const inline = m[2];

    if (FORBIDDEN_KEYS.has(key)) {
      process.stderr.write(
        `[channel agent-loader] refusing dangerous frontmatter key '${key}'\n`,
      );
      // Still need to consume any block scalar continuation lines.
      if (inline === "|" || inline === ">") {
        i++;
        while (i < lines.length && !lines[i].match(/^\S/)) i++;
      } else {
        i++;
      }
      continue;
    }

    if (inline === "|" || inline === ">") {
      // Block scalar — collect indented continuation lines
      const block: string[] = [];
      i++;
      while (i < lines.length) {
        const cont = lines[i];
        if (cont.match(/^\S/)) break;
        block.push(cont.replace(/^ {2}/, ""));
        i++;
      }
      out[key] = block.join("\n").trim();
    } else {
      out[key] = inline.trim();
      i++;
    }
  }
  return out;
}
