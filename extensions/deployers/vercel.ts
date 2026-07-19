import type { Deployer } from "./types.js";
import { which, isValidProjectName } from "../helpers.js";

export const vercelDeployer: Deployer = {
  name: "vercel",
  label: "Vercel",
  check: () => which("vercel"),
  async deployHub(hubDir, cwd, state, execFn) {
    const info = state.platforms.vercel;
    const projectFlag = isValidProjectName(info?.projectName)
      ? `--project "${info.projectName}"`
      : "";
    // Run from hubDir so Vercel finds .vercel/project.json in cwd
    const out = await execFn(
      `vercel deploy --prod --yes ${projectFlag} .`,
      hubDir
    );
    const lines = out.split("\n").filter(Boolean);
    const aliasLine = lines.find((l) => l.startsWith("▲ Aliased"));
    const url = aliasLine
      ? aliasLine.replace("▲ Aliased ", "").trim()
      : lines[lines.length - 1]!;
    return { baseUrl: url, projectName: info?.projectName };
  },
};