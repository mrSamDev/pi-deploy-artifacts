import type { Deployer } from "./types.js";
import { which, projectNameFromCwd, isValidProjectName } from "../helpers.js";

export const netlifyDeployer: Deployer = {
  name: "netlify",
  label: "Netlify",
  check: () => which("netlify"),
  async deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.netlify;

    const siteNameFlag = isValidProjectName(info?.projectName)
      ? `--site "${info.projectName}"`
      : `--site-name "${projectNameFromCwd(cwd)}"`;

    // Run from hubDir so Netlify finds .netlify config in cwd
    const out = await execFn(
      `netlify deploy --prod --dir . ${siteNameFlag} --json`,
      hubDir
    );

    let parsed: Record<string, string | undefined>;
    try {
      parsed = JSON.parse(out);
    } catch {
      throw new Error(`Netlify deploy output was not valid JSON. Raw output:\n${out}`);
    }

    const baseUrl = parsed.deploy_url ?? parsed.ssl_url ?? parsed.url;
    if (!baseUrl) {
      throw new Error(`Netlify deploy output missing URL. Raw output:\n${out}`);
    }
    const projectName = parsed.site_id ?? parsed.name ?? info?.projectName;

    return { baseUrl, projectName };
  },
};