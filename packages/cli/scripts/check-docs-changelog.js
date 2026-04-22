#!/usr/bin/env node
/**
 * Pre-release guard: the docs-site changelog for the target version MUST
 * exist before `release:beta` / `release:rc` / `release:promote` run.
 *
 * Background: release scripts tag + push in a single shell chain. Before
 * beta.10, if the AI operator skipped Step 7 of /trellis:create-manifest
 * (the docs-site MDX + docs.json wiring), the npm release would ship
 * without a user-facing changelog page and nobody would notice until a
 * user clicked the Changelog link and saw a 404. This script fails fast
 * with a clear message pointing at the missing files.
 *
 * Usage:
 *   node scripts/check-docs-changelog.js --type beta
 *   node scripts/check-docs-changelog.js --type rc
 *   node scripts/check-docs-changelog.js --type promote
 *
 * --type matches the release script variant: beta bumps the beta.N
 * counter, rc bumps the rc.N counter, promote strips the prerelease
 * suffix (0.5.0-rc.1 → 0.5.0).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DOCS_SITE = path.join(REPO_ROOT, "docs-site");

function readPackageVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
  );
  return pkg.version;
}

function nextVersion(current, type) {
  if (type === "beta") {
    const m = current.match(/^(\d+\.\d+\.\d+)-beta\.(\d+)$/);
    if (m) return `${m[1]}-beta.${parseInt(m[2], 10) + 1}`;
    const rcM = current.match(/^(\d+\.\d+\.\d+)-rc\.(\d+)$/);
    if (rcM) return `${rcM[1]}-beta.0`; // switching track
    const stableM = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (stableM) {
      const [, maj, min, patch] = stableM;
      return `${maj}.${min}.${parseInt(patch, 10) + 1}-beta.0`;
    }
  } else if (type === "rc") {
    const m = current.match(/^(\d+\.\d+\.\d+)-rc\.(\d+)$/);
    if (m) return `${m[1]}-rc.${parseInt(m[2], 10) + 1}`;
    const betaM = current.match(/^(\d+\.\d+\.\d+)-beta\.\d+$/);
    if (betaM) return `${betaM[1]}-rc.0`;
  } else if (type === "promote") {
    // Strip prerelease suffix: 0.5.0-rc.1 → 0.5.0
    return current.replace(/-.*/, "");
  }
  throw new Error(
    `Cannot compute next ${type} version from current="${current}"`,
  );
}

function main() {
  const args = process.argv.slice(2);
  const typeIdx = args.indexOf("--type");
  if (typeIdx === -1 || !args[typeIdx + 1]) {
    console.error("Error: --type <beta|rc|promote> required");
    process.exit(2);
  }
  const type = args[typeIdx + 1];
  if (!["beta", "rc", "promote"].includes(type)) {
    console.error(`Error: --type must be one of beta/rc/promote (got "${type}")`);
    process.exit(2);
  }

  const current = readPackageVersion();
  const target = nextVersion(current, type);

  const missing = [];
  const enPath = path.join(DOCS_SITE, "changelog", `v${target}.mdx`);
  const zhPath = path.join(DOCS_SITE, "zh", "changelog", `v${target}.mdx`);
  if (!fs.existsSync(enPath)) missing.push(path.relative(REPO_ROOT, enPath));
  if (!fs.existsSync(zhPath)) missing.push(path.relative(REPO_ROOT, zhPath));

  // docs.json should list both as pages. We check by string presence —
  // good enough to catch "forgot to wire the nav" without reimplementing
  // Mintlify's schema.
  const docsJsonPath = path.join(DOCS_SITE, "docs.json");
  if (fs.existsSync(docsJsonPath)) {
    const docsJson = fs.readFileSync(docsJsonPath, "utf-8");
    if (!docsJson.includes(`"changelog/v${target}"`)) {
      missing.push(`docs-site/docs.json (missing "changelog/v${target}" page entry)`);
    }
    if (!docsJson.includes(`"zh/changelog/v${target}"`)) {
      missing.push(`docs-site/docs.json (missing "zh/changelog/v${target}" page entry)`);
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n❌ Cannot release v${target}: docs-site changelog is not wired up.\n`,
    );
    console.error("Missing:");
    for (const m of missing) console.error(`  - ${m}`);
    console.error(
      "\nRun /trellis:create-manifest Step 7 (docs-site changelogs) before\n" +
      "retrying the release. The MDX files must be authored + committed on\n" +
      "the docs-site submodule's main branch, then the submodule pointer\n" +
      "bumped in the main repo.\n",
    );
    process.exit(1);
  }

  console.log(`✅ docs-site changelog wired for v${target}`);
}

main();
