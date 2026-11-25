/**
 * PI-Desktop integration constants.
 *
 * The host owns `~/.pi-desktop/`: `plugins/registry.json` lists installed
 * plugins, `plugins/installed/<id>/` holds their files, and
 * `agent-capabilities/skills.json` records the project-scoped user skills the
 * agent may load. Trellis never touches anything else in that directory.
 */

/** Plugin id. `local.` prefix = a locally loaded plugin, not a marketplace row. */
export const PI_DESKTOP_PLUGIN_ID = "local.trellis";

/** Repository-relative directory holding the generated plugin. */
export const PI_DESKTOP_PLUGIN_DIR = ".pi-desktop/trellis";

/** Repository-relative agent-extension entry inside the plugin directory. */
export const PI_DESKTOP_EXTENSION_PATH = `${PI_DESKTOP_PLUGIN_DIR}/agent/index.ts`;

/** Host data directory name, relative to the user's home. */
export const PI_DESKTOP_DATA_DIR_NAME = ".pi-desktop";

/** Plugin registry, relative to the host data directory. */
export const PI_DESKTOP_REGISTRY_PATH = "plugins/registry.json";

/** Installed-plugin directory, relative to the host data directory. */
export const PI_DESKTOP_INSTALLED_PATH = `plugins/installed/${PI_DESKTOP_PLUGIN_ID}`;

/** Project-scoped user-skill registry, relative to the host data directory. */
export const PI_DESKTOP_SKILLS_REGISTRY_PATH = "agent-capabilities/skills.json";

/**
 * Sub-agent directory the host actually reads: `~/.agents/subagents`.
 *
 * The host has no project-level sub-agent discovery (only `loadGlobalSubagents`
 * exists), so a `.pi/agents/*.md` file — which is what the pi CLI reads — is
 * invisible to PI-Desktop's Task tool. `trellis pi-desktop install` therefore
 * also writes the same three roles here.
 */
export const PI_DESKTOP_SUBAGENTS_DIR = "subagents";

/** Data directory the sub-agent scan belongs to, relative to the user's home. */
export const PI_DESKTOP_AGENTS_DIR_NAME = ".agents";

/** Frontmatter marker that identifies a sub-agent file Trellis wrote. */
export const PI_DESKTOP_SUBAGENT_MARKER = "trellis-managed: pi-desktop";

/** Process name the host runs under, used for the "quit before install" guard. */
export const PI_DESKTOP_HOST_PROCESS = "PI-Desktop";
