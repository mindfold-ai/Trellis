import { afterEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

vi.mock("node:child_process", () => ({ execSync: vi.fn() }));

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const script = path.join(root, "packages/cli/scripts/release-preflight.js");
const preflight = (await import(script)) as {
  computeNpmTag: (version: string) => string;
  tagVersionFromEnv: (env: NodeJS.ProcessEnv) => string | null;
  assertPublicationRepository: (env: NodeJS.ProcessEnv) => void;
  npmVersionExists: (name: string, version: string) => boolean;
  main: (args: string[]) => Promise<void>;
};

function setup(
  version = "0.7.0-beta.1",
  repository = "mindfold-ai/trellis",
): void {
  vi.stubEnv("GITHUB_REPOSITORY", repository);
  vi.stubEnv("GITHUB_REF_NAME", `v${version}`);
  vi.stubEnv("GITHUB_REF", `refs/tags/v${version}`);
  vi.stubEnv("GITHUB_OUTPUT", "");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("preflight exited");
  });
  const read = fs.readFileSync.bind(fs);
  vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
    const name = String(file);
    if (
      ["core", "cli"].some(
        (pkg) => name === path.join(root, `packages/${pkg}/package.json`),
      )
    ) {
      return JSON.stringify({
        name: name.includes("/core/")
          ? "@mindfoldhq/trellis-core"
          : "@mindfoldhq/trellis",
        version,
      });
    }
    return read(file, options);
  });
  vi.mocked(execSync).mockImplementation(() => {
    throw new Error("unexpected subprocess");
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(execSync).mockReset();
});

describe("npm release tracks", () => {
  it("does not accept a trailing newline as an exact version or tag", () => {
    expect(() => preflight.computeNpmTag("0.7.0\n")).toThrow(
      "Unsupported npm release",
    );
    expect(
      preflight.tagVersionFromEnv({ GITHUB_REF_NAME: "v0.7.0\n" }),
    ).toBeNull();
  });
  it.each([
    ["0.7.0", "latest"],
    ["0.7.0-alpha.0", "alpha"],
    ["0.7.0-beta.12", "beta"],
    ["0.7.0-rc.1", "rc"],
  ])("maps %s to %s", (version, tag) => {
    expect(preflight.computeNpmTag(version)).toBe(tag);
  });

  it.each([
    "0.7.0-castbox.1",
    "0.7.0-next.1",
    "0.7.0-castbox-beta.1",
    "0.7.0-beta",
    "0.7.0-beta.1.extra",
    "v0.7.0",
    "01.7.0",
    "0.7.0-beta.01",
    "garbage",
  ])("rejects %s instead of using latest", (version) => {
    expect(() => preflight.computeNpmTag(version)).toThrow(
      "Unsupported npm release",
    );
  });
});

describe("anchored release tags", () => {
  it.each(["v0.7.0-beta.1", "refs/tags/v0.7.0-beta.1"])("accepts %s", (ref) => {
    expect(preflight.tagVersionFromEnv({ GITHUB_REF: ref })).toBe(
      "0.7.0-beta.1",
    );
  });
  it.each([
    "castbox-v0.7.0",
    "refs/tags/castbox-v0.7.0",
    "prefix-v0.7.0",
    "refs/heads/v0.7.0",
    "v0.7.0/extra",
    "",
  ])("rejects %s", (ref) => {
    expect(preflight.tagVersionFromEnv({ GITHUB_REF_NAME: ref })).toBeNull();
  });
});

