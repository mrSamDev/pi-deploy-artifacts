import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  writeFileSync(f, JSON.stringify(state, null, 2));
}
