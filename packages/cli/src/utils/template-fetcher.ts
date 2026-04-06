/**
 * Remote template fetcher for Trellis CLI
 *
 * Fetches spec templates from the official marketplace:
 * https://github.com/mindfold-ai/marketplace
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadTemplate } from "giget";

// =============================================================================
// Constants
// =============================================================================

export const TEMPLATE_INDEX_URL =
  "https://raw.githubusercontent.com/mindfold-ai/marketplace/main/index.json";

const TEMPLATE_REPO = "gh:mindfold-ai/marketplace";

/** Map template type to installation path */
const INSTALL_PATHS: Record<string, string> = {
  spec: ".trellis/spec",
  skill: ".agents/skills",
  command: ".claude/commands",
  full: ".", // Entire project root
};

/** Timeout constants for network operations */
export const TIMEOUTS = {
  /** Timeout for fetching the template index (ms) */
  INDEX_FETCH_MS: 5_000,
  /** Timeout for downloading a template via giget (ms) */
  DOWNLOAD_MS: 30_000,
} as const;

// =============================================================================
// Types
// =============================================================================

export interface SpecTemplate {
  id: string;
  type: string;
  name: string;
  description?: string;
  path: string;
  tags?: string[];
}

interface TemplateIndex {
  version: number;
  templates: SpecTemplate[];
}

export type TemplateStrategy = "skip" | "overwrite" | "append";

export interface RegistrySource {
  /** Original provider prefix (e.g., "gh", "gitlab", "bitbucket") */
  provider: string;
  /** Repository path (e.g., "myorg/myrepo") */
  repo: string;
  /** Subdirectory within the repo (e.g., "marketplace" or "specs/my-template") */
  subdir: string;
  /** Git ref / branch (default: "main") */
  ref: string;
  /** Base URL for fetching raw files (e.g., index.json) */
  rawBaseUrl: string;
  /** Full giget source string for downloading */
  gigetSource: string;
  /** Custom host for self-hosted instances (e.g., "git.company.com"). Undefined for public providers. */
  host?: string;
}

// =============================================================================
// Registry Source Parsing
// =============================================================================

/** Maps provider prefixes to raw file URL patterns */
const RAW_URL_PATTERNS: Record<string, string> = {
  gh: "https://raw.githubusercontent.com/{repo}/{ref}/{subdir}",
  github: "https://raw.githubusercontent.com/{repo}/{ref}/{subdir}",
  gitlab: "https://gitlab.com/{repo}/-/raw/{ref}/{subdir}",
  bitbucket: "https://bitbucket.org/{repo}/raw/{ref}/{subdir}",
};

export const SUPPORTED_PROVIDERS = Object.keys(RAW_URL_PATTERNS);

/**
 * Convert an HTTPS URL to giget-style source format.
 * e.g. "https://github.com/user/repo" → "gh:user/repo"
 *      "https://github.com/user/repo/tree/branch/path" → "gh:user/repo/path#branch"
 * Returns the original string if it's not a recognized HTTPS URL.
 */
