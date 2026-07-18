import type { Deployer, DeployResult } from "./types.js";
import { which } from "../helpers.js";

export const vercelDeployer: Deployer = {
  name: "vercel",
  label: "Vercel",
  check: () => which("vercel"),
  deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.vercel;
    const projectFlag = info?.projectName
      ? `--project "${info.projectName}"`
      : "";
    const out = execFn(
      `vercel deploy --prod --yes ${projectFlag} "${hubDir}"`,
      cwd
    );
    const lines = out.split("\n").filter(Boolean);
    const aliasLine = lines.find((l) => l.startsWith("▲ Aliased"));
    const url = aliasLine
      ? aliasLine.replace("▲ Aliased ", "").trim()
      : lines[lines.length - 1]!;
    return { baseUrl: url, projectName: info?.projectName };
  },
};
