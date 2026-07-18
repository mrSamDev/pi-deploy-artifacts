import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  artifactsDir,
  hubDir,
  stateFile,
  loadState,
  saveState,
} from "../extensions/state.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "pi-artifacts-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("path helpers", () => {
  it("artifactsDir returns .pi/artifacts under cwd", () => {
    expect(artifactsDir("/project")).toBe("/project/.pi/artifacts");
  });

  it("hubDir returns .pi/artifacts/hub/<platform>", () => {
    expect(hubDir("/project", "vercel")).toBe("/project/.pi/artifacts/hub/vercel");
    expect(hubDir("/project", "cloudflare")).toBe("/project/.pi/artifacts/hub/cloudflare");
  });

  it("stateFile returns .pi/artifacts/state.json", () => {
    expect(stateFile("/project")).toBe("/project/.pi/artifacts/state.json");
  });
});

describe("loadState", () => {
  it("returns empty state when file does not exist", () => {
    const state = loadState(tmp);
    expect(state.artifacts).toEqual({});
    expect(state.platforms).toEqual({});
  });

  it("returns empty state on corrupt JSON", () => {
    const f = stateFile(tmp);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, "not-json");
    const state = loadState(tmp);
    expect(state.artifacts).toEqual({});
  });

  it("loads saved state", () => {
    const expected = {
      artifacts: {
        dashboard: { id: "abc", url: "https://x.vercel.app/dashboard/", platform: "vercel", slug: "dashboard" },
      },
      platforms: {
        vercel: { projectName: "my-project", baseUrl: "https://x.vercel.app" },
      },
    };
    saveState(expected as any, tmp);
    const loaded = loadState(tmp);
    expect(loaded).toEqual(expected);
  });
});

describe("saveState", () => {
  it("creates parent directories", () => {
    const deep = join(tmp, "a", "b", "c");
    saveState({ artifacts: {}, platforms: {} }, deep);
    expect(existsSync(stateFile(deep))).toBe(true);
  });

  it("writes valid JSON", () => {
    saveState({ artifacts: {}, platforms: {} }, tmp);
    const raw = readFileSync(stateFile(tmp), "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
