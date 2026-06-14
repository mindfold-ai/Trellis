#!/usr/bin/env node
/**
 * Bilingual integrity guard for Trellis.
 *
 * Normal mode:
 *   - message catalog key parity is always checked
 *   - docs-site checks run only when the submodule is initialized
 *
 * Release mode (--release):
 *   - docs-site must be initialized
 *   - English MDX pages must have zh/ mirrors
 *   - docs.json language navigation must list matching en/zh page entries
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "../..");
const DOCS_SITE = path.join(REPO_ROOT, "docs-site");
const RELEASE_MODE = process.argv.includes("--release");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

function extractMessageKeys(filePath) {
  const content = readText(filePath);
  return new Set(
    [...content.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]),
  );
}

function sortedDifference(a, b) {
  return [...a].filter((value) => !b.has(value)).sort();
}

function checkMessageCatalogs(errors) {
  const enPath = path.join(PACKAGE_ROOT, "src/i18n/messages/en.ts");
  const zhPath = path.join(PACKAGE_ROOT, "src/i18n/messages/zh.ts");
  const enKeys = extractMessageKeys(enPath);
  const zhKeys = extractMessageKeys(zhPath);

  const missingZh = sortedDifference(enKeys, zhKeys);
  const extraZh = sortedDifference(zhKeys, enKeys);

  if (missingZh.length > 0) {
    errors.push(`zh message catalog missing keys: ${missingZh.join(", ")}`);
  }
  if (extraZh.length > 0) {
    errors.push(`zh message catalog has extra keys: ${extraZh.join(", ")}`);
  }
}

function walkFiles(root, predicate) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && predicate(abs)) {
        files.push(abs);
      }
    }
  }
  walk(root);
  return files;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function collectDocsPages() {
  const mdxFiles = walkFiles(DOCS_SITE, (filePath) => filePath.endsWith(".mdx"));
  const enPages = [];
  const zhPages = new Set();

  for (const abs of mdxFiles) {
    const rel = toPosix(path.relative(DOCS_SITE, abs));
    if (rel.startsWith("release/") || rel.startsWith("zh/release/")) continue;
    if (rel.startsWith("zh/")) {
      zhPages.add(rel.slice("zh/".length));
    } else {
      enPages.push(rel);
    }
  }

  return { enPages, zhPages };
}

function collectPageStrings(value, pages = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPageStrings(item, pages);
    }
  } else if (value && typeof value === "object") {
    const record = value;
    if (Array.isArray(record.pages)) {
      collectPageStrings(record.pages, pages);
    }
    for (const key of ["groups", "tabs", "languages"]) {
      if (Array.isArray(record[key])) {
        collectPageStrings(record[key], pages);
      }
    }
  } else if (typeof value === "string") {
    if (!value.startsWith("http") && !value.includes(" ")) {
      pages.push(value);
    }
  }
  return pages;
}

function checkDocsSite(errors) {
  const docsJsonPath = path.join(DOCS_SITE, "docs.json");
  if (!fs.existsSync(docsJsonPath)) {
    const message =
      "docs-site is not initialized; run `git submodule update --init docs-site`";
    if (RELEASE_MODE) {
      errors.push(message);
    } else {
      console.warn(`[i18n] ${message}; skipping docs-site checks.`);
    }
    return;
  }

  const { enPages, zhPages } = collectDocsPages();
  const missingZhFiles = enPages
    .filter((page) => !zhPages.has(page))
    .sort();
  if (missingZhFiles.length > 0) {
    errors.push(
      `docs-site pages missing zh mirrors:\n  ${missingZhFiles.join("\n  ")}`,
    );
  }

  const docsJson = JSON.parse(readText(docsJsonPath));
  const languages = docsJson?.navigation?.languages;
  if (!Array.isArray(languages)) {
    errors.push("docs-site/docs.json missing navigation.languages[]");
    return;
  }

  const enNav = languages.find((entry) => entry?.language === "en");
  const zhNav = languages.find((entry) => entry?.language === "zh");
  if (!enNav || !zhNav) {
    errors.push("docs-site/docs.json must define both en and zh navigation");
    return;
  }

  const enNavPages = collectPageStrings(enNav).filter(
    (page) => !page.startsWith("zh/"),
  );
  const zhNavPages = new Set(
    collectPageStrings(zhNav).map((page) =>
      page.startsWith("zh/") ? page.slice("zh/".length) : page,
    ),
  );
  const missingZhNav = enNavPages
    .filter((page) => !zhNavPages.has(page))
    .sort();

  if (missingZhNav.length > 0) {
    errors.push(
      `docs-site navigation missing zh entries:\n  ${missingZhNav.join("\n  ")}`,
    );
  }
}

function main() {
  const errors = [];
  checkMessageCatalogs(errors);
  checkDocsSite(errors);

  if (errors.length > 0) {
    console.error("\nBilingual integrity check failed:\n");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    console.error("");
    process.exit(1);
  }

  console.log("Bilingual integrity check passed");
}

main();
