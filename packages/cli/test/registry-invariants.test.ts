/**
 * Registry Invariant Tests
 *
 * Cross-module consistency checks inspired by:
 * - SQLite's invariant checking (PRAGMA integrity_check after every operation)
 * - Mark Seemann's DI container testing (roundtrip + consumer-perspective checks)
 *
 * These tests catch errors when adding a new platform but forgetting to update
 * one of the registries or derived data.
 */

import { describe, expect, it } from "vitest";
import { AI_TOOLS } from "../src/types/ai-tools.js";
import {
  PLATFORM_IDS,
} from "../src/configurators/index.js";

const COMMANDER_RESERVED_FLAGS = ["help", "version", "V", "h"];

// =============================================================================
// Internal Consistency (SQLite-style invariant checks)
// =============================================================================

describe("registry internal consistency", () => {
  it("PLATFORM_IDS length matches AI_TOOLS keys", () => {
    expect(PLATFORM_IDS.length).toBe(Object.keys(AI_TOOLS).length);
  });

  it("all cliFlag values are unique", () => {
    const flags = PLATFORM_IDS.map((id) => AI_TOOLS[id].cliFlag);
    const unique = new Set(flags);
    expect(unique.size).toBe(flags.length);
  });

  it("all configDir values are unique", () => {
    const dirs = PLATFORM_IDS.map((id) => AI_TOOLS[id].configDir);
    const unique = new Set(dirs);
    expect(unique.size).toBe(dirs.length);
  });

  it("all configDir values start with dot", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].configDir.startsWith(".")).toBe(true);
    }
  });

  it("all extraManagedPaths values start with dot", () => {
    for (const id of PLATFORM_IDS) {
      for (const extraPath of AI_TOOLS[id].extraManagedPaths ?? []) {
        expect(extraPath.startsWith(".")).toBe(true);
      }
    }
  });

  it("no configDir collides with .trellis", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].configDir).not.toBe(".trellis");
    }
  });

  it("no cliFlag collides with commander.js reserved flags", () => {
    for (const id of PLATFORM_IDS) {
      expect(COMMANDER_RESERVED_FLAGS).not.toContain(AI_TOOLS[id].cliFlag);
    }
  });

  it("every platform has non-empty name", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].name.length).toBeGreaterThan(0);
    }
  });

  it("every platform templateDirs includes common", () => {
    for (const id of PLATFORM_IDS) {
      expect(AI_TOOLS[id].templateDirs).toContain("common");
    }
  });

});

// Roundtrip and derived-helper tests are in configurators/index.test.ts
// This file focuses on internal consistency invariants only
