# What we can actually support, per platform

Triage of the matrix in `platform-session-identity.md` into shippable work.
Gemini is deprioritized per product call (no real usage) — it stays in the
correctness cleanup but gets no dedicated work.

Sorted by cost. Tier 1 needs no fix, Tier 4 needs a vendor.

---

## Tier 1 — already works. Only the lie needs removing. (6 platforms)

| Platform | Why it works | Action |
|---|---|---|
| **Claude Code** | `CLAUDE_CODE_SESSION_ID` is real (undocumented). Verified in this session. | Drop the invented `CLAUDE_SESSION_ID`; comment that the survivor is undocumented + date verified. |
| **Codex** | `CODEX_THREAD_ID` is real (undocumented), injected into shell children. | Drop `CODEX_SESSION_ID`. Same comment. |
| **Cursor (CLI)** | `CURSOR_CONVERSATION_ID` is real in `cursor-agent`. | Drop `CURSOR_SESSION_ID`. **IDE remains unverified** — do not claim IDE support. |
| **Snow** | Vendor exports `TRELLIS_CONTEXT_ID` itself and names Trellis in source. | Nothing. Use as the reference contract when asking other vendors. |
| **Pi** | Extension prefixes the command with `export TRELLIS_CONTEXT_ID=…`. Correct — Pi's bash schema has no `env` field, so this is the only channel. | Drop the invented `PI_SESSION_ID`/`PI_SESSIONID`. |
| **OMP** | Extension sets `input.env`; `env` is a real schema field and the object is not cloned, so it reaches the child. | Harden to the documented return form (see below), then nothing. |

**Zero user-visible change.** This tier is purely about the table no longer
claiming things that are false.

### OMP hardening detail

In-place mutation of `event.input` works today only because nothing clones the
object for non-`edit` tools. The documented contract is to **return**
`{ input: … }`. Switching is cheap insurance against a future OMP normalization
step, but it is **not a pure no-op**: `wrapper.ts:259` derives `xdevBypass` from
`effectiveParams === params`, which stays true under in-place mutation and turns
false when a new input object is returned. Needs a deliberate decision, not a
mechanical swap.

---

## Tier 2 — cheap real fix, ship now (2 platforms)

### OpenCode — the best available win

OpenCode has a **`shell.env`** plugin hook, documented as "inject environment
variables into all shell execution (AI tools and user terminals)". Its input
already carries `sessionID`:

```js
plugin.trigger("shell.env", { cwd, sessionID, callID }, { env: {} })
// child env = { ...process.env, ...extra.env }
```

We already ship three OpenCode plugins (`session-start.js`,
`inject-workflow-state.js`, `inject-subagent-context.js`) with the plugin
scaffold and `package.json` in place. Adding a `shell.env` handler that sets
`TRELLIS_CONTEXT_ID = "opencode-" + input.sessionID` is a handful of lines in
existing infrastructure.

This converts OpenCode from **broken-and-lying** (all three declared env vars are
invented; the code reads `undefined`) to **fully working**, with no vendor
dependency and no design debate.

**Recommend doing this first.**

### Kilo CLI — same code, verify it's worth it

Kilo vendors OpenCode wholesale, `shell.env` included byte-identical. The same
plugin would work. But Kilo is registered `agentCapable: false` / `hasHooks:
false` in `AI_TOOLS`, i.e. we treat it as inline — so there may be no session
state to carry in the first place. **Confirm the product intent before doing the
work**; if Kilo is being upgraded to hook-backed anyway (see Tier 3 reclass), do
it then.

---

## Tier 3 — needs one shared mechanism; no per-platform channel exists (12 platforms)

CodeBuddy, Trae, Qoder, Copilot, Droid, Kiro, Grok, Kimi, Reasonix, Devin,
Antigravity, ZCode.

All of these give a session id on **hook stdin** and nothing to the bash child.
There is no per-platform fix to write — twelve patches would be twelve
workarounds for the same missing link. One mechanism covers all of them.

### The mechanism, and it is verified

Hooks and bash-tool commands are both children of the same agent process. A
SessionStart / UserPromptSubmit hook can record `{context_key, agent_pid,
start_time}`, and `task.py` in the bash child walks its ancestry to find the
match.

