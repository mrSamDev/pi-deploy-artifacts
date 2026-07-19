import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  openSync,
  closeSync,
} from "node:fs";
import { join, dirname } from "node:path";
import type { ArtifactState, Platform } from "./types.js";

const CONFIG_DIR = ".pi";

export function artifactsDir(cwd: string): string {
  return join(cwd, CONFIG_DIR, "artifacts");
}

export function hubDir(cwd: string, platform: Platform): string {
  return join(artifactsDir(cwd), "hub", platform);
}

export function stateFile(cwd: string): string {
  return join(artifactsDir(cwd), "state.json");
}

export function loadState(cwd: string): ArtifactState {
  const f = stateFile(cwd);
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return { artifacts: {}, platforms: {} };
  }
}

export function saveState(state: ArtifactState, cwd: string): void {
  const f = stateFile(cwd);
  mkdirSync(dirname(f), { recursive: true });
  // Write to a temp file then rename — atomic on POSIX, so a crash
  // mid-write can't leave a truncated state.json that loadState would
  // silently swallow into an empty state.
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, f);
}

// ── Lockfile ──────────────────────────────────────────────────────────────
// Prevents two concurrent publish_artifact calls from racing on state.json
// (read-modify-write, last-write-wins, lost artifacts). Fails fast with a
// clear message — does not queue or retry.

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockError";
  }
}

function lockPath(cwd: string): string {
  return join(artifactsDir(cwd), ".lock");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock(cwd: string): void {
  const path = lockPath(cwd);
  mkdirSync(dirname(path), { recursive: true });

  // First attempt: exclusive create (O_EXCL via "wx").
  try {
    const fd = openSync(path, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }

  // Lock exists — check if it's stale (holder process is dead).
  let stalePid: number | undefined;
  try {
    stalePid = parseInt(readFileSync(path, "utf-8").trim(), 10);
  } catch {
    // Can't read the PID — treat as stale and try to reclaim.
  }

  if (stalePid && isProcessAlive(stalePid)) {
    throw new LockError(
      `Another publish_artifact is running (PID ${stalePid}). Wait for it to finish.`,
    );
  }

  // Stale or unreadable — remove and retry once.
  try {
    unlinkSync(path);
  } catch {
    // already gone
  }
  try {
    const fd = openSync(path, "wx", 0o600);
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    throw new LockError(
      `Failed to acquire lock at ${path}. Another process may have claimed it.`,
    );
  }
}

function releaseLock(cwd: string): void {
  try {
    unlinkSync(lockPath(cwd));
  } catch {
    // already gone — fine
  }
}

export async function withLock<T>(
  cwd: string,
  fn: () => Promise<T>,
): Promise<T> {
  acquireLock(cwd);
  try {
    return await fn();
  } finally {
    releaseLock(cwd);
  }
}