import path from "node:path";
import { AI_TOOLS } from "../types/ai-tools.js";
import {
  getAllAgents,
  getAllCodexSkills,
  getAllHooks,
  getConfigTemplate,
  getHooksConfig,
} from "../templates/codex/index.js";
import { ensureDir, writeFile } from "../utils/file-writer.js";
import {
  resolvePlaceholders,
  resolveAllAsSkills,
  resolveBundledSkills,
  applyPullBasedPreludeToml,
  writeSkills,
  writeSharedHooks,
  replacePythonCommandLiterals,
} from "./shared.js";

/**
 * Configure Codex by writing:
 * - .agents/skills/ — shared skills from common source
 * - .codex/skills/ — Codex-specific skills (platform-specific templates)
 * - .codex/agents/, hooks/, hooks.json, config.toml — platform-specific
 */
export async function configureCodex(cwd: string): Promise<void> {
  // Shared skills from common source → .agents/skills/
  const sharedSkillsRoot = path.join(cwd, ".agents", "skills");
  await writeSkills(
    sharedSkillsRoot,
    resolveAllAsSkills(AI_TOOLS.codex.templateContext),
    resolveBundledSkills(AI_TOOLS.codex.templateContext),
  );

  const codexRoot = path.join(cwd, ".codex");

  // Codex-specific skills (platform-specific) → .codex/skills/
  const codexSkillsRoot = path.join(codexRoot, "skills");
  ensureDir(codexSkillsRoot);

  for (const skill of getAllCodexSkills()) {
    const skillDir = path.join(codexSkillsRoot, skill.name);
    ensureDir(skillDir);
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      replacePythonCommandLiterals(skill.content),
    );
  }

  // Custom agents → .codex/agents/
  const codexAgentsRoot = path.join(codexRoot, "agents");
  ensureDir(codexAgentsRoot);

  // Codex is a class-2 (pull-based) platform: PreToolUse only fires for Bash
  // and CollabAgentSpawn hook is not implemented (#15486). Sub-agents must
  // load Trellis context themselves via the prelude injected here.
  for (const agent of applyPullBasedPreludeToml(getAllAgents())) {
    await writeFile(
      path.join(codexAgentsRoot, `${agent.name}.toml`),
      replacePythonCommandLiterals(agent.content),
    );
  }

  // Hooks → .codex/hooks/
  const hooksDir = path.join(codexRoot, "hooks");
  ensureDir(hooksDir);

  // Codex-specific hooks (e.g., session-start.py tailored for Codex)
  for (const hook of getAllHooks()) {
    await writeFile(
      path.join(hooksDir, hook.name),
      replacePythonCommandLiterals(hook.content),
    );
  }

  // Shared hooks (inject-workflow-state.py only). Codex bundles its own
  // session-start.py above; sub-agent context is pull-based (class-2).
  await writeSharedHooks(hooksDir, "codex");

  // Hooks config → .codex/hooks.json
  await writeFile(
    path.join(codexRoot, "hooks.json"),
    resolvePlaceholders(getHooksConfig()),
  );

  // NOTE: Codex hooks require `features.codex_hooks = true` in the user's
  // ~/.codex/config.toml. Without this flag the hooks.json is ignored and
  // inject-workflow-state.py will never fire. This prerequisite is documented
  // in spec/cli/backend/platform-integration.md.
  if (!process.env.VITEST && !process.env.TRELLIS_QUIET) {
    process.stderr.write(
      "⚠️  Codex hooks require `features.codex_hooks = true` in your " +
        "~/.codex/config.toml. Without it the Trellis workflow breadcrumb " +
        "won't fire. See Trellis docs for details.\n",
    );
  }

  // Config → .codex/config.toml
  const config = getConfigTemplate();
  await writeFile(
    path.join(codexRoot, config.targetPath),
    replacePythonCommandLiterals(config.content),
  );
}
