/**
 * Hook templates for Multi-Agent Pipeline
 *
 * Hooks inject context into subagent prompts automatically.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read a hook template
 */
function readHook(filename: string): string {
  const filePath = join(__dirname, filename);
  return readFileSync(filePath, "utf-8");
}

// Hook templates
export const injectSubagentContextHook: string = readHook(
  "inject-subagent-context.py",
);
export const settingsTemplate: string = readHook("settings.json");

/**
 * Hook template definition
 */
export interface HookTemplate {
  /** Hook filename */
  name: string;
  /** Template content */
  content: string;
  /** Human-readable description */
  description: string;
  /** Target path relative to .claude/ */
  targetPath: string;
}

/**
 * All available hook templates
 */
const ALL_HOOKS: HookTemplate[] = [
  {
    name: "inject-subagent-context.py",
    content: injectSubagentContextHook,
    description: "Injects context into subagent prompts based on feature config",
    targetPath: "hooks/inject-subagent-context.py",
  },
];

/**
 * Settings template for hooks
 */
export const SETTINGS_TEMPLATE: HookTemplate = {
  name: "settings.json",
  content: settingsTemplate,
  description: "Claude Code settings with hook configuration",
  targetPath: "settings.json",
};

/**
 * Get all hook templates
 */
export function getAllHooks(): HookTemplate[] {
  return ALL_HOOKS;
}

/**
 * Get settings template
 */
export function getSettingsTemplate(): HookTemplate {
  return SETTINGS_TEMPLATE;
}
