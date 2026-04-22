import fs from "node:fs";
import path from "node:path";

/**
 * Project type detected by analyzing project files
 */
export type ProjectType = "frontend" | "backend" | "fullstack" | "unknown";

/**
 * Files that indicate a frontend project
 */
const FRONTEND_INDICATORS = [
  // Package managers with frontend deps
  "package.json", // Will check for frontend dependencies
  // Build tools
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "nuxt.config.ts",
  "nuxt.config.js",
  "webpack.config.js",
  "rollup.config.js",
  // Framework configs
  "svelte.config.js",
  "astro.config.mjs",
  "angular.json",
  "vue.config.js",
  // Source directories
  "src/App.tsx",
  "src/App.jsx",
  "src/App.vue",
  "src/app/page.tsx",
  "app/page.tsx",
  "pages/index.tsx",
  "pages/index.jsx",
];

/**
 * Files that indicate a backend project
 */
const BACKEND_INDICATORS = [
  // Go
  "go.mod",
  "go.sum",
  // Rust
  "Cargo.toml",
  "Cargo.lock",
  // Python
  "requirements.txt",
  "pyproject.toml",
  "setup.py",
  "Pipfile",
  "poetry.lock",
  // Java/Kotlin
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  // Ruby
  "Gemfile",
  // PHP
  "composer.json",
  // .NET
  "*.csproj",
  "*.fsproj",
  // Elixir
  "mix.exs",
  // Node.js backend indicators
  "server.ts",
  "server.js",
  "src/server.ts",
  "src/index.ts", // Could be backend entry
];

/**
 * Frontend dependencies in package.json
 */
const FRONTEND_DEPS = [
  "react",
  "vue",
  "svelte",
  "angular",
  "@angular/core",
  "next",
  "nuxt",
  "astro",
  "solid-js",
  "preact",
  "lit",
  "@remix-run/react",
];

/**
 * Backend dependencies in package.json
 */
const BACKEND_DEPS = [
  "express",
  "fastify",
  "hono",
  "koa",
  "hapi",
  "nest",
  "@nestjs/core",
  "fastapi",
  "flask",
  "django",
];

/**
 * Check if a file exists in the project directory
 */
function fileExists(cwd: string, filename: string): boolean {
  // Handle glob patterns like *.csproj
  if (filename.includes("*")) {
    const dir = path.dirname(filename) || ".";
    const pattern = path.basename(filename);
    const searchDir = path.join(cwd, dir);

    if (!fs.existsSync(searchDir)) return false;

    try {
      const files = fs.readdirSync(searchDir);
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$",
      );
      return files.some((f) => regex.test(f));
    } catch {
      return false;
    }
  }

  return fs.existsSync(path.join(cwd, filename));
}

/**
 * Check package.json for frontend/backend dependencies
 */
function checkPackageJson(cwd: string): {
  hasFrontend: boolean;
  hasBackend: boolean;
} {
  const packageJsonPath = path.join(cwd, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return { hasFrontend: false, hasBackend: false };
  }

  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const depNames = Object.keys(allDeps ?? {});

    const hasFrontend = FRONTEND_DEPS.some((dep) => depNames.includes(dep));
    const hasBackend = BACKEND_DEPS.some((dep) => depNames.includes(dep));

    return { hasFrontend, hasBackend };
  } catch {
    return { hasFrontend: false, hasBackend: false };
  }
}

/**
 * Detect project type by analyzing project files
 *
 * @param cwd - Current working directory to analyze
 * @returns Detected project type
 */
export function detectProjectType(cwd: string): ProjectType {
  // Check for file indicators
  const hasFrontendFiles = FRONTEND_INDICATORS.some((f) => fileExists(cwd, f));
  const hasBackendFiles = BACKEND_INDICATORS.some((f) => fileExists(cwd, f));

  // Check package.json dependencies
  const { hasFrontend: hasFrontendDeps, hasBackend: hasBackendDeps } =
    checkPackageJson(cwd);

  const isFrontend = hasFrontendFiles || hasFrontendDeps;
  const isBackend = hasBackendFiles || hasBackendDeps;

  if (isFrontend && isBackend) {
    return "fullstack";
  } else if (isFrontend) {
    return "frontend";
  } else if (isBackend) {
    return "backend";
  }

  return "unknown";
}

