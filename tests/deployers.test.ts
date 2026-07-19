import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vercelDeployer } from "../extensions/deployers/vercel.js";
import { cloudflareDeployer } from "../extensions/deployers/cloudflare.js";
import { netlifyDeployer } from "../extensions/deployers/netlify.js";
import { githubDeployer } from "../extensions/deployers/github.js";
import { resolvePlatformChoice } from "../extensions/resolvePlatform.js";

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

/** Create an async mock exec that returns resolved values. */
function asyncExec(...values: string[]) {
  if (values.length === 1) {
    return vi.fn().mockResolvedValue(values[0]);
  }
  const fn = vi.fn();
  values.forEach((v) => fn.mockResolvedValueOnce(v));
  return fn;
}

/** Assert that execFn was called with the given cwd (second arg). */
function expectCwd(mockExec: ReturnType<typeof vi.fn>, callIndex: number, expectedCwd: string) {
  const cwd = mockExec.mock.calls[callIndex]?.[1];
  expect(cwd, `execFn call ${callIndex} should have cwd "${expectedCwd}"`).toBe(expectedCwd);
}

describe("vercelDeployer", () => {
  it("extracts URL from Aliased line", async () => {
    const output = [
      "Deploying user/my-project",
      "  Inspect     https://vercel.com/user/my-project/abc123",
      "▲ Production  https://my-project-abc.vercel.app",
      "Completing…",
      "▲ Aliased     https://my-project.vercel.app",
      "✓ Ready in 5s",
    ].join("\n");
    const mockExec = asyncExec(output);

    const result = await vercelDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("https://my-project.vercel.app");
  });

  it("uses --project flag when projectName exists", async () => {
    const mockExec = asyncExec("▲ Aliased     https://my-project.vercel.app\n✓ Done");
    const state = makeState({
      platforms: { vercel: { projectName: "my-project", baseUrl: "https://my-project.vercel.app" } },
    });
    await vercelDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('--project "my-project"');
  });

  it("falls back to last line when no Aliased line", async () => {
    const output = [
      "Deploying user/my-project",
      "✓ Ready in 5s",
    ].join("\n");
    const mockExec = asyncExec(output);

    const result = await vercelDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("✓ Ready in 5s");
  });

  it("runs from hubDir so Vercel finds .vercel/project.json in cwd", async () => {
    const mockExec = asyncExec("▲ Aliased     https://x.vercel.app");
    await vercelDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expectCwd(mockExec, 0, "/tmp/hub");
  });

  it("uses . as deploy path, not absolute hubDir", async () => {
    const mockExec = asyncExec("▲ Aliased     https://x.vercel.app");
    await vercelDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain(" .");
    expect(cmd).not.toContain('"/tmp/hub"');
  });

  it("ignores an invalid projectName from state and deploys without --project", async () => {
    const mockExec = asyncExec("▲ Aliased     https://x.vercel.app");
    const state = makeState({
      platforms: { vercel: { projectName: '"; rm -rf ~; "', baseUrl: "https://x.vercel.app" } },
    });
    await vercelDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).not.toContain("--project");
  });
});

