import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  downloadRegistryDirect,
  downloadTemplateById,
  getInstallPath,
  normalizeRegistrySource,
  parseRegistrySource,
  probeRegistryIndex,
  type RegistrySource,
} from "../../src/utils/template-fetcher.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    const result = parseRegistrySource("git@git.company.com:myorg/myrepo.git");
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
    expect(result.preferGit).toBe(false);
  });

  it("does not set host for public GitHub HTTPS", () => {
    const result = parseRegistrySource("https://github.com/myorg/myrepo");
    expect(result.host).toBeUndefined();
    expect(result.preferGit).toBe(false);
  });

  it("does not set host for public GitLab HTTPS", () => {
    const result = parseRegistrySource("https://gitlab.com/myorg/myrepo");
    expect(result.host).toBeUndefined();
    expect(result.preferGit).toBe(false);
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
    const result = parseRegistrySource("ssh://git@github.com/myorg/myrepo");
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
    expect(normalizeRegistrySource("https://github.com/user/repo/specs")).toBe(
      "gh:user/repo/specs",
    );
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

describe("probeRegistryIndex", () => {
  it("keeps public registries on the HTTP backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 1,
          templates: [
            {
              id: "backend",
              type: "spec",
              name: "Backend",
              path: "marketplace/specs/backend",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const registry = parseRegistrySource("gh:myorg/registry/marketplace");
    const result = await probeRegistryIndex(
      `${registry.rawBaseUrl}/index.json`,
      registry,
    );

    expect(result.backend).toBe("http");
    expect(result.isNotFound).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.templates.map((template) => template.id)).toEqual([
      "backend",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// git-backed registry backend
// =============================================================================

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function writeFixtureFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }
}

interface GitRegistryFixture {
  tmpDir: string;
  repoDir: string;
  registry: RegistrySource;
}

async function withGitRegistry<T>(
  files: Record<string, string>,
  subdir: string,
  callback: (fixture: GitRegistryFixture) => Promise<T>,
): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-git-reg-"));
  const repoDir = path.join(tmpDir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });

  try {
    execFileSync("git", ["init"], { cwd: repoDir, stdio: "pipe" });
    execFileSync("git", ["config", "core.autocrlf", "false"], {
      cwd: repoDir,
      stdio: "pipe",
    });
    execFileSync("git", ["checkout", "-b", "main"], {
      cwd: repoDir,
      stdio: "pipe",
    });
    writeFixtureFiles(repoDir, files);
    execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "pipe" });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Trellis Test",
        "-c",
        "user.email=trellis@example.com",
        "commit",
        "-m",
        "fixture",
      ],
      { cwd: repoDir, stdio: "pipe" },
    );

    const registry: RegistrySource = {
      provider: "gitlab",
      repo: "local/registry",
      subdir,
      ref: "main",
      rawBaseUrl: `https://git.company.com/local/registry/-/raw/main/${subdir}`,
      gigetSource: `gitlab:local/registry/${subdir}`,
      host: "git.company.com",
      gitUrl: repoDir,
      preferGit: true,
      sourceKind: "https",
    };

    return await callback({ tmpDir, repoDir, registry });
  } finally {
    await fs.promises.rm(tmpDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

async function withFakeGit<T>(
  stderr: string,
  callback: () => Promise<T>,
): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trellis-fake-git-"));
  const gitPath = path.join(tmpDir, "git");
  const previousPath = process.env.PATH;

  try {
    fs.writeFileSync(
      gitPath,
      `#!/bin/sh\necho "${stderr.replace(/"/g, '\\"')}" >&2\nexit 128\n`,
      "utf-8",
    );
    fs.chmodSync(gitPath, 0o755);
    process.env.PATH = `${tmpDir}${path.delimiter}${previousPath ?? ""}`;
    return await callback();
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const gitDescribe = hasGit() ? describe : describe.skip;
const posixIt = process.platform === "win32" ? it.skip : it;

gitDescribe("git-backed registry backend", () => {
  it("probes index.json through local Git credentials", async () => {
    await withGitRegistry(
      {
        "marketplace/index.json": JSON.stringify({
          version: 1,
          templates: [
            {
              id: "backend",
              type: "spec",
              name: "Backend",
              path: "templates/backend",
            },
          ],
        }),
      },
      "marketplace",
      async ({ registry }) => {
        const result = await probeRegistryIndex(
          `${registry.rawBaseUrl}/index.json`,
          registry,
        );

        expect(result.backend).toBe("git");
        expect(result.isNotFound).toBe(false);
        expect(result.error).toBeUndefined();
        expect(result.templates.map((template) => template.id)).toEqual([
          "backend",
        ]);
      },
    );
  });

  it("downloads marketplace templates through the same Git backend", async () => {
    await withGitRegistry(
      {
        "marketplace/index.json": JSON.stringify({
          version: 1,
          templates: [
            {
              id: "backend",
              type: "spec",
              name: "Backend",
              path: "templates/backend",
            },
          ],
        }),
        "templates/backend/rules.md": "remote rules\n",
      },
      "marketplace",
      async ({ registry, tmpDir }) => {
        const cwd = path.join(tmpDir, "project");
        const result = await downloadTemplateById(
          cwd,
          "backend",
          "overwrite",
          undefined,
          registry,
        );

        expect(result.success).toBe(true);
        expect(
          fs.readFileSync(
            path.join(cwd, ".trellis", "spec", "rules.md"),
            "utf-8",
          ),
        ).toBe("remote rules\n");
      },
    );
  });

  it("uses an explicit Git backend for prefetched marketplace templates", async () => {
    await withGitRegistry(
      {
        "marketplace/index.json": JSON.stringify({
          version: 1,
          templates: [
            {
              id: "backend",
              type: "spec",
              name: "Backend",
              path: "templates/backend",
            },
          ],
        }),
        "templates/backend/rules.md": "remote rules\n",
      },
      "marketplace",
      async ({ registry, tmpDir }) => {
        const publicGitLabRegistry: RegistrySource = {
          ...registry,
          host: undefined,
          rawBaseUrl:
            "https://gitlab.com/local/registry/-/raw/main/marketplace",
          gigetSource: "gitlab:local/registry/marketplace",
          preferGit: false,
          sourceKind: "prefixed",
        };
        const cwd = path.join(tmpDir, "project");
        const result = await downloadTemplateById(
          cwd,
          "backend",
          "overwrite",
          {
            id: "backend",
            type: "spec",
            name: "Backend",
            path: "templates/backend",
          },
          publicGitLabRegistry,
          undefined,
          "git",
        );

        expect(result.success).toBe(true);
        expect(
          fs.readFileSync(
            path.join(cwd, ".trellis", "spec", "rules.md"),
            "utf-8",
          ),
        ).toBe("remote rules\n");
      },
    );
  });

  it("uses direct download mode when index.json is absent", async () => {
    await withGitRegistry(
      {
        "spec/keep.md": "remote keep\n",
        "spec/new.md": "remote new\n",
      },
      "spec",
      async ({ registry, tmpDir }) => {
        const probe = await probeRegistryIndex(
          `${registry.rawBaseUrl}/index.json`,
          registry,
        );
        expect(probe.backend).toBe("git");
        expect(probe.isNotFound).toBe(true);

        const cwd = path.join(tmpDir, "project");
        const specDir = path.join(cwd, ".trellis", "spec");
        fs.mkdirSync(specDir, { recursive: true });
        fs.writeFileSync(path.join(specDir, "keep.md"), "local keep\n");

        const result = await downloadRegistryDirect(cwd, registry, "append");

        expect(result.success).toBe(true);
        expect(fs.readFileSync(path.join(specDir, "keep.md"), "utf-8")).toBe(
          "local keep\n",
        );
        expect(fs.readFileSync(path.join(specDir, "new.md"), "utf-8")).toBe(
          "remote new\n",
        );
      },
    );
  });

  it("classifies missing refs without falling back to direct mode", async () => {
    await withGitRegistry(
      {
        "marketplace/index.json": JSON.stringify({ version: 1, templates: [] }),
      },
      "marketplace",
      async ({ registry }) => {
        const result = await probeRegistryIndex(
          `${registry.rawBaseUrl}/index.json`,
          { ...registry, ref: "missing-ref" },
        );

        expect(result.isNotFound).toBe(false);
        expect(result.error?.kind).toBe("ref-not-found");
      },
    );
  });

  it("classifies missing registry paths without falling back to direct mode", async () => {
    await withGitRegistry(
      { "other/index.json": JSON.stringify({ version: 1, templates: [] }) },
      "missing",
      async ({ registry }) => {
        const result = await probeRegistryIndex(
          `${registry.rawBaseUrl}/index.json`,
          registry,
        );

        expect(result.isNotFound).toBe(false);
        expect(result.error?.kind).toBe("path-not-found");
      },
    );
  });

  it("classifies missing marketplace template paths", async () => {
    await withGitRegistry(
      {
        "marketplace/index.json": JSON.stringify({
          version: 1,
          templates: [
            {
              id: "backend",
              type: "spec",
              name: "Backend",
              path: "templates/missing",
            },
          ],
        }),
      },
      "marketplace",
      async ({ registry, tmpDir }) => {
        const result = await downloadTemplateById(
          path.join(tmpDir, "project"),
          "backend",
          "overwrite",
          undefined,
          registry,
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain(
          'Template path "templates/missing" was not found',
        );
      },
    );
  });

  it("classifies invalid index JSON without falling back to direct mode", async () => {
    await withGitRegistry(
      { "marketplace/index.json": "not json" },
      "marketplace",
      async ({ registry }) => {
        const result = await probeRegistryIndex(
          `${registry.rawBaseUrl}/index.json`,
          registry,
        );

        expect(result.isNotFound).toBe(false);
        expect(result.error?.kind).toBe("invalid-json");
      },
    );
  });
});

posixIt("classifies Git authentication failures", async () => {
  const registry: RegistrySource = {
    provider: "gitlab",
    repo: "private/registry",
    subdir: "marketplace",
    ref: "main",
    rawBaseUrl:
      "https://git.company.com/private/registry/-/raw/main/marketplace",
    gigetSource: "gitlab:private/registry/marketplace",
    host: "git.company.com",
    gitUrl: "git@git.company.com:private/registry.git",
    preferGit: true,
    sourceKind: "ssh",
  };

  await withFakeGit("Authentication failed", async () => {
    const result = await probeRegistryIndex(
      `${registry.rawBaseUrl}/index.json`,
      registry,
    );

    expect(result.isNotFound).toBe(false);
    expect(result.error?.kind).toBe("auth");
    expect(result.error?.message).toContain("local Git credentials");
  });
});
