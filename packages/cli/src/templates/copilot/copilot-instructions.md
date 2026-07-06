<!-- TRELLIS:COPILOT-GUIDANCE:START -->
# Trellis Review Guidance

When reviewing a Trellis-enabled repository:

- Treat Trellis-generated runtime and platform payloads as copied integration files in consumer repositories. Examples include `.trellis/scripts/**`, `.trellis/agents/**`, `.trellis/workflow.md`, and platform Trellis files under `.agents/**`, `.claude/**`, `.codex/**`, `.cursor/**`, `.gemini/**`, `.github/**`, `.opencode/**`, `.qoder/**`, `.codebuddy/**`, `.factory/**`, `.pi/**`, `.reasonix/**`, `.trae/**`, and `.zcode/**`.
- Do not leave line-by-line style, wording, or local refactor comments on those copied files unless the PR explicitly changes Trellis integration, the copied file is the primary subject, it leaks secrets, it has syntax or wiring breakage, or it contradicts the PR goal.
- If a Trellis-generated file needs a behavior change, leave one handoff comment asking for an upstream Trellis fix. Include the affected path, expected behavior, observed evidence or reproduction steps, and why the fix belongs upstream.
- Continue reviewing repo-owned `.trellis/spec/**`, `.trellis/tasks/**`, application code, migrations, tests, docs, and non-Trellis scripts normally.
- Group duplicate root-cause findings into one comment and point to a deterministic local check when one already covers the issue class.
<!-- TRELLIS:COPILOT-GUIDANCE:END -->
