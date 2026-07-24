/**
 * Shared utilities for platform template modules.
 * Eliminates boilerplate across qoder/, codebuddy/, droid/, cursor/, gemini/, kiro/ index.ts files.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AgentTemplate {
  name: string;
  content: string;
}

export interface HookTemplate {
  targetPath: string;
  content: string;
}

export interface TemplateReader {
  readTemplate: (relativePath: string) => string;
  listFiles: (dir: string) => string[];
  listMdAgents: (dir?: string) => AgentTemplate[];
  listJsonAgents: (dir?: string) => AgentTemplate[];
  getSettings: (filename?: string) => HookTemplate;
  getConfig: (filename: string) => string;
}

/**
 * Create a template reader bound to the caller's directory.
 * Usage: `const { readTemplate, listMdAgents, getSettings } = createTemplateReader(import.meta.url);`
 */
export function createTemplateReader(importMetaUrl: string): TemplateReader {
  const __dirname = dirname(fileURLToPath(importMetaUrl));

  function readTemplate(relativePath: string): string {
    return readFileSync(join(__dirname, relativePath), "utf-8");
  }

  function listFiles(dir: string): string[] {
    try {
      // Only regular files — skip dirs like __pycache__ that break readTemplate.
      return readdirSync(join(__dirname, dir), { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  /** Read all .md agent files from a subdirectory */
  function listMdAgents(dir = "agents"): AgentTemplate[] {
    return listFiles(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        name: f.replace(".md", ""),
        content: readTemplate(`${dir}/${f}`),
      }));
  }

  /** Read all .json agent files from a subdirectory (Kiro) */
  function listJsonAgents(dir = "agents"): AgentTemplate[] {
    return listFiles(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f.replace(".json", ""),
        content: readTemplate(`${dir}/${f}`),
      }));
  }

  /** Read settings.json and return as HookTemplate */
  function getSettings(filename = "settings.json"): HookTemplate {
    return { targetPath: filename, content: readTemplate(filename) };
  }

  /** Read a config file and return raw string */
  function getConfig(filename: string): string {
    return readTemplate(filename);
  }

  return {
    readTemplate,
    listFiles,
    listMdAgents,
    listJsonAgents,
    getSettings,
    getConfig,
  };
}
