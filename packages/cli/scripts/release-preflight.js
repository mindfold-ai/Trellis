#!/usr/bin/env node
/**
 * Shared release / publish preflight.
 *
 * One source of truth for:
 *   1. Version match between `@mindfoldhq/trellis` and
 *      `@mindfoldhq/trellis-core` (and the current git tag when checked from
 *      a tag context).
 *   2. The npm dist-tag derived from the shared version (`beta`, `rc`,
 *      `alpha`, or `latest`).
 *   3. An idempotent publish plan that checks npm for each package + version
 *      and reports whether a fresh publish is needed.
 *
 * Used by both `packages/cli` release scripts (humans) and
 * `.github/workflows/publish.yml` (CI) so the rules cannot drift.
 * npm-tag, publish-plan and verify-npm require the approved repository
 * context. Generic version/pack checks remain usable locally in forks.
 *
 * Commands:
 *   check-versions [--require-tag]   Verify core/cli (and optional GITHUB_REF
 *                                    tag) all agree on the exact version.
 *   npm-tag                          Print the computed npm dist-tag.
 *   publish-plan [--json|--github]   Decide which packages still need a
 *                                    publish. Idempotent: if a package
 *                                    version already exists on npm it is
 *                                    skipped (but version mismatches still
 *                                    fail loudly).
 *   verify-packed-cli                Pack the CLI and assert its dependency
 *                                    on @mindfoldhq/trellis-core resolves
 *                                    to the exact shared version (not
 *                                    "workspace:*" or a loose range).
 *   verify-npm [--package all|core|cli]
 *                                    Verify the published package version and
 *                                    dist-tag are visible on the public npm
 *                                    registry. Used after CI publish so a
 *                                    registry visibility problem fails the
 *                                    release pipeline instead of being fixed
 *                                    by a local publish.
 *
 * Idempotency rule: a CI rerun on the same tag must not republish an
 * already-published version, but must also never silently paper over a
 * version/tag mismatch. Version equality is checked first; npm existence
 * decides per-package skip.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CORE_PKG = path.join(REPO_ROOT, "packages/core/package.json");
const CLI_PKG = path.join(REPO_ROOT, "packages/cli/package.json");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readVersions() {
  const core = readJSON(CORE_PKG);
  const cli = readJSON(CLI_PKG);
  return {
    coreName: core.name,
    coreVersion: core.version,
    cliName: cli.name,
    cliVersion: cli.version,
  };
}

export function tagVersionFromEnv(env = process.env) {
  // GITHUB_REF for `push: tags: v*` looks like `refs/tags/v0.6.0-beta.12`.
  // GITHUB_REF_NAME on `release.published` is the tag name.
  const ref = env.GITHUB_REF_NAME || env.GITHUB_REF || "";
  const m = ref.match(
    /^(?:refs\/tags\/)?v(\d+\.\d+\.\d+(?:-[A-Za-z0-9.+-]+)?)$/,
  );
  return m && m[0] === ref ? m[1] : null;
}

export function computeNpmTag(version) {
  const match = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/,
  );
  if (!match || match[0] !== version)
    throw new Error(`Unsupported npm release version or track: ${version}`);
  return match[4] || "latest";
}

export function assertPublicationRepository(env = process.env) {
  if (env.GITHUB_REPOSITORY !== "mindfold-ai/trellis") {
    throw new Error(
      "npm publication requires GITHUB_REPOSITORY=mindfold-ai/trellis; missing or unapproved repository context.",
    );
  }
}

export function npmVersionExists(pkgName, version) {
  try {
    const out = execSync(
      `npm view ${pkgName}@${version} version --json --registry=https://registry.npmjs.org/`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 },
    ).trim();
    if (!out) return false;
    // npm returns the literal version string for an exact-version match,
    // and an empty body for unknown versions.
    return JSON.parse(out) === version;
  } catch (err) {
    const stderr = err.stderr?.toString() ?? "";
    if (stderr.includes("E404") || stderr.includes("not found")) return false;
    // Any other npm failure (network, auth) should surface; don't pretend
    // the version doesn't exist, because that would trigger a republish.
    throw err;
  }
}

function npmViewJSON(args) {
  const out = execSync(
    `npm view ${args} --json --registry=https://registry.npmjs.org/`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 },
  ).trim();
  return out ? JSON.parse(out) : null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(label, fn) {
  const attempts = 6;
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      if (i === attempts) break;
      console.error(
        `${YELLOW}! ${label} not visible yet; retrying (${i}/${attempts})${RESET}`,
      );
      await sleep(10_000);
    }
  }
  throw lastError;
}

function fail(msg) {
  console.error(`${RED}x ${msg}${RESET}`);
  process.exit(1);
}

function checkVersions({ requireTag, quiet = false }) {
  const v = readVersions();
  if (v.coreVersion !== v.cliVersion) {
    fail(
      `Version mismatch:\n` +
        `  ${v.coreName}: ${v.coreVersion}\n` +
        `  ${v.cliName}:  ${v.cliVersion}\n` +
        `Both packages must share the exact same version. Re-run the release\n` +
        `bump script so they move together.`,
    );
  }
  const tagVersion = tagVersionFromEnv();
  if (requireTag) {
    if (!tagVersion) {
      fail(
        `Expected a git tag like v${v.cliVersion} via GITHUB_REF / GITHUB_REF_NAME but found "${
          process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || ""
        }".`,
      );
    }
    if (tagVersion !== v.cliVersion) {
      fail(
        `Git tag version (${tagVersion}) does not match package version (${v.cliVersion}).\n` +
          `Refusing to publish: the tag, core package, and CLI package must agree.`,
      );
    }
  } else if (tagVersion && tagVersion !== v.cliVersion) {
    fail(
      `Git tag version (${tagVersion}) does not match package version (${v.cliVersion}).`,
    );
  }
  if (!quiet) {
    console.log(
      `${GREEN}ok${RESET} versions match: ${v.coreName}@${v.coreVersion} = ${v.cliName}@${v.cliVersion}` +
        (tagVersion ? ` = git tag v${tagVersion}` : ""),
    );
  }
  return { ...v, tagVersion };
}

function publishPlan({ output }) {
  assertPublicationRepository();
  const v = checkVersions({ requireTag: true, quiet: output === "json" });
  const tag = computeNpmTag(v.cliVersion);
  const coreExists = npmVersionExists(v.coreName, v.coreVersion);
  const cliExists = npmVersionExists(v.cliName, v.cliVersion);
  const plan = {
    version: v.cliVersion,
    tag,
    core: { name: v.coreName, publish: !coreExists, alreadyOnNpm: coreExists },
    cli: { name: v.cliName, publish: !cliExists, alreadyOnNpm: cliExists },
  };
  if (output === "json") {
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    return plan;
  }
  if (output === "github") {
    const gh = process.env.GITHUB_OUTPUT;
    if (!gh) fail(`--github requested but GITHUB_OUTPUT is not set.`);
    fs.appendFileSync(
      gh,
      [
        `version=${plan.version}`,
        `tag=${plan.tag}`,
        `core_publish=${plan.core.publish}`,
        `cli_publish=${plan.cli.publish}`,
        `core_already_on_npm=${plan.core.alreadyOnNpm}`,
        `cli_already_on_npm=${plan.cli.alreadyOnNpm}`,
      ].join("\n") + "\n",
    );
  }
  const status = (pkg) =>
    pkg.publish
      ? `${GREEN}publish${RESET}`
      : `${YELLOW}skip (already on npm)${RESET}`;
  console.log(
    `${DIM}plan for v${plan.version} -> npm tag "${plan.tag}":${RESET}\n` +
      `  ${plan.core.name}@${plan.version}: ${status(plan.core)}\n` +
      `  ${plan.cli.name}@${plan.version}:  ${status(plan.cli)}`,
  );
  return plan;
}

function verifyPackedCli() {
  const v = checkVersions({ requireTag: false });
  const tmp = fs.mkdtempSync(path.join(REPO_ROOT, ".pack-verify-"));
  let packed;
  try {
    const out = execSync(`pnpm pack --pack-destination ${tmp}`, {
      cwd: path.join(REPO_ROOT, "packages/cli"),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    // pnpm prints the resulting tarball path on its last non-empty line.
    const last = out.trim().split("\n").filter(Boolean).pop() || "";
    packed = last.startsWith("/") ? last : path.join(tmp, last);
    if (!fs.existsSync(packed)) {
      // Fall back to scanning the tmp dir.
      const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
      if (!tgz) fail(`pnpm pack did not produce a tarball in ${tmp}`);
      packed = path.join(tmp, tgz);
    }
    const extractDir = path.join(tmp, "extract");
    fs.mkdirSync(extractDir);
    execSync(`tar -xzf ${packed} -C ${extractDir} package/package.json`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const packedPkg = readJSON(path.join(extractDir, "package/package.json"));
    const dep = packedPkg.dependencies?.["@mindfoldhq/trellis-core"];
    if (!dep) {
      fail(`packed CLI is missing dependency on @mindfoldhq/trellis-core.`);
    }
    if (dep !== v.cliVersion) {
      fail(
        `packed CLI depends on @mindfoldhq/trellis-core@"${dep}" but expected exact "${v.cliVersion}".\n` +
          `pnpm should rewrite workspace:* to the exact published version; got "${dep}" instead.`,
      );
    }
    console.log(
      `${GREEN}ok${RESET} packed CLI pins @mindfoldhq/trellis-core to exact ${v.cliVersion}.`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function verifyNpm({ packageFilter }) {
  assertPublicationRepository();
  const v = checkVersions({ requireTag: false });
  const tag = computeNpmTag(v.cliVersion);
  const packages = [
    { key: "core", name: v.coreName },
    { key: "cli", name: v.cliName },
  ].filter((pkg) => packageFilter === "all" || pkg.key === packageFilter);

  for (const pkg of packages) {
    await retry(`${pkg.name}@${v.cliVersion}`, () => {
      const version = npmViewJSON(`${pkg.name}@${v.cliVersion} version`);
      if (version !== v.cliVersion) {
        fail(
          `${pkg.name}@${v.cliVersion} is not visible on the public npm registry.`,
        );
      }
      const taggedVersion = npmViewJSON(`${pkg.name}@${tag} version`);
      if (taggedVersion !== v.cliVersion) {
        fail(
          `${pkg.name}@${tag} resolves to ${taggedVersion ?? "nothing"}, expected ${v.cliVersion}.`,
        );
      }
      console.log(
        `${GREEN}ok${RESET} ${pkg.name}@${v.cliVersion} visible on npm tag "${tag}".`,
      );
    });
  }
}

export async function main(args = process.argv.slice(2)) {
  const [cmd, ...rest] = args;
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(
      `release-preflight <command>\n\n` +
        `commands:\n` +
        `  check-versions [--require-tag]\n` +
        `  npm-tag\n` +
        `  publish-plan [--json|--github]\n` +
        `  verify-packed-cli\n` +
        `  verify-npm [--package all|core|cli]\n`,
    );
    return;
  }
  if (cmd === "check-versions") {
    checkVersions({ requireTag: rest.includes("--require-tag") });
    return;
  }
  if (cmd === "npm-tag") {
    assertPublicationRepository();
    const v = readVersions();
    process.stdout.write(computeNpmTag(v.cliVersion) + "\n");
    return;
  }
  if (cmd === "publish-plan") {
    const output = rest.includes("--json")
      ? "json"
      : rest.includes("--github")
        ? "github"
        : "text";
    publishPlan({ output });
    return;
  }
  if (cmd === "verify-packed-cli") {
    verifyPackedCli();
    return;
  }
  if (cmd === "verify-npm") {
    const packageIndex = rest.indexOf("--package");
    const packageArg = packageIndex >= 0 ? rest[packageIndex + 1] : "all";
    if (!["all", "core", "cli"].includes(packageArg)) {
      fail(`--package must be one of: all, core, cli`);
    }
    await verifyNpm({ packageFilter: packageArg });
    return;
  }
  fail(`unknown command: ${cmd}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => fail(err.message));
}
