import { AI_TOOLS } from "../types/ai-tools.js";
import {
  PI_DESKTOP_EXTENSION_PATH,
  PI_DESKTOP_PLUGIN_DIR,
} from "../constants/pi-desktop.js";
import { getExtensionTemplate } from "../templates/pi/index.js";
import {
  getPluginMainTemplate,
  getPluginManifestTemplate,
} from "../templates/pi-desktop/index.js";
import { collectPiSurface } from "./pi.js";
import { resolvePlaceholders } from "./shared.js";

/**
 * The PI-Desktop file set: pi's shared surface (prompts, sub-agent
 * definitions, `.agents/skills/`) plus the host plugin wrapper.
 *
 * `.pi/settings.json` and `.pi/extensions/trellis/index.ts` are deliberately
 * absent: the host reads neither. The extension reaches the agent through
 * `contributes.agentExtensions` instead, which `trellis pi-desktop install`
 * registers in the host's plugin registry.
 */
export function collectPiDesktopTemplates(): Map<string, string> {
  const files = collectPiSurface();
  const ctx = AI_TOOLS["pi-desktop"].templateContext;

  files.set(
    `${PI_DESKTOP_PLUGIN_DIR}/manifest.json`,
    resolvePlaceholders(getPluginManifestTemplate(), ctx),
  );
  files.set(`${PI_DESKTOP_PLUGIN_DIR}/main.js`, getPluginMainTemplate());

  // One source, two hosts: the extension is the pi template byte for byte, so
  // a fix never has to be applied twice (asserted by the template test).
  files.set(PI_DESKTOP_EXTENSION_PATH, getExtensionTemplate());

  return files;
}
