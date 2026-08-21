/**
 * Unit tests for declared entry points (`.trellis/entry-points.json`).
 *
 * Covers:
 *  - loading: valid declaration, absent file, invalid shapes/keys/values
 *  - transform: literal substitution, fallback passthrough, idempotency
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  applyDeclaredEntryPoints,
  loadDeclaredEntryPoints,
  setDeclaredEntryPoints,
} from "../../src/utils/entry-points.js";

const DECLARATION = {
  schemaVersion: 1,
  entryPoints: {
    start: "/sd:sd-start",
    continue: "/sd:sd-continue",
    "finish-work": "/sd:sd-finish-work",
    "update-spec": "sd-update-spec",
  },
};

function projectWithDeclaration(value: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), "trellis-entry-points-"));
  mkdirSync(path.join(root, ".trellis"), { recursive: true });
  writeFileSync(
    path.join(root, ".trellis", "entry-points.json"),
    typeof value === "string" ? value : JSON.stringify(value),
    "utf-8",
  );
  return root;
}

afterEach(() => {
  setDeclaredEntryPoints(null);
});

describe("loadDeclaredEntryPoints", () => {
  it("loads a valid declaration", () => {
    const root = projectWithDeclaration(DECLARATION);
    try {
      expect(loadDeclaredEntryPoints(root)).toEqual(DECLARATION.entryPoints);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns null when the file is absent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "trellis-entry-points-"));
    try {
      expect(loadDeclaredEntryPoints(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["unparsable JSON", "{nope"],
    ["wrong schema version", { schemaVersion: 2, entryPoints: {} }],
    ["array root", [1]],
    [
      "unknown top-level key",
      { schemaVersion: 1, entryPoints: {}, extra: true },
    ],
    [
      "unknown entry key",
      { schemaVersion: 1, entryPoints: { "finish-line": "/x:y" } },
    ],
    [
      "non-string value",
      { schemaVersion: 1, entryPoints: { start: 5 } },
    ],
    [
      "value with whitespace",
      { schemaVersion: 1, entryPoints: { start: "/sd:sd start" } },
    ],
    [
      "value embedding a replaced literal",
      { schemaVersion: 1, entryPoints: { start: "/trellis:continue" } },
    ],
    [
      "value embedding the update-spec literal",
      { schemaVersion: 1, entryPoints: { start: "trellis-update-spec2" } },
    ],
    ["empty entryPoints", { schemaVersion: 1, entryPoints: {} }],
  ])("returns null for %s", (_label, value) => {
    const root = projectWithDeclaration(value);
    try {
      expect(loadDeclaredEntryPoints(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("applyDeclaredEntryPoints", () => {
  const sample = [
    "Flow: `trellis-implement` -> `trellis-update-spec` -> commit -> `/trellis:finish-work`.",
    "Use /trellis:continue or phase context to decide the next step.",
    "Run `/trellis:start` to begin.",
  ].join("\n");

  it("is a no-op when nothing is declared", () => {
    setDeclaredEntryPoints(null);
    expect(applyDeclaredEntryPoints(sample)).toBe(sample);
  });

  it("replaces every mapped literal with the declared value", () => {
    setDeclaredEntryPoints(DECLARATION.entryPoints);
    const result = applyDeclaredEntryPoints(sample);
    expect(result).toContain("`sd-update-spec` -> commit -> `/sd:sd-finish-work`");
    expect(result).toContain("Use /sd:sd-continue or phase context");
    expect(result).toContain("Run `/sd:sd-start` to begin.");
    expect(result).not.toContain("/trellis:");
    expect(result).not.toContain("trellis-update-spec");
  });

  it("leaves unmapped literals and skill identities alone", () => {
    setDeclaredEntryPoints({ "finish-work": "/sd:sd-finish-work" });
    const result = applyDeclaredEntryPoints(sample);
    expect(result).toContain("`trellis-implement`");
    expect(result).toContain("/trellis:continue");
    expect(result).toContain("/sd:sd-finish-work");
  });

  it("is idempotent", () => {
    setDeclaredEntryPoints(DECLARATION.entryPoints);
    const once = applyDeclaredEntryPoints(sample);
    expect(applyDeclaredEntryPoints(once)).toBe(once);
  });
});