/**
 * Get human-readable description of project type
 */
export function getProjectTypeDescription(type: ProjectType): string {
  switch (type) {
    case "frontend":
      return "Frontend project (UI/client-side)";
    case "backend":
      return "Backend project (server-side/API)";
    case "fullstack":
      return "Fullstack project (frontend + backend)";
    case "unknown":
      return "Unknown project type (defaults to fullstack)";
  }
}

// =============================================================================
// Monorepo Detection
// =============================================================================

/**
 * Detected package in a monorepo workspace
 */
export interface DetectedPackage {
  /** Package name (from package.json, Cargo.toml, go.mod, etc.) */
  name: string;
  /** Relative path from cwd, normalized (no ./ prefix or trailing /) */
  path: string;
  /** Project type detected via detectProjectType() */
  type: ProjectType;
  /** Whether this package is a git submodule */
  isSubmodule: boolean;
  /** Whether this package has its own .git (independent repo, e.g. polyrepo sibling) */
  isGitRepo: boolean;
}

/**
 * Sanitize a package name for use as a directory name.
 * Strips npm scope prefix (@scope/) so "@zhubao/desktop" becomes "desktop".
 */
export function sanitizePkgName(name: string): string {
  return name.replace(/^@[^/]+\//, "");
}

/**
 * Normalize a package path: strip ./ prefix, trailing /, unify separators.
 */
function normalizePkgPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * Check if a relative path is an existing directory.
 */
function dirExists(cwd: string, relPath: string): boolean {
  try {
    return fs.statSync(path.join(cwd, relPath)).isDirectory();
  } catch {
    return false;
  }
}

// --- Glob expansion for workspace patterns ---

/**
 * Expand workspace glob patterns (e.g. "packages/*") into actual directory paths.
 * Supports ! prefix for exclusion patterns.
 */
function expandWorkspaceGlobs(cwd: string, patterns: string[]): string[] {
  const included: string[] = [];
  const excluded = new Set<string>();

  for (const raw of patterns) {
    const isExclude = raw.startsWith("!");
    const pattern = normalizePkgPath(isExclude ? raw.slice(1) : raw);

    const dirs = pattern.includes("*")
      ? matchGlobSegments(cwd, pattern.split("/"), 0, "")
      : dirExists(cwd, pattern)
        ? [pattern]
        : [];

    for (const d of dirs) {
      if (isExclude) excluded.add(d);
      else included.push(d);
    }
  }

  return included.filter((p) => !excluded.has(p));
}

/**
 * Recursively match glob segments against the filesystem.
 * Handles * as a single-level directory wildcard.
 */
function matchGlobSegments(
  cwd: string,
  segments: string[],
  index: number,
  current: string,
): string[] {
  if (index >= segments.length) {
    return dirExists(cwd, current) ? [current] : [];
  }

  const seg = segments[index];

  if (seg !== "*") {
    const next = current ? `${current}/${seg}` : seg;
    return matchGlobSegments(cwd, segments, index + 1, next);
  }

  // Wildcard: match all direct subdirectories
  const dir = current ? path.join(cwd, current) : cwd;
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .flatMap((e) => {
        const next = current ? `${current}/${e.name}` : e.name;
        return matchGlobSegments(cwd, segments, index + 1, next);
      });
  } catch {
    return [];
  }
}

// --- Package name reading ---

/**
 * Read a package name from various config files in the package directory.
 * Falls back to directory name.
 */
