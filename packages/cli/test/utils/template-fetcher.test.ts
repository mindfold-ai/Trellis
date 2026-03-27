import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  getInstallPath,
  normalizeRegistrySource,
  parseRegistrySource,
} from "../../src/utils/template-fetcher.js";

// =============================================================================
// getInstallPath — pure function (EASY)
// =============================================================================

describe("getInstallPath", () => {
  it("returns spec path for 'spec' type", () => {
    const result = getInstallPath("/project", "spec");
    expect(result).toBe(path.join("/project", ".trellis/spec"));
  });

  it("returns skill path for 'skill' type", () => {
    const result = getInstallPath("/project", "skill");
    expect(result).toBe(path.join("/project", ".agents/skills"));
  });

  it("returns command path for 'command' type", () => {
    const result = getInstallPath("/project", "command");
    expect(result).toBe(path.join("/project", ".claude/commands"));
  });

  it("returns project root for 'full' type", () => {
    const result = getInstallPath("/project", "full");
    expect(result).toBe(path.join("/project", "."));
  });

  it("falls back to spec path for unknown type", () => {
    const result = getInstallPath("/project", "unknown-type");
    expect(result).toBe(path.join("/project", ".trellis/spec"));
  });

  it("works with different cwd values", () => {
    const result = getInstallPath("/home/user/my-project", "spec");
    expect(result).toBe(path.join("/home/user/my-project", ".trellis/spec"));
  });
});

// =============================================================================
// parseRegistrySource — pure function
// =============================================================================

