import type { Deployer } from "./types.js";
import { which, projectNameFromCwd } from "../helpers.js";

export const netlifyDeployer: Deployer = {
  name: "netlify",
  label: "Netlify",
  check: () => which("netlify"),
  deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.netlify;

    const siteNameFlag = info?.projectName
      ? `--site "${info.projectName}"`
      : `--site-name "${projectNameFromCwd(cwd)}"`;

    const out = execFn(
      `netlify deploy --prod --dir "${hubDir}" ${siteNameFlag} --json`,
      cwd
    );

    let baseUrl: string;
    let projectName: string | undefined;
    try {
      const parsed = JSON.parse(out);
      baseUrl = parsed.deploy_url ?? parsed.ssl_url ?? parsed.url;
      projectName = parsed.site_id ?? parsed.name ?? info?.projectName;
    } catch {
      const urlMatch = out.match(/https:\/\/[^\s]+netlify\.app/);
      baseUrl = urlMatch?.[0] ?? out.split("\n").filter(Boolean).pop()!;
      projectName = info?.projectName;
    }

    return { baseUrl, projectName };
  },
};