describe("publication isolation", () => {
  it("treats only missing npm versions as unpublished, not network failures", () => {
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw Object.assign(new Error("missing"), { stderr: "npm error E404" });
    });
    expect(preflight.npmVersionExists("@mindfoldhq/trellis", "0.7.0")).toBe(
      false,
    );
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw Object.assign(new Error("network failure"), {
        stderr: "ETIMEDOUT",
      });
    });
    expect(() =>
      preflight.npmVersionExists("@mindfoldhq/trellis", "0.7.0"),
    ).toThrow("network failure");
  });
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/publish.yml"),
    "utf8",
  );
  const guard = workflow.match(/^ {4}if: \$\{\{ (.+) \}\}$/m)?.[1];

  it("places the exact allowlist on the whole publish job", () => {
    expect(workflow).toMatch(
      /jobs:\n {2}publish:\n(?: {4}#.*\n)* {4}if: \$\{\{ github.repository == 'mindfold-ai\/trellis' \}\}\n {4}runs-on:/,
    );
    expect(workflow).toContain("types: [published]");
    expect(workflow).toContain('tags:\n      - "v*"');
    expect(guard).toBe("github.repository == 'mindfold-ai/trellis'");
  });

  for (const event of ["push", "release"]) {
    for (const tag of ["v0.7.0", "castbox-v0.7.0-castbox.1"]) {
      it.each(["mindfold-ai/trellis", "castbox/Trellis", "other/trellis", ""])(
        `${event} ${tag} gates repository %s even with credentials`,
        (repository) => {
          const allowed = runInNewContext(guard ?? "false", {
            github: {
              repository,
              event_name: event,
              ref_name: tag,
              event: { action: "published" },
            },
            secrets: { NPM_TOKEN: "test-only-not-a-credential" },
          }) as boolean;
          expect(allowed).toBe(repository === "mindfold-ai/trellis");
          if (allowed) {
            expect(() =>
              preflight.assertPublicationRepository({
                GITHUB_REPOSITORY: repository,
              }),
            ).not.toThrow();
          } else {
            expect(() =>
              preflight.assertPublicationRepository({
                GITHUB_REPOSITORY: repository,
              }),
            ).toThrow("repository context");
          }
        },
      );
    }
  }

  it.each(["castbox/Trellis", "other/trellis", ""])(
    "blocks publish-plan before subprocess/output for %s",
    async (repository) => {
      setup("0.7.0", repository);
      vi.stubEnv("NODE_AUTH_TOKEN", "test-only-not-a-credential");
      const append = vi.spyOn(fs, "appendFileSync");
      await expect(
        preflight.main(["publish-plan", "--github"]),
      ).rejects.toThrow("repository context");
      expect(execSync).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    },
  );

  it.each(["npm-tag", "verify-npm"])(
    "requires repository authority for %s",
    async (command) => {
      setup("0.7.0", "");
      await expect(preflight.main([command])).rejects.toThrow(
        "repository context",
      );
      expect(execSync).not.toHaveBeenCalled();
    },
  );

  it.each(["", "castbox-v0.7.0", "v0.7.1"])(
    "blocks missing, prefixed or mismatched tag %s before npm",
    async (tag) => {
      setup("0.7.0");
      vi.stubEnv("GITHUB_REF_NAME", tag);
      vi.stubEnv("GITHUB_REF", "");
      await expect(preflight.main(["publish-plan"])).rejects.toThrow(
        "preflight exited",
      );
      expect(execSync).not.toHaveBeenCalled();
    },
  );

  it.each(["0.7.0-castbox.1", "0.7.0-next.1"])(
    "blocks unsupported %s before npm",
    async (version) => {
      setup(version);
      await expect(preflight.main(["publish-plan"])).rejects.toThrow(
        "Unsupported npm release",
      );
      expect(execSync).not.toHaveBeenCalled();
    },
  );

  it("preserves idempotent per-package planning for the approved repository", async () => {
    setup();
    vi.mocked(execSync)
      .mockReturnValueOnce('"0.7.0-beta.1"')
      .mockReturnValueOnce("");
    await preflight.main(["publish-plan"]);
    expect(execSync).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenLastCalledWith(
      expect.stringContaining("skip (already on npm)"),
    );
    expect(console.log).toHaveBeenLastCalledWith(
      expect.stringContaining("publish"),
    );
  });

  it.each(["", "castbox/Trellis"])(
    "keeps generic local checks usable in %s without credentials",
    async (repository) => {
      setup("0.7.0-castbox.1", repository);
      vi.stubEnv("GITHUB_REF_NAME", "");
      vi.stubEnv("GITHUB_REF", "");
      vi.stubEnv("NODE_AUTH_TOKEN", "");
      await preflight.main(["check-versions"]);
      vi.mocked(execSync).mockImplementation((command) => {
        const cmd = String(command);
        if (cmd.startsWith("pnpm pack --pack-destination ")) {
          const target = path.join(
            cmd.slice("pnpm pack --pack-destination ".length),
            "cli.tgz",
          );
          fs.writeFileSync(target, "fixture");
          return target;
        }
        if (cmd.startsWith("tar -xzf ")) {
          const dir = cmd.split(" -C ")[1].split(" package/package.json")[0];
          fs.mkdirSync(path.join(dir, "package"));
          fs.writeFileSync(
            path.join(dir, "package/package.json"),
            JSON.stringify({
              dependencies: { "@mindfoldhq/trellis-core": "0.7.0-castbox.1" },
            }),
          );
          return "";
        }
        throw new Error(`unexpected subprocess: ${cmd}`);
      });
      await preflight.main(["verify-packed-cli"]);
      expect(execSync).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenLastCalledWith(
        expect.stringContaining(
          "pins @mindfoldhq/trellis-core to exact 0.7.0-castbox.1",
        ),
      );
    },
  );
});
