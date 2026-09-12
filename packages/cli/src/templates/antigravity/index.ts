/**
 * Antigravity templates
 *
 * Directory structure:
 *   antigravity/
 *   └── hooks.json   # Lifecycle hooks configuration
 */

import { createTemplateReader } from "../template-utils.js";

const { getConfig } = createTemplateReader(import.meta.url);

export const getHooksConfig = (): string => getConfig("hooks.json");