describe("parseRegistrySource", () => {
  // -------------------------------------------------------------------------
  // GitHub (gh: / github:)
  // -------------------------------------------------------------------------

  it("parses gh:user/repo/subdir", () => {
    const result = parseRegistrySource("gh:myorg/myrepo/marketplace");
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("marketplace");
    expect(result.ref).toBe("main");
    expect(result.rawBaseUrl).toBe(
      "https://raw.githubusercontent.com/myorg/myrepo/main/marketplace",
    );
    expect(result.gigetSource).toBe("gh:myorg/myrepo/marketplace");
  });

  it("parses gh:user/repo/nested/subdir", () => {
    const result = parseRegistrySource("gh:myorg/myrepo/specs/backend");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs/backend");
    expect(result.rawBaseUrl).toBe(
      "https://raw.githubusercontent.com/myorg/myrepo/main/specs/backend",
    );
  });

  it("parses gh:user/repo (no subdir)", () => {
    const result = parseRegistrySource("gh:myorg/myrepo");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("");
    expect(result.rawBaseUrl).toBe(
      "https://raw.githubusercontent.com/myorg/myrepo/main/",
    );
  });

  it("parses gh:user/repo/path#ref", () => {
    const result = parseRegistrySource("gh:myorg/myrepo/marketplace#develop");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("marketplace");
    expect(result.ref).toBe("develop");
    expect(result.rawBaseUrl).toBe(
      "https://raw.githubusercontent.com/myorg/myrepo/develop/marketplace",
    );
  });

  it("parses github: prefix same as gh:", () => {
    const result = parseRegistrySource("github:myorg/myrepo/specs");
    expect(result.provider).toBe("github");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
    expect(result.rawBaseUrl).toBe(
      "https://raw.githubusercontent.com/myorg/myrepo/main/specs",
    );
  });

  // -------------------------------------------------------------------------
  // GitLab
  // -------------------------------------------------------------------------

  it("parses gitlab:user/repo/subdir", () => {
    const result = parseRegistrySource("gitlab:myorg/myrepo/templates");
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("templates");
    expect(result.rawBaseUrl).toBe(
      "https://gitlab.com/myorg/myrepo/-/raw/main/templates",
    );
  });

  it("parses gitlab: with custom ref", () => {
    const result = parseRegistrySource("gitlab:myorg/myrepo/specs#v2");
    expect(result.ref).toBe("v2");
    expect(result.rawBaseUrl).toBe(
      "https://gitlab.com/myorg/myrepo/-/raw/v2/specs",
    );
  });

  // -------------------------------------------------------------------------
  // Bitbucket
  // -------------------------------------------------------------------------

  it("parses bitbucket:user/repo/subdir", () => {
    const result = parseRegistrySource("bitbucket:myorg/myrepo/specs");
    expect(result.provider).toBe("bitbucket");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
    expect(result.rawBaseUrl).toBe(
      "https://bitbucket.org/myorg/myrepo/raw/main/specs",
    );
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it("throws on missing colon (no provider)", () => {
    expect(() => parseRegistrySource("myorg/myrepo/path")).toThrow(
      "Invalid registry source",
    );
  });

  it("throws on unsupported provider", () => {
    expect(() => parseRegistrySource("sourcehut:user/repo")).toThrow(
      "Unsupported provider",
    );
  });

  it("throws on missing repo (only user)", () => {
    expect(() => parseRegistrySource("gh:myorg")).toThrow(
      "Must include user/repo",
    );
  });

  // -------------------------------------------------------------------------
  // HTTPS URL auto-conversion (issue #87)
  // -------------------------------------------------------------------------

  it("accepts GitHub HTTPS URL", () => {
    const result = parseRegistrySource(
      "https://github.com/myorg/myrepo/marketplace",
    );
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("marketplace");
    expect(result.ref).toBe("main");
  });

  it("accepts GitHub HTTPS URL without subdir", () => {
    const result = parseRegistrySource("https://github.com/myorg/myrepo");
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("");
  });

  it("accepts GitHub HTTPS URL with .git suffix", () => {
    const result = parseRegistrySource("https://github.com/myorg/myrepo.git");
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
  });

  it("accepts GitHub HTTPS URL with /tree/branch/path", () => {
    const result = parseRegistrySource(
      "https://github.com/myorg/myrepo/tree/develop/specs",
    );
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
    expect(result.ref).toBe("develop");
  });

  it("accepts GitLab HTTPS URL", () => {
    const result = parseRegistrySource(
      "https://gitlab.com/myorg/myrepo/templates",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("templates");
  });

  it("accepts Bitbucket HTTPS URL", () => {
    const result = parseRegistrySource(
      "https://bitbucket.org/myorg/myrepo/specs",
    );
    expect(result.provider).toBe("bitbucket");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
  });

  // -------------------------------------------------------------------------
  // Self-hosted GitLab / GitHub Enterprise (SSH + HTTPS)
  // -------------------------------------------------------------------------

  it("accepts SSH URL for self-hosted GitLab", () => {
    const result = parseRegistrySource("git@git.company.com:myorg/myrepo");
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("git.company.com");
    expect(result.rawBaseUrl).toBe(
      "https://git.company.com/myorg/myrepo/-/raw/main/",
    );
  });

  it("accepts SSH URL with .git suffix", () => {
    const result = parseRegistrySource(
      "git@git.company.com:myorg/myrepo.git",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("git.company.com");
  });

  it("accepts SSH URL with subdir path", () => {
    const result = parseRegistrySource(
      "git@git.company.com:myorg/myrepo/specs",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
    expect(result.host).toBe("git.company.com");
  });

  it("accepts HTTPS URL for self-hosted GitLab", () => {
    const result = parseRegistrySource(
      "https://gitlab.mycompany.com/myorg/myrepo",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("gitlab.mycompany.com");
    expect(result.rawBaseUrl).toBe(
      "https://gitlab.mycompany.com/myorg/myrepo/-/raw/main/",
    );
  });

  it("accepts HTTPS URL for self-hosted GitLab with subdir", () => {
    const result = parseRegistrySource(
      "https://git.company.com/myorg/myrepo/specs",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
    expect(result.host).toBe("git.company.com");
    expect(result.rawBaseUrl).toBe(
      "https://git.company.com/myorg/myrepo/-/raw/main/specs",
    );
  });

  it("accepts HTTPS URL for self-hosted GitLab with /-/tree/branch/path", () => {
    const result = parseRegistrySource(
      "https://git.company.com/myorg/myrepo/-/tree/develop/specs",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs");
    expect(result.ref).toBe("develop");
    expect(result.host).toBe("git.company.com");
  });

  it("accepts HTTPS URL for GitHub Enterprise", () => {
    const result = parseRegistrySource(
      "https://github.mycompany.com/myorg/myrepo",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("github.mycompany.com");
  });

  it("does not set host for public GitLab", () => {
    const result = parseRegistrySource("gitlab:myorg/myrepo/specs");
    expect(result.host).toBeUndefined();
  });

  it("does not set host for public GitHub HTTPS", () => {
    const result = parseRegistrySource("https://github.com/myorg/myrepo");
    expect(result.host).toBeUndefined();
  });

  it("does not set host for public GitLab HTTPS", () => {
    const result = parseRegistrySource("https://gitlab.com/myorg/myrepo");
    expect(result.host).toBeUndefined();
  });

  it("accepts self-hosted HTTPS URL with .git suffix", () => {
    const result = parseRegistrySource(
      "https://git.company.com/myorg/myrepo.git",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("git.company.com");
  });

  it("accepts self-hosted HTTPS URL with ref", () => {
    const result = parseRegistrySource(
      "https://git.company.com/myorg/myrepo/-/tree/v2/specs/backend",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.subdir).toBe("specs/backend");
    expect(result.ref).toBe("v2");
    expect(result.host).toBe("git.company.com");
  });

  // -------------------------------------------------------------------------
  // Public SSH URLs (should use native provider, no host)
  // -------------------------------------------------------------------------

  it("maps git@github.com SSH to gh: provider without host", () => {
    const result = parseRegistrySource("git@github.com:myorg/myrepo");
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBeUndefined();
    expect(result.rawBaseUrl).toBe(
      "https://raw.githubusercontent.com/myorg/myrepo/main/",
    );
  });

  it("maps git@gitlab.com SSH to gitlab: provider without host", () => {
    const result = parseRegistrySource("git@gitlab.com:myorg/myrepo");
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBeUndefined();
    expect(result.rawBaseUrl).toBe(
      "https://gitlab.com/myorg/myrepo/-/raw/main/",
    );
  });

  it("maps git@bitbucket.org SSH to bitbucket: provider without host", () => {
    const result = parseRegistrySource("git@bitbucket.org:myorg/myrepo");
    expect(result.provider).toBe("bitbucket");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // ssh:// protocol format
  // -------------------------------------------------------------------------

  it("accepts ssh:// protocol with port", () => {
    const result = parseRegistrySource(
      "ssh://git@git.company.com:2222/myorg/myrepo",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("git.company.com");
  });

  it("accepts ssh:// protocol without port", () => {
    const result = parseRegistrySource(
      "ssh://git@git.company.com/myorg/myrepo",
    );
    expect(result.provider).toBe("gitlab");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBe("git.company.com");
  });

  it("maps ssh://git@github.com to gh: provider without host", () => {
    const result = parseRegistrySource(
      "ssh://git@github.com/myorg/myrepo",
    );
    expect(result.provider).toBe("gh");
    expect(result.repo).toBe("myorg/myrepo");
    expect(result.host).toBeUndefined();
  });
});

// =============================================================================
// normalizeRegistrySource — pure function
// =============================================================================

describe("normalizeRegistrySource", () => {
  it("converts GitHub HTTPS URL to gh: format", () => {
    expect(normalizeRegistrySource("https://github.com/user/repo")).toBe(
      "gh:user/repo",
    );
  });

  it("converts GitHub HTTPS URL with subdir", () => {
    expect(
      normalizeRegistrySource("https://github.com/user/repo/specs"),
    ).toBe("gh:user/repo/specs");
  });

  it("converts GitHub HTTPS URL with /tree/branch/path", () => {
    expect(
      normalizeRegistrySource(
        "https://github.com/user/repo/tree/develop/specs",
      ),
    ).toBe("gh:user/repo/specs#develop");
  });

  it("strips .git suffix", () => {
    expect(normalizeRegistrySource("https://github.com/user/repo.git")).toBe(
      "gh:user/repo",
    );
  });

  it("converts GitLab HTTPS URL", () => {
    expect(normalizeRegistrySource("https://gitlab.com/user/repo")).toBe(
      "gitlab:user/repo",
    );
  });

  it("converts Bitbucket HTTPS URL", () => {
    expect(normalizeRegistrySource("https://bitbucket.org/user/repo")).toBe(
      "bitbucket:user/repo",
    );
  });

  it("passes through giget-style sources unchanged", () => {
    expect(normalizeRegistrySource("gh:user/repo")).toBe("gh:user/repo");
    expect(normalizeRegistrySource("gitlab:user/repo#v2")).toBe(
      "gitlab:user/repo#v2",
    );
  });

  it("passes through unknown URLs unchanged", () => {
    expect(normalizeRegistrySource("https://example.com/repo")).toBe(
      "https://example.com/repo",
    );
  });
});
