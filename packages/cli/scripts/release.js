#!/usr/bin/env node
/**
 * Release orchestrator for the CLI + core pair.
 *
 * This keeps package.json as a thin command table while the release sequence
 * stays in one place:
 *   docs guard -> tests -> pre-release commit -> synchronized bump
 *   -> version check -> version commit -> tag -> push
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIR = path.resolve(__dirname, "..");

const RELEASE_TYPES = new Set([
  "patch",
  "minor",
  "major",
  "beta",
  "rc",
  "promote",
]);

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function run(command, options = {}) {
  execSync(command, {
    cwd: options.cwd ?? CLI_DIR,
    env: process.env,
    stdio: options.capture ? ["pipe", "pipe", "pipe"] : "inherit",
    encoding: "utf-8",
  });
}

function output(command, options = {}) {
  return execSync(command, {
    cwd: options.cwd ?? CLI_DIR,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function hasGitDiff() {
  try {
    execSync("git diff-index --quiet HEAD", {
      cwd: CLI_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return false;
  } catch {
    return true;
  }
}

function docsGuard(type) {
  if (type === "beta" || type === "rc" || type === "promote") {
    run(`node scripts/check-docs-changelog.js --type ${type}`);
  }
}

const PRERELEASE_TYPES = new Set(["beta", "rc"]);

function currentBranch() {
  return output("git rev-parse --abbrev-ref HEAD");
}

/**
 * Refuse to release from a branch whose name does not match the release type.
 *
 * Both push forms used here are silent when the branch is wrong, which is why
 * this runs before any commit or tag:
 *
 * - Stable pushed `main`, meaning the *local main ref*. Releasing from any
 *   other branch pushed an unchanged `main` while still publishing the tag —
 *   the tag exists, the code never lands.
 * - Prerelease pushed `HEAD`, which git resolves to a remote branch of the
 *   same name. Releasing from a sync or topic branch created that branch on
 *   the remote and left the real release line without its version bump, so
 *   the next release from it computed the wrong next version. Hit for real on
 *   v0.7.0-beta.2, released from `sync/v0.7-beta-0.6.13`.
 */
function assertBranchMatchesType(type, branch) {
  if (branch === "HEAD") {
    fail("detached HEAD: check out the release branch before releasing");
  }
  if (PRERELEASE_TYPES.has(type)) {
    if (branch === "main") {
      fail(`${type} releases do not come from main (on "${branch}")`);
    }
    return;
  }
  if (branch !== "main") {
    fail(
      `${type} releases come from main, not "${branch}". ` +
        `Merge this branch into main first, or use release:beta / release:rc.`,
    );
  }
}

/**
 * Confirm the tag commit is reachable from the branch we just pushed.
 *
 * The push itself exits 0 in the failure modes above, so success is only
 * observable after the fact.
 */
function assertPushLanded(branch, tag) {
  run("git fetch origin --quiet");
  try {
    run(`git merge-base --is-ancestor "${tag}" "origin/${branch}"`, {
      capture: true,
    });
  } catch {
    fail(
      `tag ${tag} is not reachable from origin/${branch} after push. ` +
        `The tag may already be published — inspect before re-running.`,
    );
  }
}

function main() {
  const [type = "patch"] = process.argv.slice(2);
  if (!RELEASE_TYPES.has(type)) {
    fail(`usage: release.js <patch|minor|major|beta|rc|promote>`);
  }

  const branch = currentBranch();
  assertBranchMatchesType(type, branch);
  console.log(`releasing ${type} from branch "${branch}"`);

  docsGuard(type);
  run("pnpm --filter @mindfoldhq/trellis-core test");
  run("pnpm test");

  // Exclude .trellis/ from the pre-release sweep: dirty task/workspace files
  // (parallel in-progress work, runtime artifacts) must never be swept into
  // "chore: pre-release updates" (#303). Staging .trellis/ only ever goes
  // through safe_commit.py's precise allowlist, never a blanket `git add -A`.
  run("git add -A -- ':!docs-site' ':!marketplace' ':!.trellis'");
  if (hasGitDiff()) {
    run("git commit -m 'chore: pre-release updates'");
  }

  const version = output(`node scripts/bump-versions.js ${type}`);
  run("node scripts/release-preflight.js check-versions");
  run("git add package.json ../core/package.json");
  run(`git commit -m "${version}"`);
  run(`git tag "v${version}"`);
  // Push HEAD to the branch we are actually on, by name. `HEAD` alone relies
  // on the remote having a same-named branch, and a bare `main` pushes the
  // local main ref regardless of where the release commit lives.
  run(`git push origin "HEAD:${branch}" --tags`);
  assertPushLanded(branch, `v${version}`);
}

main();