function readPackageName(cwd: string, pkgPath: string): string {
  const absPath = path.join(cwd, pkgPath);

  // package.json
  try {
    const pjson = JSON.parse(
      fs.readFileSync(path.join(absPath, "package.json"), "utf-8"),
    );
    if (pjson.name) return pjson.name;
  } catch {
    /* continue */
  }

  // Cargo.toml [package] name
  try {
    const cargo = fs.readFileSync(path.join(absPath, "Cargo.toml"), "utf-8");
    const match = cargo.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    /* continue */
  }

  // go.mod module name
  try {
    const gomod = fs.readFileSync(path.join(absPath, "go.mod"), "utf-8");
    const match = gomod.match(/^module\s+(\S+)/m);
    if (match) return match[1].split("/").pop() ?? path.basename(pkgPath);
  } catch {
    /* continue */
  }

  // pyproject.toml [project] name
  try {
    const pyproj = fs.readFileSync(
      path.join(absPath, "pyproject.toml"),
      "utf-8",
    );
    const match = pyproj.match(/\[project\][\s\S]*?name\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    /* continue */
  }

  return path.basename(pkgPath);
}

// --- Workspace format parsers ---

/** Parse pnpm-workspace.yaml packages list */
function parsePnpmWorkspace(cwd: string): string[] | null {
  try {
    const content = fs.readFileSync(
      path.join(cwd, "pnpm-workspace.yaml"),
      "utf-8",
    );
    const patterns: string[] = [];
    let inPackages = false;

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (/^packages\s*:/.test(trimmed)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        if (trimmed.startsWith("- ")) {
          patterns.push(
            trimmed
              .slice(2)
              .trim()
              .replace(/^['"]|['"]$/g, ""),
          );
        } else if (trimmed && !trimmed.startsWith("#")) {
          break;
        }
      }
    }

    return patterns.length > 0 ? patterns : null;
  } catch {
    return null;
  }
}

/** Parse package.json workspaces (array or yarn v1 object form) */
function parseNpmWorkspaces(cwd: string): string[] | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, "package.json"), "utf-8"),
    );
    const ws = pkg.workspaces;
    if (!ws) return null;
    if (Array.isArray(ws)) return ws;
    if (ws.packages && Array.isArray(ws.packages)) return ws.packages;
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a TOML inline array from a specific section.
 * Handles both single-line and multi-line arrays.
 */
function parseTomlArray(
  content: string,
  key: string,
  sectionHeader: string,
): string[] | null {
  const sectionIdx = content.indexOf(sectionHeader);
  if (sectionIdx === -1) return null;

  const afterSection = content.slice(sectionIdx + sectionHeader.length);
  const nextSection = afterSection.search(/^\[[^[]/m);
  const sectionContent =
    nextSection === -1 ? afterSection : afterSection.slice(0, nextSection);

  const keyPattern = new RegExp(`${key}\\s*=\\s*\\[`);
  const keyMatch = sectionContent.match(keyPattern);
  if (keyMatch?.index === undefined) return null;

  const startIdx = keyMatch.index + keyMatch[0].length;
  const endIdx = sectionContent.indexOf("]", startIdx);
  if (endIdx === -1) return null;

  return sectionContent
    .slice(startIdx, endIdx)
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s && !s.startsWith("#"));
}

/** Parse Cargo.toml workspace members and exclude */
function parseCargoWorkspace(
  cwd: string,
): { members: string[]; exclude: string[] } | null {
  try {
    const content = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf-8");
    if (!/^\[workspace\]\s*$/m.test(content)) return null;

    const members = parseTomlArray(content, "members", "[workspace]");
    if (!members) return null;
    const exclude = parseTomlArray(content, "exclude", "[workspace]") ?? [];
    return { members, exclude };
  } catch {
    return null;
  }
}

/** Parse go.work use directives (block and single-line forms) */
function parseGoWork(cwd: string): string[] | null {
  try {
    const content = fs.readFileSync(path.join(cwd, "go.work"), "utf-8");
    const paths: string[] = [];

    // Block form: use ( ... )
    const blockMatch = content.match(/use\s*\(([\s\S]*?)\)/);
    if (blockMatch) {
      for (const line of blockMatch[1].split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("//")) {
          paths.push(trimmed);
        }
      }
    }

    // Single-line form: use ./path
    for (const match of content.matchAll(/^use\s+(\S+)\s*$/gm)) {
      if (!match[1].startsWith("(")) {
        paths.push(match[1]);
      }
    }

    return paths.length > 0 ? paths : null;
  } catch {
    return null;
  }
}

