import type { Deployer } from "./types.js";
import { vercelDeployer } from "./vercel.js";
import { cloudflareDeployer } from "./cloudflare.js";
import { netlifyDeployer } from "./netlify.js";
import { githubDeployer } from "./github.js";

export const deployers: Deployer[] = [
  vercelDeployer,
  cloudflareDeployer,
  netlifyDeployer,
  githubDeployer,
];

export type { Deployer, DeployResult } from "./types.js";
