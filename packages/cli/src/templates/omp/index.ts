import { createTemplateReader } from "../template-utils.js";
import type { AgentTemplate } from "../template-utils.js";

const { listMdAgents, readTemplate } = createTemplateReader(import.meta.url);

export function getAllAgents(): AgentTemplate[] {
  return listMdAgents();
}

export function getExtensionTemplate(): string {
  return readTemplate("extensions/trellis/index.ts.txt");
}