export function normalizeRegistrySource(source: string): string {
  const patterns: { re: RegExp; prefix: string }[] = [
    { re: /^https?:\/\/github\.com\//, prefix: "gh:" },
    { re: /^https?:\/\/gitlab\.com\//, prefix: "gitlab:" },
    { re: /^https?:\/\/bitbucket\.org\//, prefix: "bitbucket:" },
  ];

  for (const { re, prefix } of patterns) {
    if (!re.test(source)) continue;
    const path = source.replace(re, "");
    // Handle /tree/<branch>/<subdir> format (GitHub browse URLs)
    const treeMatch = path.match(
      /^([^/]+\/[^/]+)\/tree\/([^/]+)(?:\/(.+?))?(?:\.git)?\/?$/,
    );
    if (treeMatch) {
      const [, repo, ref, subdir] = treeMatch;
      return `${prefix}${repo}${subdir ? `/${subdir}` : ""}#${ref}`;
    }
    // Plain URL: strip trailing .git and /
    const cleaned = path.replace(/\.git\/?$/, "").replace(/\/$/, "");
    return `${prefix}${cleaned}`;
  }

  return source;
}

/** Known public domains that have dedicated giget provider prefixes */
const KNOWN_PUBLIC_DOMAINS = ["github.com", "gitlab.com", "bitbucket.org"];

/** Maps SSH/HTTPS domains of public providers to their giget prefix */
const PUBLIC_DOMAIN_TO_PREFIX: Record<string, string> = {
  "github.com": "gh",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
};

/**
 * Parse a giget-style registry source into its components.
 *
 * Supported input formats:
 * | Format                              | Example                                      | Provider  | Host?     |
 * |-------------------------------------|----------------------------------------------|-----------|-----------|
 * | giget prefix                        | gh:org/repo, gitlab:org/repo#ref             | native    | no        |
 * | Public HTTPS                        | https://github.com/org/repo                  | native    | no        |
 * | Public SSH                          | git@github.com:org/repo                      | native    | no        |
 * | Self-hosted HTTPS                   | https://git.corp.com/org/repo                | gitlab    | yes       |
 * | Self-hosted SSH                     | git@git.corp.com:org/repo                    | gitlab    | yes       |
 * | ssh:// protocol (with/without port) | ssh://git@host:2222/org/repo                 | gitlab    | yes       |
 * | HTTPS with port                     | https://host:8443/org/repo                   | gitlab    | yes       |
 * | GitLab browse URL                   | https://host/org/repo/-/tree/branch/path     | gitlab    | yes       |
 *
 * Ref defaults to "main" if not specified.
 * Unknown domains default to GitLab URL patterns (covers self-hosted GitLab CE/EE).
 *
 * @throws Error if provider is unsupported
 */
export function parseRegistrySource(source: string): RegistrySource {
  // --- Self-hosted URL detection (SSH + unknown HTTPS) ---
  let host: string | undefined;
  let normalizedInput: string | undefined;

  // SSH URL: git@host:org/repo[.git] or ssh://git@host[:port]/org/repo[.git]
  const sshMatch =
    source.match(/^git@([^:]+):(.+?)(?:\.git)?\/?$/) ??
    source.match(/^ssh:\/\/git@([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/);
  if (sshMatch) {
    const sshDomain = sshMatch[1];
    const sshPath = sshMatch[2];
    const publicPrefix = PUBLIC_DOMAIN_TO_PREFIX[sshDomain];
    if (publicPrefix) {
      // Public provider SSH (e.g., git@github.com:org/repo) — use native prefix, no host
      normalizedInput = `${publicPrefix}:${sshPath}`;
    } else {
      // Self-hosted SSH — default to gitlab provider with host
      host = sshDomain;
      normalizedInput = `gitlab:${sshPath}`;
    }
  }

  // HTTPS URL to unknown domain (not github.com/gitlab.com/bitbucket.org)
  if (!host) {
    const httpsMatch = source.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/);
    if (httpsMatch) {
      const domain = httpsMatch[1];
      if (!KNOWN_PUBLIC_DOMAINS.includes(domain)) {
        host = domain;
        const pathPart = httpsMatch[2];
        // Handle GitLab browse URLs: /org/repo/-/tree/branch/path
        const treeMatch = pathPart.match(
          /^([^/]+\/[^/]+)(?:\/-)?\/tree\/([^/]+)(?:\/(.+?))?$/,
        );
        if (treeMatch) {
          const [, repoPath, ref, subdir] = treeMatch;
          normalizedInput = `gitlab:${repoPath}${subdir ? `/${subdir}` : ""}#${ref}`;
        } else {
          normalizedInput = `gitlab:${pathPart}`;
        }
      }
    }
  }

  // Auto-convert known HTTPS URLs to giget format (existing logic)
  const normalized = normalizedInput ?? normalizeRegistrySource(source);

  // Extract provider prefix
  const colonIndex = normalized.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid registry source "${source}". Expected format: gh:user/repo/path`,
    );
  }

  const provider = normalized.slice(0, colonIndex);
  const rest = normalized.slice(colonIndex + 1);

  // Check supported provider
  const pattern = RAW_URL_PATTERNS[provider];
  if (!pattern) {
    const supported = [...new Set(Object.keys(RAW_URL_PATTERNS))].join(", ");
    throw new Error(
      `Unsupported provider "${provider}". Supported: ${supported}`,
    );
  }

  // Parse rest: user/repo/subdir#ref
  // Match: user/repo (required), /subdir (optional), #ref (optional)
  const refMatch = rest.match(/^([^#]+?)(?:#(.+))?$/);
  if (!refMatch) {
    throw new Error(
      `Invalid registry source "${normalized}". Expected format: ${provider}:user/repo/path`,
    );
  }

  const pathPart = refMatch[1];
  const ref = refMatch[2] ?? "main";

  // Split into repo (first two segments) and subdir (rest)
  const segments = pathPart.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new Error(
      `Invalid registry source "${normalized}". Must include user/repo at minimum.`,
    );
  }

  const repo = `${segments[0]}/${segments[1]}`;
  const subdir = segments.slice(2).join("/");

  // Build raw base URL
  let rawBaseUrl = pattern
    .replace("{repo}", repo)
    .replace("{ref}", ref)
    .replace("{subdir}", subdir);

  // Replace public domain with self-hosted host in rawBaseUrl
  if (host && provider === "gitlab") {
    rawBaseUrl = rawBaseUrl.replace("https://gitlab.com", `https://${host}`);
  }

  // Build giget source (use normalized format)
  const gigetSource = normalized;

  return { provider, repo, subdir, ref, rawBaseUrl, gigetSource, host };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Temporarily set `GIGET_GITLAB_URL` env var for self-hosted GitLab downloads.
 * Restores the previous value (or deletes it) after the callback completes.
 */
async function withGigetHost<T>(
  host: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!host) return fn();
  const prev = process.env.GIGET_GITLAB_URL;
  process.env.GIGET_GITLAB_URL = `https://${host}`;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.GIGET_GITLAB_URL;
    else process.env.GIGET_GITLAB_URL = prev;
  }
}

/**
 * Race a promise against a timeout.
 * giget does not support AbortSignal, so we use Promise.race instead.
 * The timer is cleaned up on success to avoid keeping the process alive.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms,
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

// =============================================================================
// Fetch Template Index
// =============================================================================

/**
 * Fetch available templates from the remote index
 * Returns empty array on network error or timeout (allows fallback to blank)
 *
 * @param indexUrl - URL to fetch index.json from (defaults to official marketplace)
 */
export async function fetchTemplateIndex(
  indexUrl?: string,
): Promise<SpecTemplate[]> {
  try {
    const url = indexUrl ?? TEMPLATE_INDEX_URL;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUTS.INDEX_FETCH_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const index: TemplateIndex = (await res.json()) as TemplateIndex;
    return index.templates;
  } catch {
    // Network error or timeout - return empty array, caller will fallback to blank
    return [];
  }
}

/**
 * Probe a registry's index.json, distinguishing "not found" from transient errors.
 * Used by the registry flow to decide marketplace vs direct-download mode.
 *
 * - 404 → { templates: [], isNotFound: true }
 * - Other HTTP error / network timeout → { templates: [], isNotFound: false }
 * - 200 + valid JSON → { templates: [...], isNotFound: false }
 */
export async function probeRegistryIndex(indexUrl: string): Promise<{
  templates: SpecTemplate[];
  isNotFound: boolean;
}> {
  try {
    const res = await fetch(indexUrl, {
      signal: AbortSignal.timeout(TIMEOUTS.INDEX_FETCH_MS),
    });
    if (res.status === 404) {
      return { templates: [], isNotFound: true };
    }
    if (!res.ok) {
      return { templates: [], isNotFound: false };
    }
    const index: TemplateIndex = (await res.json()) as TemplateIndex;
    return { templates: index.templates, isNotFound: false };
  } catch {
    // Network error or timeout
    return { templates: [], isNotFound: false };
  }
}

/**
 * Find a template by ID from the index
 */
export async function findTemplate(
  templateId: string,
  indexUrl?: string,
): Promise<SpecTemplate | null> {
  const templates = await fetchTemplateIndex(indexUrl);
  return templates.find((t) => t.id === templateId) ?? null;
}

// =============================================================================
// Download Template
// =============================================================================

/**
 * Get the installation path for a template type
 */
export function getInstallPath(cwd: string, templateType: string): string {
  const relativePath = INSTALL_PATHS[templateType] || INSTALL_PATHS.spec;
  return path.join(cwd, relativePath);
}

/**
 * Download a template with the specified strategy
 *
 * @param templatePath - Path in the docs repo (e.g., "marketplace/specs/electron-fullstack")
 *                       OR a full giget source (e.g., "gh:myorg/myrepo/my-spec")
 * @param destDir - Destination directory
 * @param strategy - How to handle existing directory: skip, overwrite, or append
 * @param repoSource - Optional giget repo source override. When set, templatePath is
 *                     treated as relative to this repo. When not set, uses TEMPLATE_REPO.
 *                     Pass null to use templatePath as a full giget source directly.
 * @returns true if template was downloaded, false if skipped
 */
export async function downloadWithStrategy(
  templatePath: string,
  destDir: string,
  strategy: TemplateStrategy,
  repoSource?: string | null,
): Promise<boolean> {
  // Build the giget download source
  const gigetSource =
    repoSource === null
      ? templatePath // templatePath is already a full giget source
      : `${repoSource ?? TEMPLATE_REPO}/${templatePath}`;

  const exists = fs.existsSync(destDir);

  // skip: Directory exists, don't download
  if (strategy === "skip" && exists) {
    return false;
  }

  // overwrite: Delete existing directory first
  if (strategy === "overwrite" && exists) {
    await fs.promises.rm(destDir, { recursive: true });
  }

  // append: Download to temp dir, then merge missing files
  if (strategy === "append" && exists) {
    const tempDir = path.join(os.tmpdir(), `trellis-template-${Date.now()}`);
    try {
      await withTimeout(
        downloadTemplate(gigetSource, {
          dir: tempDir,
          preferOffline: true,
        }),
        TIMEOUTS.DOWNLOAD_MS,
        "Template download",
      );
      await copyMissing(tempDir, destDir);
    } catch (error) {
      // Clean up partially written files on timeout.
      // Note: giget does not support AbortSignal, so the background download may
      // still be running. Removing the directory causes it to fail with ENOENT,
      // which settles the orphaned promise harmlessly.
      if (error instanceof Error && error.message.includes("timed out")) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup
        }
      }
      throw error;
    } finally {
      // Clean up temp directory
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
    return true;
  }

  // Default: Direct download (for new directory or after overwrite)
  try {
    await withTimeout(
      downloadTemplate(gigetSource, {
        dir: destDir,
        preferOffline: true,
      }),
      TIMEOUTS.DOWNLOAD_MS,
      "Template download",
    );
  } catch (error) {
    // Clean up partially written files on timeout.
    // Note: giget does not support AbortSignal, so the background download may
    // still be running. Removing the directory causes it to fail with ENOENT,
    // which settles the orphaned promise harmlessly.
    if (error instanceof Error && error.message.includes("timed out")) {
      try {
        fs.rmSync(destDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
    throw error;
  }
  return true;
}

/**
 * Copy only files that don't exist in the destination
 */
async function copyMissing(src: string, dest: string): Promise<void> {
  // Ensure destination exists
  if (!fs.existsSync(dest)) {
    await fs.promises.mkdir(dest, { recursive: true });
  }

  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy missing files in subdirectory
      await copyMissing(srcPath, destPath);
    } else if (!fs.existsSync(destPath)) {
      // Only copy if file doesn't exist
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Download a template by ID
 *
 * @param cwd - Current working directory
 * @param templateId - Template ID from the index
 * @param strategy - How to handle existing directory
 * @param template - Optional pre-fetched SpecTemplate to avoid double-fetch
 * @param registry - Optional registry source (parsed). When set, uses the registry's
 *                   repo as the giget source instead of the default TEMPLATE_REPO.
 * @returns Object with success status and message
 */
export async function downloadTemplateById(
  cwd: string,
  templateId: string,
  strategy: TemplateStrategy,
  template?: SpecTemplate,
  registry?: RegistrySource,
  destDirOverride?: string,
): Promise<{ success: boolean; message: string; skipped?: boolean }> {
  // Use pre-fetched template or find from index
  let resolved = template;
  if (!resolved) {
    const indexUrl = registry ? `${registry.rawBaseUrl}/index.json` : undefined;
    if (registry && indexUrl) {
      // Use probe to distinguish "template not in index" from "registry unreachable"
      const probeResult = await probeRegistryIndex(indexUrl);
      if (probeResult.templates.length === 0 && !probeResult.isNotFound) {
        return {
          success: false,
          message:
            "Could not reach registry. Check your network connection and try again.",
        };
      }
      if (probeResult.isNotFound) {
        return {
          success: false,
          message:
            "Registry has no index.json. Remove --template to use direct download mode.",
        };
      }
      resolved = probeResult.templates.find((t) => t.id === templateId);
    } else {
      resolved = (await findTemplate(templateId, indexUrl)) ?? undefined;
    }
  }
  if (!resolved) {
    return {
      success: false,
      message: `Template "${templateId}" not found`,
    };
  }

  // Only support spec type in MVP
  if (resolved.type !== "spec") {
    return {
      success: false,
      message: `Template type "${resolved.type}" is not supported yet (only "spec" is supported)`,
    };
  }

  // Get destination path (use override for monorepo per-package downloads)
  const destDir = destDirOverride ?? getInstallPath(cwd, resolved.type);

  // Check if directory exists for skip strategy
  if (strategy === "skip" && fs.existsSync(destDir)) {
    return {
      success: true,
      skipped: true,
      message: `Skipped: ${destDir} already exists`,
    };
  }

  // Download template
  try {
    if (registry) {
      // Custom registry: build full giget source with ref at the end
      // giget format: provider:user/repo/path#ref
      const fullSource = `${registry.provider}:${registry.repo}/${resolved.path}#${registry.ref}`;
      await withGigetHost(registry.host, () =>
        downloadWithStrategy(fullSource, destDir, strategy, null),
      );
    } else {
      await downloadWithStrategy(resolved.path, destDir, strategy);
    }
    return {
      success: true,
      message: `Downloaded template "${templateId}" to ${destDir}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Classify errors for user-friendly messages
    if (errorMessage.includes("timed out")) {
      return {
        success: false,
        message:
          "Download timed out. Check your network connection and try again.",
      };
    }
    if (
      errorMessage.includes("Failed to download") ||
      errorMessage.includes("Failed to fetch")
    ) {
      return {
        success: false,
        message:
          "Could not reach template server. Check your network connection.",
      };
    }
    return {
      success: false,
      message: `Download failed: ${errorMessage}`,
    };
  }
}

/**
 * Download a registry source directly to the spec directory (no index.json).
 * Used when the registry source points to a spec directory, not a marketplace.
 */
export async function downloadRegistryDirect(
  cwd: string,
  registry: RegistrySource,
  strategy: TemplateStrategy,
  destDirOverride?: string,
): Promise<{ success: boolean; message: string; skipped?: boolean }> {
  const destDir = destDirOverride ?? getInstallPath(cwd, "spec");

  if (strategy === "skip" && fs.existsSync(destDir)) {
    return {
      success: true,
      skipped: true,
      message: `Skipped: ${destDir} already exists`,
    };
  }

  try {
    await withGigetHost(registry.host, () =>
      downloadWithStrategy(
        registry.gigetSource,
        destDir,
        strategy,
        null, // null = templatePath is already a full giget source
      ),
    );
    return {
      success: true,
      message: `Downloaded spec from ${registry.gigetSource} to ${destDir}`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("timed out")) {
      return {
        success: false,
        message:
          "Download timed out. Check your network connection and try again.",
      };
    }
    if (
      errorMessage.includes("Failed to download") ||
      errorMessage.includes("Failed to fetch")
    ) {
      return {
        success: false,
        message:
          "Could not reach template server. Check your network connection.",
      };
    }
    return {
      success: false,
      message: `Download failed: ${errorMessage}`,
    };
  }
}
