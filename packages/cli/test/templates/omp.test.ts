import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
   getAllAgents,
   getExtensionTemplate,
} from "../../src/templates/omp/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, "../../src/templates/omp");

describe("omp templates", () => {
   it("provides the three Trellis sub-agent definitions", () => {
      const agents = getAllAgents();
      expect(agents.map((agent) => agent.name).sort()).toEqual([
         "trellis-check",
         "trellis-implement",
         "trellis-research",
      ]);
   });

   it("each agent has non-empty content and name", () => {
      for (const agent of getAllAgents()) {
         expect(agent.name.length).toBeGreaterThan(0);
         expect(agent.content.length).toBeGreaterThan(0);
      }
   });

   it("getExtensionTemplate returns a non-empty string", () => {
      const extension = getExtensionTemplate();
      expect(extension.length).toBeGreaterThan(0);
   });

   it("extension template contains key markers for OMP integration", () => {
      const extension = getExtensionTemplate();
      expect(extension).toContain("before_agent_start");
      expect(extension).toContain("input");
      expect(extension).toContain("session_start");
      expect(extension).toContain("ExtensionAPI");
   });

   it("extension template contains session context injection markers", () => {
      const extension = getExtensionTemplate();
      // R1: Session start rich injection via get_context.py
      expect(extension).toContain("buildSessionContext");
      expect(extension).toContain("trellis-session-context");
      expect(extension).toContain("get_context.py");
      expect(extension).toContain("session-context");
   });

   it("extension template contains sub-agent precision injection markers", () => {
      const extension = getExtensionTemplate();
      // R2: Sub-agent detection via PI_BLOCKED_AGENT
      expect(extension).toContain("PI_BLOCKED_AGENT");
      expect(extension).toContain("detectAgentType");
      expect(extension).toContain("trellis-implement");
      expect(extension).toContain("trellis-check");
      expect(extension).toContain("trellis-research");
      // Agent-type-specific jsonl selection
      expect(extension).toContain("implement.jsonl");
      expect(extension).toContain("check.jsonl");
   });

   it("no settings.json or Python hooks exist in the template directory", () => {
      // OMP is extension-backed: native provider auto-discovers .omp/ subdirs,
      // so no settings.json is needed and no Python hooks should be present.
      expect(fs.existsSync(path.join(templateDir, "settings.json"))).toBe(false);
      expect(fs.existsSync(path.join(templateDir, "hooks"))).toBe(false);

      // Agents must not reference Python hook scripts
      for (const agent of getAllAgents()) {
         expect(agent.content).not.toContain("inject-subagent-context.py");
      }
   });
});
