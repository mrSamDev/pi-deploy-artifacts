import type { Deployer } from "./types.js";
import { which, isValidProjectName, projectNameFromCwd } from "../helpers.js";

export const cloudflareDeployer: Deployer = {
  name: "cloudflare",
  label: "Cloudflare Pages",
  check: () => which("wrangler"),
  async deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.cloudflare;
    let projectName = isValidProjectName(info?.projectName) ? info.projectName : undefined;

    if (!projectName) {
      projectName = projectNameFromCwd(cwd);
      try {
        // Run from hubDir for consistency
        await execFn(`wrangler pages project create "${projectName}"`, hubDir);
      } catch (err) {
        // "already exists" is expected when reusing a project; anything else
        // (auth failure, quota, network) must surface, not get swallowed.
        const msg = err instanceof Error ? err.message : String(err);
        if (!/already exists/i.test(msg)) throw err;
      }
    }

    // Run from hubDir so wrangler finds config in cwd
    const out = await execFn(
      `wrangler pages deploy . --project-name "${projectName}" --force`,
      hubDir
    );
    const urlMatch = out.match(/https:\/\/[^\s]+pages\.dev/);
    const baseUrl = urlMatch?.[0] ?? out.split("\n").filter(Boolean).pop()!;
    return { baseUrl, projectName };
  },
};