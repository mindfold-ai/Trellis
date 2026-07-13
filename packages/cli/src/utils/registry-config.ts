import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES } from "../constants/paths.js";
import { writeFileAtomic } from "./atomic-write.js";
import { toPosix } from "./posix.js";

export interface SpecRegistryConfig {
  source: string;
  template?: string;
}

function configPath(cwd: string): string {
  return path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
}

function stripYamlScalar(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function specRegistryLines(config: SpecRegistryConfig): string[] {
  const normalizedSource = toPosix(config.source);
  return [
    "  spec:",
    `    source: ${normalizedSource}`,
    ...(config.template ? [`    template: ${config.template}`] : []),
  ];
}

export function loadSpecRegistryConfig(cwd: string): SpecRegistryConfig | null {
  const filePath = configPath(cwd);
  if (!fs.existsSync(filePath)) return null;

  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  let inRegistry = false;
  let inSpec = false;
  let source: string | null = null;
  let template: string | undefined;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^registry:\s*$/.test(trimmed)) {
      inRegistry = true;
      inSpec = false;
      continue;
    }

    if (inRegistry && /^\s{2}spec:\s*$/.test(trimmed)) {
      inSpec = true;
      continue;
    }

    if (inRegistry && trimmed !== "" && !trimmed.startsWith(" ")) {
      if (source) return { source, ...(template ? { template } : {}) };
      inRegistry = false;
      inSpec = false;
      continue;
    }

    if (inSpec) {
      const sourceMatch = trimmed.match(/^\s{4}source:\s+(.+)$/);
      if (sourceMatch) {
        source = stripYamlScalar(sourceMatch[1]);
        continue;
      }
      const templateMatch = trimmed.match(/^\s{4}template:\s+(.+)$/);
      if (templateMatch) {
        template = stripYamlScalar(templateMatch[1]);
        continue;
      }
      if (trimmed !== "" && !trimmed.startsWith("    ")) {
        if (source) return { source, ...(template ? { template } : {}) };
        inSpec = false;
      }
    }
  }

  if (source) return { source, ...(template ? { template } : {}) };
  return null;
}

export function writeSpecRegistryConfig(
  cwd: string,
  config: SpecRegistryConfig,
): void {
  const filePath = configPath(cwd);
  if (!fs.existsSync(filePath)) return;

  const normalizedSource = toPosix(config.source);
  const specLines = specRegistryLines(config);
  const content = fs.readFileSync(filePath, "utf-8");
  if (/^registry:\s*$/m.test(content)) {
    const lines = content.split("\n");
    const output: string[] = [];
    let inRegistry = false;
    let inSpec = false;
    let sawSpec = false;
    let wroteSource = false;
    let wroteTemplate = false;
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (/^registry:\s*$/.test(trimmed)) {
        inRegistry = true;
        inSpec = false;
        sawSpec = false;
        wroteSource = false;
        output.push(line);
        continue;
      }
      if (inRegistry && trimmed !== "" && !trimmed.startsWith(" ")) {
        if (inSpec) {
          if (!wroteSource) output.push(`    source: ${normalizedSource}`);
          if (config.template && !wroteTemplate) {
            output.push(`    template: ${config.template}`);
          }
        } else if (!sawSpec) {
          output.push(...specLines);
        }
        inRegistry = false;
        inSpec = false;
      }
      if (inRegistry && /^\s{2}spec:\s*$/.test(trimmed)) {
        inSpec = true;
        sawSpec = true;
        wroteSource = false;
        wroteTemplate = false;
        output.push(line);
        continue;
      }
      if (inSpec && /^\s{4}source:\s+/.test(trimmed)) {
        output.push(`    source: ${normalizedSource}`);
        wroteSource = true;
        continue;
      }
      if (inSpec && /^\s{4}template:\s+/.test(trimmed)) {
        if (config.template) {
          output.push(`    template: ${config.template}`);
          wroteTemplate = true;
        }
        continue;
      }
      if (inSpec && trimmed !== "" && !trimmed.startsWith("    ")) {
        if (!wroteSource) output.push(`    source: ${normalizedSource}`);
        if (config.template && !wroteTemplate) {
          output.push(`    template: ${config.template}`);
          wroteTemplate = true;
        }
        inSpec = false;
      }
      if (inRegistry && trimmed !== "" && !trimmed.startsWith(" ")) {
        inRegistry = false;
      }
      output.push(line);
    }
    if (inRegistry) {
      if (inSpec) {
        if (!wroteSource) output.push(`    source: ${normalizedSource}`);
        if (config.template && !wroteTemplate) {
          output.push(`    template: ${config.template}`);
        }
      } else if (!sawSpec) {
        output.push(...specLines);
      }
    }
    writeFileAtomic(filePath, output.join("\n"));
    return;
  }

  const section = [
    "",
    "#-------------------------------------------------------------------------------",
    "# Registry",
    "#-------------------------------------------------------------------------------",
    "",
    "# Source used to install .trellis/spec. trellis update refreshes this",
    "# hash-tracked spec template while preserving local edits through the",
    "# normal update conflict flow.",
    "registry:",
    ...specLines,
    "",
  ].join("\n");

  writeFileAtomic(filePath, content.trimEnd() + "\n" + section);
}
