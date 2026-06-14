import fs from "node:fs";
import path from "node:path";

import { DIR_NAMES } from "../constants/paths.js";
import { enMessages, type MessageKey } from "./messages/en.js";
import { zhMessages } from "./messages/zh.js";

export type Locale = "en" | "zh";

export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh"] as const;

const MESSAGE_CATALOGS: Record<Locale, Record<MessageKey, string>> = {
  en: enMessages,
  zh: zhMessages,
};

let activeLocale: Locale = DEFAULT_LOCALE;

interface ResolveLocaleOptions {
  cliLocale?: unknown;
  argv?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

type MessageVars = Record<string, string | number>;

export function normalizeLocale(value: unknown): Locale | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return undefined;
}

export function assertLocale(value: unknown): Locale {
  const locale = normalizeLocale(value);
  if (!locale) {
    throw new Error(`Unsupported locale "${String(value)}". Use "en" or "zh".`);
  }
  return locale;
}

function localeFromArgv(argv: readonly string[]): Locale | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--locale" || arg === "--lang") {
      return normalizeLocale(argv[i + 1]);
    }
    if (arg.startsWith("--locale=")) {
      return normalizeLocale(arg.slice("--locale=".length));
    }
    if (arg.startsWith("--lang=")) {
      return normalizeLocale(arg.slice("--lang=".length));
    }
  }
  return undefined;
}

export function readProjectLocale(cwd: string): Locale | undefined {
  const configPath = path.join(cwd, DIR_NAMES.WORKFLOW, "config.yaml");
  if (!fs.existsSync(configPath)) return undefined;

  const content = fs.readFileSync(configPath, "utf-8");
  const match = content.match(
    /^(?:language|locale)\s*:\s*["']?([^"'\n#]+)["']?/m,
  );
  return normalizeLocale(match?.[1]);
}

export function resolveLocale(options: ResolveLocaleOptions = {}): Locale {
  const env = options.env ?? process.env;
  return (
    normalizeLocale(options.cliLocale) ??
    localeFromArgv(options.argv ?? []) ??
    normalizeLocale(env.TRELLIS_LANG) ??
    normalizeLocale(env.TRELLIS_LOCALE) ??
    (options.cwd ? readProjectLocale(options.cwd) : undefined) ??
    DEFAULT_LOCALE
  );
}

export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getLocale(): Locale {
  return activeLocale;
}

export function t(
  key: MessageKey,
  vars: MessageVars = {},
  locale: Locale = activeLocale,
): string {
  const template = MESSAGE_CATALOGS[locale][key] ?? enMessages[key];
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : `{${name}}`,
  );
}
