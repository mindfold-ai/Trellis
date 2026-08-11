import {
  createTemplateReader,
  type AgentTemplate,
  type HookTemplate,
} from "../template-utils.js";

const { listMdAgents, getSettings, readTemplate } = createTemplateReader(
  import.meta.url,
);

export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}

export function getSettingsTemplate(): HookTemplate {
  return getSettings();
}

export function getExtensionTemplate(): string {
  return readTemplate("extensions/trellis/index.ts.txt");
}

export function getContextTelemetryTemplate(): string {
  return readTemplate("extensions/context-telemetry/index.ts.txt");
}