describe("cloudflareDeployer", () => {
  it("creates project on first deploy and extracts URL", async () => {
    const mockExec = vi.fn();
    // First call: project create (rejects — project may already exist)
    mockExec.mockRejectedValueOnce(new Error("already exists"));
    // Second call: pages deploy
    mockExec.mockResolvedValueOnce("https://pi-artifacts-test.sam.pages.dev");

    const result = await cloudflareDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("https://pi-artifacts-test.sam.pages.dev");
    expect(result.projectName).toBeDefined();
  });

  it("reuses existing projectName", async () => {
    const mockExec = asyncExec("https://existing-project.sam.pages.dev");
    const state = makeState({
      platforms: { cloudflare: { projectName: "existing-project", baseUrl: "https://existing-project.sam.pages.dev" } },
    });
    const result = await cloudflareDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    expect(result.projectName).toBe("existing-project");
    // Should NOT try to create project again
    const calls = mockExec.mock.calls;
    expect(calls.every((c) => !(c[0] as string).includes("project create"))).toBe(true);
  });

  it("runs from hubDir", async () => {
    const mockExec = asyncExec("https://x.pages.dev");
    const state = makeState({
      platforms: { cloudflare: { projectName: "x", baseUrl: "https://x.pages.dev" } },
    });
    await cloudflareDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    expectCwd(mockExec, 0, "/tmp/hub");
  });

  it("uses . as deploy path", async () => {
    const mockExec = asyncExec("https://x.pages.dev");
    const state = makeState({
      platforms: { cloudflare: { projectName: "x", baseUrl: "https://x.pages.dev" } },
    });
    await cloudflareDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain(" . ");
    expect(cmd).not.toContain('"/tmp/hub"');
  });

  it("ignores an invalid projectName from state and re-derives it", async () => {
    const mockExec = vi.fn();
    // First call: project create with re-derived name (rejects — may exist)
    mockExec.mockRejectedValueOnce(new Error("already exists"));
    // Second call: pages deploy
    mockExec.mockResolvedValueOnce("https://pi-artifacts-project.sam.pages.dev");
    const state = makeState({
      platforms: { cloudflare: { projectName: '"; rm -rf ~; "', baseUrl: "https://x.pages.dev" } },
    });
    const result = await cloudflareDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    // The create command must NOT contain the injected projectName
    const createCmd = mockExec.mock.calls[0][0] as string;
    expect(createCmd).not.toContain('rm -rf');
    expect(result.projectName).toBeDefined();
  });

  it("rethrows non-\"already exists\" errors from project create", async () => {
    const mockExec = vi.fn();
    // First call: project create fails with an auth error
    mockExec.mockRejectedValueOnce(new Error("authentication failed: invalid token"));
    await expect(
      cloudflareDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec),
    ).rejects.toThrow("authentication failed");
  });
});

describe("netlifyDeployer", () => {
  it("parses JSON output", async () => {
    const json = JSON.stringify({
      deploy_url: "https://my-site.netlify.app",
      site_id: "abc-123",
      name: "my-site",
    });
    const mockExec = asyncExec(json);

    const result = await netlifyDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec);
    expect(result.baseUrl).toBe("https://my-site.netlify.app");
    expect(result.projectName).toBe("abc-123");
  });

  it("uses --site flag when projectName exists", async () => {
    const mockExec = asyncExec(JSON.stringify({ deploy_url: "https://x.netlify.app" }));
    const state = makeState({
      platforms: { netlify: { projectName: "my-site", baseUrl: "https://my-site.netlify.app" } },
    });
    await netlifyDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('--site "my-site"');
    expect(cmd).not.toContain("--site-name");
  });

  it("throws with raw output when JSON parse fails", async () => {
    const raw = "Deploying...\nhttps://my-site.netlify.app\nDone";
    const mockExec = asyncExec(raw);
    await expect(
      netlifyDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec),
    ).rejects.toThrow(/not valid JSON/);
  });

  it("throws with raw output when JSON is valid but URL fields are missing", async () => {
    const mockExec = asyncExec(JSON.stringify({ name: "my-site" }));
    await expect(
      netlifyDeployer.deployHub("/tmp/hub", "/project", makeState(), mockExec),
    ).rejects.toThrow(/missing URL/);
  });

  it("runs from hubDir", async () => {
    const mockExec = asyncExec(JSON.stringify({ deploy_url: "https://x.netlify.app" }));
    const state = makeState({
      platforms: { netlify: { projectName: "my-site", baseUrl: "https://my-site.netlify.app" } },
    });
    await netlifyDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    expectCwd(mockExec, 0, "/tmp/hub");
  });

  it("uses . as --dir path", async () => {
    const mockExec = asyncExec(JSON.stringify({ deploy_url: "https://x.netlify.app" }));
    const state = makeState({
      platforms: { netlify: { projectName: "my-site", baseUrl: "https://my-site.netlify.app" } },
    });
    await netlifyDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("--dir .");
    expect(cmd).not.toContain('"/tmp/hub"');
  });

  it("ignores an invalid projectName from state and falls back to --site-name", async () => {
    const mockExec = asyncExec(JSON.stringify({ deploy_url: "https://x.netlify.app" }));
    const state = makeState({
      platforms: { netlify: { projectName: '"; rm -rf ~; "', baseUrl: "https://x.netlify.app" } },
    });
    await netlifyDeployer.deployHub("/tmp/hub", "/project", state, mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).not.toContain("--site \"");
    expect(cmd).not.toContain('rm -rf');
    expect(cmd).toContain("--site-name");
  });
});

