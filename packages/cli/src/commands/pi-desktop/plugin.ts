import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  PI_DESKTOP_PLUGIN_DIR,
  PI_DESKTOP_PLUGIN_ID,
} from "../../constants/pi-desktop.js";
import { readJsonFile } from "./store.js";

export interface PluginManifest {
  schemaVersion: number;
  id: string;
  name?: string;
  version?: string;
  main: string;
  permissions?: string[];
  contributes?: { agentExtensions?: string[] };
}

/** Same rule the host applies to `manifest.id`. */
export const PLUGIN_ID_RE = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/;

export function pluginDir(repoRoot: string): string {
  return path.join(repoRoot, ...PI_DESKTOP_PLUGIN_DIR.split("/"));
}

function resolveInside(baseDir: string, relativePath: string): string {
  const resolved = path.resolve(baseDir, relativePath);
  const rel = path.relative(baseDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(
      `PI-Desktop plugin path escapes the plugin directory: ${relativePath}`,
    );
  }
  return resolved;
}

/**
 * Validate the generated plugin the way the host's manifest check will:
 * schema version, id shape, the declared entry points, and the permission the
 * agent extension needs. Every failure names the fix, because the usual cause
 * is "this repo was configured before `--pi-desktop` existed".
 */
export function validatePlugin(repoRoot: string): PluginManifest {
  const dir = pluginDir(repoRoot);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No PI-Desktop plugin found at ${PI_DESKTOP_PLUGIN_DIR}/manifest.json. ` +
        "Run `trellis init --pi-desktop` (or `trellis update` when the platform " +
        "is already configured) and retry.",
    );
  }

  const read = readJsonFile<PluginManifest>(manifestPath);
  if (read.parseError) {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json is not valid JSON: ${read.parseError}`,
    );
  }
  const manifest = read.value;
  if (!manifest || typeof manifest !== "object") {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json must be a JSON object.`,
    );
  }

  if (manifest.schemaVersion !== 1) {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json must declare "schemaVersion": 1 (found ${String(
        manifest.schemaVersion,
      )}). Run \`trellis update\` to regenerate it.`,
    );
  }
  if (typeof manifest.id !== "string" || !PLUGIN_ID_RE.test(manifest.id)) {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json has an invalid id (${String(
        manifest.id,
      )}); the host requires ${PLUGIN_ID_RE}.`,
    );
  }
  if (manifest.id !== PI_DESKTOP_PLUGIN_ID) {
    throw new Error(
      `Expected plugin id ${PI_DESKTOP_PLUGIN_ID}, found ${manifest.id}. ` +
        "Trellis only installs the plugin it generated.",
    );
  }

  const permissions = Array.isArray(manifest.permissions)
    ? manifest.permissions
    : [];
  if (!permissions.includes("agent.extension")) {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json must request the "agent.extension" permission; ` +
        "without it the host never loads Trellis's agent extension.",
    );
  }

  const main = typeof manifest.main === "string" ? manifest.main : "";
  if (!main || !fs.existsSync(resolveInside(dir, main))) {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json points at a missing "main" entry (${main || "<empty>"}).`,
    );
  }

  const extensions = manifest.contributes?.agentExtensions;
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error(
      `${PI_DESKTOP_PLUGIN_DIR}/manifest.json must list contributes.agentExtensions. ` +
        "Run `trellis update` to regenerate it.",
    );
  }
  for (const relativePath of extensions) {
    if (typeof relativePath !== "string") {
      throw new Error(
        `${PI_DESKTOP_PLUGIN_DIR}/manifest.json has a non-string agentExtensions entry.`,
      );
    }
    if (!fs.existsSync(resolveInside(dir, relativePath))) {
      throw new Error(
        `${PI_DESKTOP_PLUGIN_DIR}/manifest.json declares agentExtensions entry ` +
          `"${relativePath}", which does not exist. Run \`trellis update\`.`,
      );
    }
  }

  return manifest;
}

/** Every regular file in the plugin directory, as posix paths relative to it. */
export function listPluginFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(dir, absolute).split(path.sep).join("/"));
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return files.sort();
}

/** Content hash per plugin file, used to report drift between repo and install. */
export function hashPluginFiles(dir: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const relativePath of listPluginFiles(dir)) {
    const bytes = fs.readFileSync(path.join(dir, ...relativePath.split("/")));
    hashes.set(relativePath, createHash("sha256").update(bytes).digest("hex"));
  }
  return hashes;
}
