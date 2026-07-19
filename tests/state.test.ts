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
  withLock,
  LockError,
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

  it("does not leave a temp file after successful write", () => {
    saveState({ artifacts: {}, platforms: {} }, tmp);
    expect(existsSync(stateFile(tmp) + ".tmp")).toBe(false);
    expect(existsSync(stateFile(tmp))).toBe(true);
  });
});

describe("withLock", () => {
  it("executes the function and releases the lock", async () => {
    const result = await withLock(tmp, async () => 42);
    expect(result).toBe(42);
    expect(existsSync(join(artifactsDir(tmp), ".lock"))).toBe(false);
  });

  it("writes the current PID into the lock file while held", async () => {
    let pidSeen: string | undefined;
    await withLock(tmp, async () => {
      pidSeen = readFileSync(join(artifactsDir(tmp), ".lock"), "utf-8").trim();
    });
    expect(pidSeen).toBe(String(process.pid));
  });

  it("throws LockError when a live lock is held", async () => {
    const lockPath = join(artifactsDir(tmp), ".lock");
    mkdirSync(artifactsDir(tmp), { recursive: true });
    // Write our own PID — process.kill(pid, 0) will confirm we're alive
    writeFileSync(lockPath, String(process.pid));
    await expect(withLock(tmp, async () => 1)).rejects.toThrow(LockError);
  });

  it("acquires a stale lock (dead PID)", async () => {
    const lockPath = join(artifactsDir(tmp), ".lock");
    mkdirSync(artifactsDir(tmp), { recursive: true });
    // PID 999999 is very unlikely to exist
    writeFileSync(lockPath, "999999");
    const result = await withLock(tmp, async () => 42);
    expect(result).toBe(42);
  });

  it("releases the lock even if the function throws", async () => {
    await expect(
      withLock(tmp, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(join(artifactsDir(tmp), ".lock"))).toBe(false);
  });
});
