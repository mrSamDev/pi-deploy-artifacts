import type { Platform } from "./types.js";

export interface DeployResult {
  baseUrl: string;
  projectName?: string;
}

/** Async shell executor. Streaming progress is wired up by the caller. */
export type AsyncExecFn = (cmd: string, cwd: string) => Promise<string>;

export interface Deployer {
  name: Platform;
  label: string;
  /** Check if this platform's CLI is available */
  check(): boolean;
  /**
   * Deploy the entire hub directory for this platform.
   * Must run from `cwd` (project root), not from hubDir.
   * `execFn` is the async shell executor (injectable for testing).
   * Returns the base URL of the deployed site.
   */
  deployHub(
    hubDir: string,
    cwd: string,
    state: { platforms: Record<string, { projectName?: string; baseUrl?: string }> },
    execFn: AsyncExecFn,
  ): Promise<DeployResult>;
}