describe("githubDeployer", () => {
  it("constructs URL from git remote", async () => {
    const hub = join(tmpDir, "hub");
    mkdirSync(hub, { recursive: true });
    const mockExec = vi.fn();
    mockExec.mockResolvedValueOnce(""); // npx gh-pages
    mockExec.mockResolvedValueOnce("git@github.com:user/my-repo.git"); // git remote

    const result = await githubDeployer.deployHub(hub, tmpDir, makeState(), mockExec);
    expect(result.baseUrl).toBe("https://user.github.io/my-repo/");
  });

  it("writes .nojekyll file in hub dir", async () => {
    const hub = join(tmpDir, "hub");
    mkdirSync(hub, { recursive: true });
    const mockExec = vi.fn();
    mockExec.mockResolvedValueOnce("");
    mockExec.mockResolvedValueOnce("git@github.com:user/repo.git");

    await githubDeployer.deployHub(hub, tmpDir, makeState(), mockExec);
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(hub, ".nojekyll"))).toBe(true);
  });

  it("runs gh-pages from hubDir", async () => {
    const hub = join(tmpDir, "hub");
    mkdirSync(hub, { recursive: true });
    const mockExec = vi.fn();
    mockExec.mockResolvedValueOnce("");
    mockExec.mockResolvedValueOnce("git@github.com:user/repo.git");

    await githubDeployer.deployHub(hub, tmpDir, makeState(), mockExec);
    expectCwd(mockExec, 0, hub);
  });

  it("uses . as -d path for gh-pages", async () => {
    const hub = join(tmpDir, "hub");
    mkdirSync(hub, { recursive: true });
    const mockExec = vi.fn();
    mockExec.mockResolvedValueOnce("");
    mockExec.mockResolvedValueOnce("git@github.com:user/repo.git");

    await githubDeployer.deployHub(hub, tmpDir, makeState(), mockExec);
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("-d .");
    expect(cmd).not.toContain(`"${hub}"`);
  });
});
describe("resolvePlatformChoice", () => {
  const all = [vercelDeployer, cloudflareDeployer, netlifyDeployer, githubDeployer];

  it("uses the preferred platform when it is installed", () => {
    const result = resolvePlatformChoice({
      preferred: "netlify",
      available: all,
    });
    expect(result).toEqual({ kind: "use", deployer: netlifyDeployer });
  });

  it("returns unavailable when the preferred platform is not installed", () => {
    const result = resolvePlatformChoice({
      preferred: "netlify",
      available: [vercelDeployer, cloudflareDeployer],
    });
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("reuses the existing artifact platform when still installed", () => {
    const result = resolvePlatformChoice({
      existing: "cloudflare",
      available: all,
    });
    expect(result).toEqual({ kind: "use", deployer: cloudflareDeployer });
  });

  it("falls back to first available when existing platform is no longer installed", () => {
    const result = resolvePlatformChoice({
      existing: "netlify",
      available: [vercelDeployer, cloudflareDeployer],
    });
    expect(result).toEqual({ kind: "use", deployer: vercelDeployer });
  });

  it("uses the remembered session choice without re-prompting", () => {
    const result = resolvePlatformChoice({
      sessionChoice: "github",
      available: all,
    });
    expect(result).toEqual({ kind: "use", deployer: githubDeployer });
  });

  it("auto-picks the only available deployer instead of prompting", () => {
    const result = resolvePlatformChoice({
      available: [vercelDeployer],
    });
    expect(result).toEqual({ kind: "use", deployer: vercelDeployer });
  });

  it("asks the user when several deployers are available and nothing is chosen", () => {
    const result = resolvePlatformChoice({
      available: [vercelDeployer, cloudflareDeployer, netlifyDeployer],
    });
    expect(result).toEqual({
      kind: "ask",
      options: [vercelDeployer, cloudflareDeployer, netlifyDeployer],
    });
  });

  it("ignores a stale session choice that is no longer installed and asks", () => {
    const result = resolvePlatformChoice({
      sessionChoice: "netlify",
      available: [vercelDeployer, cloudflareDeployer],
    });
    expect(result).toEqual({
      kind: "ask",
      options: [vercelDeployer, cloudflareDeployer],
    });
  });
});
