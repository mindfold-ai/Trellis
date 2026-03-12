#!/usr/bin/env node
/**
 * Create migration manifest for a new version.
 *
 * Usage:
 *   node scripts/create-manifest.js                          # interactive
 *   node scripts/create-manifest.js --breaking
 *   node scripts/create-manifest.js --version 0.3.0-rc.0
 *   node scripts/create-manifest.js -y --description "..." --changelog "..."  # non-interactive
 *   echo '{"version":"0.3.9",...}' | node scripts/create-manifest.js         # JSON via stdin
 *
 * Stdin JSON mode (auto-detected when stdin is piped, or force with --stdin):
 *   Reads a JSON object from stdin with fields: version, description, changelog
 *   (required), plus optional: breaking, recommendMigrate, migrations, notes.
 *   Best for AI/scripting — avoids shell escaping issues with multi-line text.
 *
 * Non-interactive mode (-y):
 *   When -y is passed, all values are taken from CLI flags (no prompts).
 *   --version defaults to next prerelease from package.json.
 *   --description and --changelog are required in -y mode.
 *   --notes overrides the auto-generated notes field.
 *
 * Interactive prompts will ask for:
 *   - Version (default: next prerelease from package.json)
 *   - Description
 *   - Changelog
 *   - Breaking change (y/n)
 *
 * Version suggestion logic:
 *   beta.N  → beta.(N+1)    (also shows rc.0 hint)
 *   rc.N    → rc.(N+1)      (also shows release hint)
 *   X.Y.Z   → X.Y.(Z+1)-beta.0
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFESTS_DIR = path.join(__dirname, "../src/migrations/manifests");

function readPackageVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")
  );
  return pkg.version;
}

function getNextVersion(currentVersion) {
  // beta.N → next beta
  const betaMatch = currentVersion.match(/^(\d+\.\d+\.\d+)-beta\.(\d+)$/);
  if (betaMatch) {
    const base = betaMatch[1];
    const next = parseInt(betaMatch[2], 10) + 1;
    return { suggested: `${base}-beta.${next}`, hint: `or ${base}-rc.0 to promote to RC` };
  }
  // rc.N → next rc
  const rcMatch = currentVersion.match(/^(\d+\.\d+\.\d+)-rc\.(\d+)$/);
  if (rcMatch) {
    const base = rcMatch[1];
    const next = parseInt(rcMatch[2], 10) + 1;
    return { suggested: `${base}-rc.${next}`, hint: `or ${base} to release` };
  }
  // stable X.Y.Z → next patch beta
  const stableMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (stableMatch) {
    const [, major, minor, patch] = stableMatch;
    const nextPatch = `${major}.${minor}.${parseInt(patch, 10) + 1}`;
    return { suggested: `${nextPatch}-beta.0`, hint: null };
  }
  return { suggested: currentVersion, hint: null };
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

/**
 * Unescape literal \n and \t sequences in a string.
 * When passing multi-line text via CLI flags (e.g. --changelog "line1\nline2"),
 * the shell delivers literal backslash + n characters. This function converts
 * them to real newlines so JSON.stringify produces correct \n escapes.
 */
