import type { Deployer } from "./types.js";
import { which } from "../helpers.js";

export const cloudflareDeployer: Deployer = {
  name: "cloudflare",
  label: "Cloudflare Pages",
  check: () => which("wrangler"),
  async deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.cloudflare;
    let projectName = info?.projectName;

    if (!projectName) {
      projectName = `pi-artifacts-${cwd.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`;
      try {
        // Run from hubDir for consistency
        await execFn(`wrangler pages project create "${projectName}"`, hubDir);
      } catch {
        // Project may already exist
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