Verified empirically in this Claude Code session: the bash child's **direct
parent** is the agent process (`pid 90863`, `comm=claude`), matching
`CLAUDE_PID`. One hop, no heuristic. Grok independently ships exactly this shape
in `~/.grok/active_sessions.json` (`session_id` → `pid` → `cwd`), which is
corroboration that the approach is sound.

Why this beats the alternative I sketched earlier ("pre-create the session file
and lean on the single-session fallback"): the fallback refuses to act when ≥2
session files exist, so pre-creating files makes concurrent windows degrade to
"no active task". Ancestry matching stays correct with any number of concurrent
sessions, which is the property 0.6.12's isolation work exists to protect.

### Risks that must be designed for, not discovered later

- **pid reuse.** Match on `(pid, process start time)`, never pid alone. Grok's
  own file already shows the failure — two session ids observed sharing one pid.
- **Windows.** No `ps`. Needs `wmic` / PowerShell / `psutil`, and Trellis
  deliberately avoids native deps ([native dependency strategy]). This is the
  main portability risk and should be scoped before committing.
- **Non-child execution.** Any platform that runs the bash tool through a daemon,
  a container, or SSH (Snow supports `ssh://` working dirs) breaks ancestry.
  Needs a fallback, and `TRELLIS_CONTEXT_ID` remains that fallback.
- **Depth.** One hop here, but platforms wrapping commands in an intermediate
  shell will need a bounded walk.

### Per-platform extras worth folding in

- **Trae** — `TRAE_ENV_FILE` is handed to SessionStart hooks as a path to write
  env vars into for downstream processes. Claude Code exposes `CLAUDE_ENV_FILE`
  the same way (present in this session). This is the only *vendor-sanctioned*
  carry-forward mechanism found anywhere. **Worth one probe** — if it reaches
  terminal-tool children, it is cleaner than ancestry walking and might
  generalize to every Claude-Code-compatible platform, which is most of Tier 3.
- **Kiro** — `KIRO_SESSION_ID` may simply work; three independent third-party
  projects rely on it. A single probe on a machine with Kiro resolves it and
  could move Kiro to Tier 1 for free.
- **Grok** — `~/.grok/active_sessions.json` already has the pid map. Usable as a
  shortcut, but undocumented and pid-ambiguous; prefer the shared mechanism.
- **Qoder** — `QODER_SESSION_ID` is real for the IDE plugin's hook processes.
  Scope the lookup to hooks; it does not help the terminal.

---

## Tier 4 — blocked on the vendor (1 platform)

**ZCode.** Closed source, not installable here, and the one declared name
(`CLAUDE_SESSION_ID`) is invented even on Claude Code — with no second candidate
to fall back on. Its hook docs publish only `ZCODE_PLUGIN_*`. Separately,
`ZCODE_PROJECT_DIR` — which `templates/zcode/config.json` already depends on —
does not appear in those docs either.

The Tier 3 mechanism would cover ZCode too, since its hooks do receive
`session_id`. Until then, ZCode users need `TRELLIS_CONTEXT_ID` set by hand.

---

## Separate finding: 7 platforms are misclassified as hookless

OpenCode, Kilo, Grok, Kimi, Reasonix, Devin, Antigravity **all ship lifecycle
hooks**, and four accept Claude-Code-shaped hook configs so existing hook code
largely ports. This is unrelated to session identity and is probably the more
valuable finding — it is a platform-capability upgrade, not a bug fix. Should be
its own task, not folded into this one.

---

## Recommended order

1. **OpenCode `shell.env` plugin** — real fix, existing infrastructure, no design debate.
2. **Purge the 9 invented names; scope the 3 hook-only ones to hooks.** No behavior change, stops the table lying. Unblocks honest per-platform status reporting.
3. **Three probes** — Kiro's `KIRO_SESSION_ID`, Trae/Claude `*_ENV_FILE` reach, Cursor IDE. Each is small and each could move a platform up a tier. The `ENV_FILE` one has the highest leverage.
4. **Design the shared ancestry mechanism** for Tier 3, with Windows scoped up front. Largest piece; do it after 3 so the probes can shrink its scope.
5. **Ask #517's reporter for a version** before any OMP work.
6. **Reclassify the 7 hookless platforms** — separate task.

Documentation-wise, `TRELLIS_CONTEXT_ID` should be documented as the supported
escape hatch now, regardless of the above. It works everywhere and is what to
tell affected users today.
