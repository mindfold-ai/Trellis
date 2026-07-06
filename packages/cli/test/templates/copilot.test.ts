import { describe, expect, it } from "vitest";
import {
	getAllHooks,
	getAllPrompts,
	getHooksConfig,
} from "../../src/templates/copilot/index.js";

const EXPECTED_HOOK_NAMES = ["session-start.py"];
const EMPTY_EXCEPT_PASS_RE = /except[^\n]*:\n\s*pass\s*$/m;

describe("copilot getAllHooks", () => {
	it("returns the expected hook set", () => {
		const hooks = getAllHooks();
		const names = hooks.map((hook) => hook.name);
		expect(names).toEqual(EXPECTED_HOOK_NAMES);
	});

	it("each hook has name and content", () => {
		const hooks = getAllHooks();
		for (const hook of hooks) {
			expect(hook.name.length).toBeGreaterThan(0);
			expect(hook.content.length).toBeGreaterThan(0);
		}
	});

	it("session-start.py does not emit a misleading 'Copilot ignores' systemMessage", () => {
		// Regression guard for GitHub #248: the previous Trellis hook hardcoded a
		// user-visible systemMessage claiming Copilot ignores SessionStart output.
		// Microsoft's VS Code Agent hooks docs (preview, since VS Code 1.110)
		// document additionalContext as the injection field, so neither the
		// runtime systemMessage nor the docstring should re-assert "ignores".
		const hooks = getAllHooks();
		const sessionStart = hooks.find((h) => h.name === "session-start.py");
		expect(sessionStart).toBeDefined();
		const content = sessionStart?.content ?? "";
		expect(content).not.toContain("systemMessage");
		expect(content).not.toContain("currently ignores sessionStart hook output");
		expect(content).not.toMatch(/Copilot[^\n]*ignores hook output/);
	});

	it("session-start.py documents fail-open exception suppression", () => {
		const hooks = getAllHooks();
		const sessionStart = hooks.find((h) => h.name === "session-start.py");
		expect(sessionStart).toBeDefined();
		expect(sessionStart?.content ?? "").not.toMatch(EMPTY_EXCEPT_PASS_RE);
	});
});

describe("copilot getHooksConfig", () => {
	it("returns valid JSON with SessionStart hook command", () => {
		const raw = getHooksConfig();
		const parsed = JSON.parse(raw) as {
			hooks?: {
				SessionStart?: { command?: string }[];
			};
		};

		expect(raw.length).toBeGreaterThan(0);
		expect(parsed.hooks?.SessionStart?.length).toBe(1);
		expect(parsed.hooks?.SessionStart?.[0]?.command).toContain(
			"{{PYTHON_CMD}} .github/copilot/hooks/session-start.py",
		);
	});

	it("defines SessionStart + userPromptSubmitted command hooks", () => {
		const parsed = JSON.parse(getHooksConfig()) as {
			hooks?: Record<
				string,
				{ type?: string; timeout?: number; timeoutSec?: number }[]
			>;
		};

		expect(Object.keys(parsed.hooks ?? {})).toEqual([
			"SessionStart",
			"userPromptSubmitted",
		]);
		expect(parsed.hooks?.SessionStart?.[0]?.type).toBe("command");
		expect(parsed.hooks?.SessionStart?.[0]?.timeout).toBe(30);
		expect(parsed.hooks?.userPromptSubmitted?.[0]?.type).toBe("command");
		expect(parsed.hooks?.userPromptSubmitted?.[0]?.timeoutSec).toBe(15);
	});
});

describe("copilot getAllPrompts", () => {
	it("includes start/finish-work prompts for slash commands", () => {
		const prompts = getAllPrompts();
		const names = prompts.map((p) => p.name);
		expect(names).toContain("start");
		expect(names).toContain("finish-work");
	});

	it("prompt content is non-empty", () => {
		for (const prompt of getAllPrompts()) {
			expect(prompt.content.length).toBeGreaterThan(0);
		}
	});

	it("loads prompt names from local copilot prompts directory", () => {
		const names = getAllPrompts().map((p) => p.name).sort();
		expect(names[0]).toBe("before-dev");
		expect(names).toContain("start");
		expect(names).toContain("update-spec");
	});
});
