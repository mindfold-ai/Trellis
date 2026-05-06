import { describe, expect, it } from "vitest";

import { compareVersions } from "../../src/utils/compare-versions.js";

// =============================================================================
// Base version comparison (no prerelease)
// =============================================================================

describe("compareVersions: base versions", () => {
  it("returns 0 for identical versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.5.0", "0.5.0")).toBe(0);
  });

  it("orders by major version", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
  });

  it("orders by minor version when majors are equal", () => {
    expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.1.0")).toBe(1);
  });

  it("orders by patch version when major+minor are equal", () => {
    expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
    expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
  });

  it("treats missing parts as zero (1.0 == 1.0.0)", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1", "1.0.0")).toBe(0);
  });

  it("compares versions with different segment counts", () => {
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.0.1", "1.0")).toBe(1);
  });

  it("handles double-digit segments numerically (not lexically)", () => {
    expect(compareVersions("0.10.0", "0.2.0")).toBe(1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
  });
});

// =============================================================================
// Release vs prerelease (the rc/beta bug fixed in 0.3.0-rc.1)
// =============================================================================

describe("compareVersions: release vs prerelease", () => {
  it("a release version is greater than its prerelease", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBe(1);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(-1);
  });

  it("rc is greater than beta at the same base (regression for 0.3.0-rc.1)", () => {
    // Documented in manifests/0.3.0-rc.1.json: cli/index.ts used to parse
    // "0.3.0-rc.0" as [0,3,0,0] and "0.3.0-beta.16" as [0,3,0,16] and
    // conclude rc < beta. The shared util must NOT regress.
    expect(compareVersions("0.3.0-rc.0", "0.3.0-beta.16")).toBe(1);
    expect(compareVersions("0.3.0-beta.16", "0.3.0-rc.0")).toBe(-1);
  });
});

// =============================================================================
// Prerelease ordering (alphabetical and numeric)
// =============================================================================

describe("compareVersions: prerelease identifiers", () => {
  it("orders prerelease tags alphabetically", () => {
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareVersions("1.0.0-beta", "1.0.0-rc")).toBe(-1);
  });

  it("orders numeric prerelease parts numerically", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0-rc.2")).toBe(-1);
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
    expect(compareVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBe(1);
  });

  it("orders beta.N before rc.0", () => {
    expect(compareVersions("0.5.0-beta.19", "0.5.0-rc.0")).toBe(-1);
    expect(compareVersions("0.5.0-rc.0", "0.5.0-beta.19")).toBe(1);
  });

  it("treats numeric identifiers as lower precedence than alphanumeric (semver §11)", () => {
    // Per semver: "Numeric identifiers always have lower precedence than
    // non-numeric identifiers."
    expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBe(-1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-1")).toBe(1);
  });

  it("a longer prerelease is greater when all preceding parts are equal", () => {
    // Per semver: "A larger set of pre-release fields has a higher
    // precedence than a smaller set, if all of the preceding identifiers
    // are equal."
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1);
  });

  it("matches identical prereleases as equal", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0-rc.1")).toBe(0);
    expect(compareVersions("0.5.0-beta.19", "0.5.0-beta.19")).toBe(0);
  });
});

// =============================================================================
// Hyphenated prerelease identifiers (regression for the split-limit bug)
// =============================================================================

describe("compareVersions: hyphens inside a prerelease identifier", () => {
  // SemVer §9 allows a prerelease identifier to contain hyphens
  // (e.g. `1.0.0-x-y-z` is one identifier `x-y-z`). The naive
  // `String.split("-", 2)` form silently drops everything after the
  // second segment in JavaScript, so `1.0.0-alpha-1` and `1.0.0-alpha-2`
  // used to compare equal. These tests pin the corrected behaviour.

  it("distinguishes hyphenated prereleases that differ after the first hyphen", () => {
    expect(compareVersions("1.0.0-alpha-1", "1.0.0-alpha-2")).toBe(-1);
    expect(compareVersions("1.0.0-alpha-2", "1.0.0-alpha-1")).toBe(1);
  });

  it("orders hyphenated prereleases lexically when both contain hyphens", () => {
    // `rc-bar` < `rc-foo` lexically.
    expect(compareVersions("0.5.0-rc-bar", "0.5.0-rc-foo")).toBe(-1);
    expect(compareVersions("0.5.0-rc-foo", "0.5.0-rc-bar")).toBe(1);
  });

  it("treats a longer hyphenated identifier as greater than its prefix", () => {
    expect(compareVersions("1.0.0-x-y", "1.0.0-x-y-z")).toBe(-1);
    expect(compareVersions("1.0.0-x-y-z", "1.0.0-x-y")).toBe(1);
  });

  it("does not regress dot-separated prerelease ordering", () => {
    // Sanity: the standard rc.N / beta.N forms still work after the fix.
    expect(compareVersions("0.5.0-rc.1", "0.5.0-rc.2")).toBe(-1);
    expect(compareVersions("0.5.0-beta.16", "0.5.0-rc.0")).toBe(-1);
  });
});

// =============================================================================
// Sort behaviour — the contract that getMigrationsForVersion depends on
// =============================================================================

describe("compareVersions: as Array.prototype.sort comparator", () => {
  it("produces ascending order for a mixed prerelease list", () => {
    const versions = [
      "0.5.0",
      "0.3.0-beta.16",
      "0.5.0-rc.10",
      "0.3.0",
      "0.5.0-rc.2",
      "0.3.0-rc.0",
      "0.5.0-beta.19",
    ];
    const sorted = [...versions].sort(compareVersions);
    expect(sorted).toEqual([
      "0.3.0-beta.16",
      "0.3.0-rc.0",
      "0.3.0",
      "0.5.0-beta.19",
      "0.5.0-rc.2",
      "0.5.0-rc.10",
      "0.5.0",
    ]);
  });
});