/** Parse pyproject.toml [tool.uv.workspace] members */
function parseUvWorkspace(cwd: string): string[] | null {
  try {
    const content = fs.readFileSync(path.join(cwd, "pyproject.toml"), "utf-8");
    if (!content.includes("[tool.uv.workspace]")) return null;
    return parseTomlArray(content, "members", "[tool.uv.workspace]");
  } catch {
    return null;
  }
}

/**
 * Scan for sibling/grandchild directories that contain their own `.git`
 * (polyrepo / meta-repo layout: independent clones placed under one parent).
 *
 * Rules:
 * - Scans up to 2 levels deep (immediate children + grandchildren).
 * - When a `.git` is found at a path, that path is a candidate and we DO NOT
 *   descend into it (a package is atomic).
 * - Filters out hidden dirs (starting with `.`) and common build/vendor dirs.
 * - `.git` may be a directory OR a file (worktree gitlink form) — uses
 *   `fs.existsSync` without `isDirectory()` check.
 * - Skips paths in `submodulePaths` to avoid double-counting.
 * - Returns `null` if fewer than 2 candidates (a single sibling repo is just
 *   a misclick, not a polyrepo).
 */
const POLYREPO_IGNORED_DIRS = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  "out",
  "bin",
  "obj",
  "vendor",
  "coverage",
  "tmp",
  "__pycache__",
]);

function parsePolyrepo(
  cwd: string,
  submodulePaths: Set<string>,
): string[] | null {
  const MAX_DEPTH = 2;
  const found: string[] = [];

  function isCandidateDir(name: string): boolean {
    if (name.startsWith(".")) return false;
    if (POLYREPO_IGNORED_DIRS.has(name)) return false;
    return true;
  }

  function scan(relDir: string, depth: number): void {
    if (depth >= MAX_DEPTH) return;
    const absDir = relDir ? path.join(cwd, relDir) : cwd;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!isCandidateDir(entry.name)) continue;

      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const childAbs = path.join(cwd, childRel);

      // `.git` may be a file (worktree gitlink) or a directory — accept either.
      const hasGit = fs.existsSync(path.join(childAbs, ".git"));

      if (hasGit) {
        // Skip if already covered by a submodule entry (avoid double-counting).
        if (!submodulePaths.has(childRel)) {
          found.push(childRel);
        }
        // Do NOT descend into a repo directory — package is atomic.
        continue;
      }

      scan(childRel, depth + 1);
    }
  }

  scan("", 0);

  return found.length >= 2 ? found : null;
}

/** Parse .gitmodules for submodule names and paths */
function parseGitmodules(cwd: string): { name: string; path: string }[] | null {
  try {
    const content = fs.readFileSync(path.join(cwd, ".gitmodules"), "utf-8");
    const modules: { name: string; path: string }[] = [];
    let currentName = "";

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      const headerMatch = trimmed.match(/^\[submodule\s+"([^"]+)"]/);
      if (headerMatch) {
        currentName = headerMatch[1];
        continue;
      }
      const pathMatch = trimmed.match(/^path\s*=\s*(.+)/);
      if (pathMatch && currentName) {
        modules.push({ name: currentName, path: pathMatch[1].trim() });
      }
    }

    return modules.length > 0 ? modules : null;
  } catch {
    return null;
  }
}

// --- Main monorepo detection ---

/**
 * Detect monorepo workspace configuration and enumerate packages.
 *
 * Checks workspace managers in priority order (pnpm → npm/yarn/bun → Cargo → Go → uv),
 * merges results, and marks git submodules. Returns null if no monorepo detected.
 *
 * @param cwd - Repository root to analyze
 * @returns Array of detected packages, null if not a monorepo, empty array if config exists but no packages found
 */
