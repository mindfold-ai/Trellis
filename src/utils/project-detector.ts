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
