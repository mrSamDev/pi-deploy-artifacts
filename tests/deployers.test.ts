import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vercelDeployer } from "../extensions/deployers/vercel.js";
import { cloudflareDeployer } from "../extensions/deployers/cloudflare.js";
import { netlifyDeployer } from "../extensions/deployers/netlify.js";
import { githubDeployer } from "../extensions/deployers/github.js";

function makeState(overrides?: Record<string, any>) {
  return {
    platforms: {},
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "pi-artifacts-deployer-test-"));
});

describe("vercelDeployer", () => {
  it("extracts URL from Aliased line", () => {
    const output = [
      "Deploying user/my-project",
      "  Inspect     https://vercel.com/user/my-project/abc123",
      "▲ Production  https://my-project-abc.vercel.app",
      "Completing…",
      "▲ Aliased     https://my-project.vercel.app",
      "✓ Ready in 5s",
    ].join("\n");
    const mockExec = vi.fn().mockReturnValue(output);

    const result = vercelDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("https://my-project.vercel.app");
  });

  it("uses --project flag when projectName exists", () => {
    const mockExec = vi.fn().mockReturnValue("▲ Aliased     https://my-project.vercel.app\n✓ Done");
    const state = makeState({
      platforms: { vercel: { projectName: "my-project", baseUrl: "https://my-project.vercel.app" } },
    });
    vercelDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('--project "my-project"');
  });
});

describe("cloudflareDeployer", () => {
  it("creates project on first deploy and extracts URL", () => {
    const mockExec = vi.fn();
    // First call: project create (throws)
    mockExec.mockImplementationOnce(() => { throw new Error("exists"); });
    // Second call: pages deploy
    mockExec.mockReturnValueOnce("https://pi-artifacts-test.sam.pages.dev");

    const result = cloudflareDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("https://pi-artifacts-test.sam.pages.dev");
    expect(result.projectName).toBeDefined();
  });

  it("reuses existing projectName", () => {
    const mockExec = vi.fn().mockReturnValue("https://existing-project.sam.pages.dev");
    const state = makeState({
      platforms: { cloudflare: { projectName: "existing-project", baseUrl: "https://existing-project.sam.pages.dev" } },
    });
    const result = cloudflareDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    expect(result.projectName).toBe("existing-project");
    // Should NOT try to create project again
    const calls = mockExec.mock.calls;
    expect(calls.every((c) => !(c[0] as string).includes("project create"))).toBe(true);
  });
});

describe("netlifyDeployer", () => {
  it("parses JSON output", () => {
    const json = JSON.stringify({
      deploy_url: "https://my-site.netlify.app",
      site_id: "abc-123",
      name: "my-site",
    });
    const mockExec = vi.fn().mockReturnValue(json);

    const result = netlifyDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("https://my-site.netlify.app");
    expect(result.projectName).toBe("abc-123");
  });

  it("uses --site flag when projectName exists", () => {
    const mockExec = vi.fn().mockReturnValue(JSON.stringify({ deploy_url: "https://x.netlify.app" }));
    const state = makeState({
      platforms: { netlify: { projectName: "my-site", baseUrl: "https://my-site.netlify.app" } },
    });
    netlifyDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('--site "my-site"');
    expect(cmd).not.toContain("--site-name");
  });
});

describe("githubDeployer", () => {
  it("constructs URL from git remote", () => {
    const hub = join(tmpDir, "hub");
    mkdirSync(hub, { recursive: true });
    const mockExec = vi.fn();
    mockExec.mockReturnValueOnce(""); // npx gh-pages
    mockExec.mockReturnValueOnce("git@github.com:user/my-repo.git"); // git remote

    const result = githubDeployer.deployHub(hub, tmpDir, makeState(), mockExec);
    expect(result.baseUrl).toBe("https://user.github.io/my-repo/");
  });
});
