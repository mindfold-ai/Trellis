import { createTemplateReader } from "../template-utils.js";

const { readTemplate } = createTemplateReader(import.meta.url);

/**
 * Files this template directory owns. The agent extension itself is NOT
 * copied here: `.pi-desktop/trellis/agent/index.ts` is written from the pi
 * extension template (`templates/pi/extensions/trellis/index.ts.txt`) so the
 * two platforms can never drift apart.
 */
export function getPluginManifestTemplate(): string {
  return readTemplate("manifest.json");
}

export function getPluginMainTemplate(): string {
  return readTemplate("main.js");
}