export function detectMonorepo(cwd: string): DetectedPackage[] | null {
  const packages = new Map<string, DetectedPackage>();
  let detected = false;

  // 1. Parse .gitmodules first to build submodule path set
  const submodulePaths = new Map<string, string>();
  const gitmodules = parseGitmodules(cwd);
  if (gitmodules) {
    detected = true;
    for (const mod of gitmodules) {
      const np = normalizePkgPath(mod.path);
      if (np && np !== ".") {
        submodulePaths.set(np, mod.name);
      }
    }
  }

  // 2. Try workspace managers in priority order. The polyrepo parser is
  // appended last and only fires if all 6 prior parsers miss.
  type ParserResult = { dirs: string[]; isGitRepo: boolean } | null;
  const workspaceParsers: (() => ParserResult)[] = [
    () => {
      const p = parsePnpmWorkspace(cwd);
      return p
        ? { dirs: expandWorkspaceGlobs(cwd, p), isGitRepo: false }
        : null;
    },
    () => {
      const p = parseNpmWorkspaces(cwd);
      return p
        ? { dirs: expandWorkspaceGlobs(cwd, p), isGitRepo: false }
        : null;
    },
    () => {
      const r = parseCargoWorkspace(cwd);
      if (!r) return null;
      const inc = expandWorkspaceGlobs(cwd, r.members);
      const exc = new Set(expandWorkspaceGlobs(cwd, r.exclude));
      return { dirs: inc.filter((p) => !exc.has(p)), isGitRepo: false };
    },
    () => {
      const p = parseGoWork(cwd);
      if (!p) return null;
      return {
        dirs: p
          .map(normalizePkgPath)
          .filter((d) => d && d !== "." && dirExists(cwd, d)),
        isGitRepo: false,
      };
    },
    () => {
      const p = parseUvWorkspace(cwd);
      return p
        ? { dirs: expandWorkspaceGlobs(cwd, p), isGitRepo: false }
        : null;
    },
  ];

  let workspaceMatched = false;
  for (const parse of workspaceParsers) {
    const result = parse();
    if (!result) continue;
    workspaceMatched = true;
    detected = true;
    for (const dir of result.dirs) {
      const np = normalizePkgPath(dir);
      if (!np || np === ".") continue;
      if (packages.has(np)) continue;

      packages.set(np, {
        name: readPackageName(cwd, np),
        path: np,
        type: dirExists(cwd, np)
          ? detectProjectType(path.join(cwd, np))
          : "unknown",
        isSubmodule: submodulePaths.has(np),
        isGitRepo: result.isGitRepo,
      });
    }
  }

  // 3. Add submodule-only packages not already covered by workspace managers
  for (const [np, name] of submodulePaths) {
    if (packages.has(np)) continue;
    packages.set(np, {
      name,
      path: np,
      type: dirExists(cwd, np)
        ? detectProjectType(path.join(cwd, np))
        : "unknown",
      isSubmodule: true,
      isGitRepo: false,
    });
  }

  // 4. Polyrepo fallback: only fires if NO workspace parser matched AND no
  // submodules were found. Sibling/grandchild .git directories indicate
  // independent repos placed under one parent (meta-repo / polyrepo layout).
  if (!workspaceMatched && submodulePaths.size === 0) {
    const polyDirs = parsePolyrepo(cwd, new Set(submodulePaths.keys()));
    if (polyDirs) {
      detected = true;
      for (const dir of polyDirs) {
        const np = normalizePkgPath(dir);
        if (!np || np === ".") continue;
        if (packages.has(np)) continue;
        packages.set(np, {
          name: readPackageName(cwd, np),
          path: np,
          type: dirExists(cwd, np)
            ? detectProjectType(path.join(cwd, np))
            : "unknown",
          isSubmodule: false,
          isGitRepo: true,
        });
      }
    }
  }

  if (!detected) return null;
  return Array.from(packages.values());
}
