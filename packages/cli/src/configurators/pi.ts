import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  applyPullBasedPreludeMarkdown,
  collectSkillTemplates,
  replacePythonCommandLiterals,
  resolveCommands,
  resolveBundledSkills,
  resolvePlaceholders,
  resolveSkills,
  writeAgents,
  writeSkills,
} from "./shared.js";
import {
  getAllAgents,
  getExtensionTemplate,
  getSettingsTemplate,
} from "../templates/pi/index.js";

export function collectPiTemplates(): Map<string, string> {
  const config = AI_TOOLS.pi;
  const ctx = config.templateContext;
  const files = new Map<string, string>();

  for (const command of resolveCommands(ctx)) {
    files.set(`.pi/prompts/trellis-${command.name}.md`, command.content);
  }

  // Pi can discover `.agents/skills`, but Trellis common skills still render
  // platform-specific command refs. Keep a Pi-owned skill root until shared
  // Agent Skill text is platform-neutral.
  for (const [filePath, content] of collectSkillTemplates(
    ".pi/skills",
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  )) {
    files.set(filePath, content);
  }

  for (const agent of applyPullBasedPreludeMarkdown(getAllAgents())) {
    files.set(`.pi/agents/${agent.name}.md`, agent.content);
  }

  files.set(".pi/extensions/trellis/index.ts", getExtensionTemplate());

  const settings = getSettingsTemplate();
  files.set(
    `.pi/${settings.targetPath}`,
    resolvePlaceholders(settings.content),
  );

  return files;
}

export async function configurePi(cwd: string): Promise<void> {
  const config = AI_TOOLS.pi;
  const ctx = config.templateContext;
  const configRoot = path.join(cwd, config.configDir);

  ensureDir(path.join(configRoot, "prompts"));
  for (const command of resolveCommands(ctx)) {
    await writeFile(
      path.join(configRoot, "prompts", `trellis-${command.name}.md`),
      command.content,
    );
  }

  // See collectPiTemplates(): this intentionally stays under `.pi/skills`
  // until the shared `.agents/skills` rendering is safe for Pi.
  await writeSkills(
    path.join(configRoot, "skills"),
    resolveSkills(ctx),
    resolveBundledSkills(ctx),
  );
  await writeAgents(
    path.join(configRoot, "agents"),
    applyPullBasedPreludeMarkdown(getAllAgents()),
  );

  ensureDir(path.join(configRoot, "extensions", "trellis"));
  await writeFile(
    path.join(configRoot, "extensions", "trellis", "index.ts"),
    replacePythonCommandLiterals(getExtensionTemplate()),
  );

  const settings = getSettingsTemplate();
  await writeFile(
    path.join(configRoot, settings.targetPath),
    resolvePlaceholders(settings.content),
  );
}
