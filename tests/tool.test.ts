import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { LockError } from "../extensions/state.js";

vi.mock("../extensions/helpers.js", async (importOriginal) => {
  const actual = await importOriginal() as typeof import("../extensions/helpers.js");
  return { ...actual, which: vi.fn(() => false), execAsync: vi.fn() };
});

import { which, execAsync } from "../extensions/helpers.js";
import extensionFactory from "../extensions/index.js";

let tmp: string;
let tool: any;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "pi-tool-test-"));
  const tools: any[] = [];
  extensionFactory({ registerTool: (t: any) => void tools.push(t) } as any);
  tool = tools[0];
  vi.mocked(which).mockReturnValue(false);
  vi.mocked(execAsync).mockReset();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeCtx(opts: { hasUI?: boolean; confirm?: boolean } = {}): ExtensionContext {
  return {
    cwd: tmp,
    hasUI: opts.hasUI ?? false,
    ui: {
      select: vi.fn(),
      confirm: vi.fn().mockResolvedValue(opts.confirm ?? true),
      input: vi.fn(),
      notify: vi.fn(),
      onTerminalInput: vi.fn(),
      setStatus: vi.fn(),
      setWorkingMessage: vi.fn(),
      setWorkingVisible: vi.fn(),
      setWorkingIndicator: vi.fn(),
      setHiddenThinkingLabel: vi.fn(),
      setWidget: vi.fn(),
      setFooter: vi.fn(),
      setHeader: vi.fn(),
      custom: vi.fn(),
    },
    mode: "json",
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    isProjectTrusted: () => false,
    signal: undefined,
    abort: vi.fn(),
  } as unknown as ExtensionContext;
}

function execute(html: string, title: string, ctx: ExtensionContext, platform?: string) {
  const params: any = { html, title };
  if (platform) params.platform = platform;
  return tool.execute("id", params, undefined, undefined, ctx);
}

describe("publish_artifact error handling", () => {
  it("throws when no deployment CLI is available", async () => {
    vi.mocked(which).mockReturnValue(false);
    await expect(
      execute("<p>hi</p>", "test", makeCtx())
    ).rejects.toThrow(/No deployment CLI found/);
  });

  it("throws when preferred platform is not available", async () => {
    vi.mocked(which).mockImplementation((cmd: string) => cmd === "vercel");
    await expect(
      execute("<p>hi</p>", "test", makeCtx(), "netlify")
    ).rejects.toThrow(/Platform "netlify" not available/);
  });

  it("throws when deploy fails", async () => {
    vi.mocked(which).mockReturnValue(true);
    vi.mocked(execAsync).mockRejectedValue(new Error("auth failed"));
    await expect(
      execute("<p>hi</p>", "test", makeCtx({ confirm: true }))
    ).rejects.toThrow(/Deploy failed: auth failed/);
  });

  it("throws LockError when lock is contended", async () => {
    vi.mocked(which).mockReturnValue(true);
    const lockDir = join(tmp, ".pi", "artifacts");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, ".lock"), String(process.pid));
    await expect(
      execute("<p>hi</p>", "test", makeCtx({ confirm: true }))
    ).rejects.toThrow(LockError);
  });

  it("returns normally (not throws) when user cancels", async () => {
    vi.mocked(which).mockReturnValue(true);
    const result = await execute("<p>hi</p>", "test", makeCtx({ hasUI: true, confirm: false }));
    expect(result.content[0].text).toMatch(/cancelled/i);
    expect((result as any).isError).not.toBe(true);
  });
});

describe("publish_artifact lock scope", () => {
  it("does not hold the lock during the confirm dialog", async () => {
    vi.mocked(which).mockReturnValue(true);
    vi.mocked(execAsync).mockResolvedValue("▲ Aliased     https://x.vercel.app");

    let lockExistedDuringConfirm = false;
    const ctx = makeCtx({ hasUI: true, confirm: true });
    (ctx.ui.confirm as any) = vi.fn().mockImplementation(async () => {
      lockExistedDuringConfirm = existsSync(join(tmp, ".pi", "artifacts", ".lock"));
      return true;
    });

    await execute("<p>hi</p>", "test", ctx);
    expect(lockExistedDuringConfirm).toBe(false);
  });
});

describe("publish_artifact success", () => {
  it("publishes and returns the URL", async () => {
    vi.mocked(which).mockReturnValue(true);
    vi.mocked(execAsync).mockResolvedValue("▲ Aliased     https://x.vercel.app");
    const result = await execute("<p>hi</p>", "My Page", makeCtx({ confirm: true }));
    expect(result.content[0].text).toMatch(/Published artifact "My Page"/);
    expect(result.content[0].text).toMatch(/https:\/\/x\.vercel\.app\/my-page\//);
  });
});