function unescapeLiterals(str) {
  return str.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function askQuestion(rl, question, defaultValue = "") {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Read all data from stdin as a string.
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const stdinMode = args.includes("--stdin") || !process.stdin.isTTY;
  const nonInteractive = args.includes("-y");
  const isBreaking = args.includes("--breaking");
  const versionArg = getArgValue(args, "--version");
  const descriptionArg = getArgValue(args, "--description");
  const changelogArg = getArgValue(args, "--changelog");
  const notesArg = getArgValue(args, "--notes");

  const currentVersion = readPackageVersion();
  const { suggested, hint } = getNextVersion(currentVersion);

  // --- Stdin JSON mode (best for AI / scripting) ---
  if (stdinMode) {
    const input = await readStdin();
    let data;
    try {
      data = JSON.parse(input);
    } catch (e) {
      console.error("Error: --stdin expects valid JSON on stdin");
      process.exit(1);
    }
    if (!data.version || !data.description || !data.changelog) {
      console.error("Error: --stdin JSON requires version, description, and changelog fields");
      process.exit(1);
    }
    const manifestPath = path.join(MANIFESTS_DIR, `${data.version}.json`);
    const manifest = {
      version: data.version,
      description: data.description,
      breaking: data.breaking ?? false,
      recommendMigrate: data.recommendMigrate ?? (data.breaking ?? false),
      changelog: data.changelog,
      migrations: data.migrations ?? [],
      notes: data.notes ?? "No migration required.",
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`✅ Created: ${manifestPath}`);
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  // --- Non-interactive mode (-y) ---
  if (nonInteractive) {
    if (!descriptionArg || !changelogArg) {
      console.error("Error: -y mode requires --description and --changelog");
      process.exit(1);
    }
    const version = versionArg || suggested;
    const manifestPath = path.join(MANIFESTS_DIR, `${version}.json`);

    const manifest = {
      version,
      description: unescapeLiterals(descriptionArg),
      breaking: isBreaking,
      recommendMigrate: isBreaking,
      changelog: unescapeLiterals(changelogArg),
      migrations: [],
      notes: notesArg
        ? unescapeLiterals(notesArg)
        : (isBreaking
          ? "Review changelog and run with --migrate if needed."
          : "No migration required."),
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`✅ Created: ${manifestPath}`);
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  // --- Interactive mode ---
  const suggestedVersion = versionArg || suggested;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n📝 Create Migration Manifest\n");
  console.log(`Current package.json version: ${currentVersion}`);
  if (!versionArg && hint) {
    console.log(`Hint: ${hint}`);
  }
  console.log("");

  try {
    // Get version
    const version = await askQuestion(rl, "Version", suggestedVersion);

    // Check if manifest already exists
    const manifestPath = path.join(MANIFESTS_DIR, `${version}.json`);
    if (fs.existsSync(manifestPath)) {
      console.log(`\n⚠️  Manifest already exists: ${manifestPath}`);
      const overwrite = await askQuestion(rl, "Overwrite? (y/n)", "n");
      if (overwrite.toLowerCase() !== "y") {
        console.log("Cancelled.");
        rl.close();
        return;
      }
    }

    // Get description
    const description = descriptionArg || await askQuestion(rl, "Description (short)");

    // Get changelog
    const changelog = changelogArg || await askQuestion(rl, "Changelog (one line summary)");

    // Get breaking status
    let breaking = isBreaking;
    if (!isBreaking) {
      const breakingAnswer = await askQuestion(rl, "Breaking change? (y/n)", "n");
      breaking = breakingAnswer.toLowerCase() === "y";
    }

    // Get recommend migrate
    let recommendMigrate = false;
    if (breaking) {
      const migrateAnswer = await askQuestion(rl, "Recommend --migrate? (y/n)", "y");
      recommendMigrate = migrateAnswer.toLowerCase() === "y";
    }

    // Build manifest
    const manifest = {
      version,
      description,
      breaking,
      recommendMigrate,
      changelog,
      migrations: [],
      notes: notesArg || (breaking
        ? "Review changelog and run with --migrate if needed."
        : "No migration required."),
    };

    // Write manifest
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    console.log(`\n✅ Created: ${manifestPath}`);
    console.log("\nManifest content:");
    console.log(JSON.stringify(manifest, null, 2));

    // Detect release type for next steps hint
    const releaseCmd = version.includes("-beta.") ? "pnpm release:beta" : version.includes("-rc.") ? "pnpm release:rc" : "pnpm release";

    console.log("\n📋 Next steps:");
    console.log(`  1. Edit ${version}.json if needed (add migrations, migrationGuide, etc.)`);
    console.log(`  2. ${releaseCmd}`);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
