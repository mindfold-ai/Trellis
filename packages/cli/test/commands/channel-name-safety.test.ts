import { describe, expect, it } from "vitest";

import {
  assertSafeName,
  channelDir,
} from "../../src/commands/channel/store/paths.js";

// The CLI keeps its own copy of the channel path helpers, so the
// path-traversal guard needs its own regression test here — a change to
// the CLI copy alone must not silently drop the check.
describe("cli channel name path-traversal guard", () => {
  it("rejects traversal and separators", () => {
    for (const bad of ["..", ".", "../x", "../../x", "a/b", "a\\b"]) {
      expect(() => assertSafeName(bad)).toThrow(/Invalid channel name/);
    }
  });

  it("accepts the names real channels use", () => {
    for (const ok of ["a", "chat-only", "ch1", "legacy_thread", "a.b"]) {
      expect(() => assertSafeName(ok)).not.toThrow();
    }
  });

  it("channelDir refuses to resolve outside the store", () => {
    expect(() => channelDir("../../escape")).toThrow(/Invalid channel name/);
  });
});
