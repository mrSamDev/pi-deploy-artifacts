import type { Deployer } from "./types.js";
import { which } from "../helpers.js";

export const cloudflareDeployer: Deployer = {
  name: "cloudflare",
  label: "Cloudflare Pages",
  check: () => which("wrangler"),
  deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.cloudflare;
    let projectName = info?.projectName;

    if (!projectName) {
      projectName = `pi-artifacts-${cwd.replace(/[^a-zA-Z0-9]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}`;
      try {
        execFn(`wrangler pages project create "${projectName}"`, cwd);
      } catch {
        // Project may already exist
      }
    }

    const out = execFn(
      `wrangler pages deploy "${hubDir}" --project-name "${projectName}" --force`,
      cwd
    );
    const urlMatch = out.match(/https:\/\/[^\s]+pages\.dev/);
    const baseUrl = urlMatch?.[0] ?? out.split("\n").filter(Boolean).pop()!;
    return { baseUrl, projectName };
  },
};
