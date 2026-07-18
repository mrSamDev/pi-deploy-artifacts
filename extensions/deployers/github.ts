import type { Deployer } from "./types.js";
import { which, remoteToPagesUrl } from "../helpers.js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export const githubDeployer: Deployer = {
  name: "github",
  label: "GitHub Pages",
  check: () => which("npx") && isGitRepo(),
  deployHub(hubDir, cwd, state, execFn) {
    writeFileSync(join(hubDir, ".nojekyll"), "");
    execFn(`npx gh-pages -d "${hubDir}" --nojekyll -m "pi-artifacts update"`, cwd);
    const remoteUrl = execFn("git remote get-url origin", cwd);
    const baseUrl = remoteToPagesUrl(remoteUrl);
    return { baseUrl };
  },
};

function isGitRepo(): boolean {
  try {
    execSync("git rev-parse --git-dir", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
