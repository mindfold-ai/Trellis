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
  resolveAllAsSkillsNeutral,
  resolveBundledSkills,
  resolveCodexTrellisStartSkill,
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
  // Uses the neutral placeholder resolver so the 5 shared workflow skills
  // (brainstorm, before-dev, check, break-loop, update-spec) render to the
  // same bytes regardless of which platform writes them — required because
  // Gemini CLI 0.40+ also targets `.agents/skills/` (last-writer-wins is
  // safe when both writers produce identical output).
  const sharedSkillsRoot = path.join(cwd, ".agents", "skills");
  await writeSkills(
    sharedSkillsRoot,
    resolveAllAsSkillsNeutral(AI_TOOLS.codex.templateContext),
    resolveBundledSkills(AI_TOOLS.codex.templateContext),
  );

  // Additionally write `trellis-start` to .agents/skills/ — Codex-specific.
  // The SessionStart hook was removed in 0.5.5 (de-recursion); inject-workflow-state.py
  // injects a `<trellis-bootstrap>` block on no_task turns instructing the AI to
  // invoke `$trellis-start` to load workflow context. Without this skill, that
  // invocation has nothing to resolve. Other agent-capable platforms keep their
  // working SessionStart hooks and don't need this.
  // Must stay in sync with `collectPlatformTemplates.codex.collectTemplates`
  // (configurators/index.ts) — both share `resolveCodexTrellisStartSkill`.
  const trellisStart = resolveCodexTrellisStartSkill(
    AI_TOOLS.codex.templateContext,
  );
  if (trellisStart) {
    const trellisStartDir = path.join(sharedSkillsRoot, trellisStart.name);
    ensureDir(trellisStartDir);
    await writeFile(
      path.join(trellisStartDir, "SKILL.md"),
      trellisStart.content,
    );
  }

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

  // NOTE: Codex hooks require `features.hooks = true` in the user's
  // ~/.codex/config.toml (Codex 0.129+). The legacy `features.codex_hooks = true`
  // still works on 0.129+ but emits a deprecation warning; pre-0.129 only
  // accepts `codex_hooks`. Without this flag the hooks.json is ignored and
  // inject-workflow-state.py will never fire. Codex 0.129+ also gates each
  // installed hook behind a one-time `/hooks` review — until the user approves
  // it the workflow breadcrumb won't auto-inject (the trellis-bootstrap
  // fallback in inject-workflow-state.py covers this case). Documented in
  // spec/cli/backend/platform-integration.md.
  if (!process.env.VITEST && !process.env.TRELLIS_QUIET) {
    process.stderr.write(
      "⚠️  Codex hooks require `features.hooks = true` in your " +
        "~/.codex/config.toml (Codex 0.129+; older versions: `codex_hooks = true`). " +
        "On Codex 0.129+ also run `/hooks` once to approve the Trellis " +
        "UserPromptSubmit hook. Without these the Trellis workflow breadcrumb " +
        "won't auto-inject. See Trellis docs for details.\n",
    );
  }

  // Config → .codex/config.toml
  const config = getConfigTemplate();
  await writeFile(
    path.join(codexRoot, config.targetPath),
    replacePythonCommandLiterals(config.content),
  );
}
