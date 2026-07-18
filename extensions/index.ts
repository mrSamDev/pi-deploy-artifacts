import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { slugify, exec } from "./helpers.js";
import { hubDir, loadState, saveState } from "./state.js";
import { deployers } from "./deployers/index.js";
import type { Deployer } from "./deployers/types.js";

const SETTINGS_FILE = join(homedir(), ".pi", "agent", "settings.json");

function isAutoConfirm(): boolean {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    return settings.artifacts?.autoConfirm === true;
  } catch {
    return false;
  }
}

function pickDeployer(
  preferredPlatform: string | undefined,
  existing: { platform: string } | undefined,
  available: Deployer[]
): Deployer | null {
  if (preferredPlatform) {
    const d = available.find((d) => d.name === preferredPlatform);
    return d ?? null;
  }
  if (existing) {
    return available.find((d) => d.name === existing.platform) ?? available[0];
  }
  return available[0];
}

function noCliMessage(): string {
  return (
    "No deployment CLI found. Install one:\n" +
    "  \u2022 Vercel:       npm i -g vercel && vercel login\n" +
    "  \u2022 Cloudflare:   npm i -g wrangler && wrangler login\n" +
    "  \u2022 Netlify:      npm i -g netlify-cli && netlify login\n" +
    "  \u2022 GitHub Pages: npx gh-pages (in a git repo with GitHub remote)"
  );
}

function writeArtifact(hubDirPath: string, slug: string, html: string): void {
  const artifactDir = join(hubDirPath, slug);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "index.html"), html);
}

function updatePlatformState(
  state: { platforms: Record<string, any> },
  platform: string,
  baseUrl: string,
  projectName?: string
): void {
  if (!state.platforms[platform]) {
    state.platforms[platform] = {};
  }
  if (projectName) {
    state.platforms[platform].projectName = projectName;
  }
  state.platforms[platform].baseUrl = baseUrl;
}

export default function (pi: ExtensionAPI) {
  let sessionConfirmed = false;

  pi.registerTool({
    name: "publish_artifact",
    label: "Publish Artifact",
    description:
      "Deploy an HTML page to a live URL on Vercel, Cloudflare Pages, Netlify, or GitHub Pages. " +
      "All artifacts on the same platform share one project \u2014 each gets its own path (e.g., /my-title/). " +
      "Call with the same title to update an existing artifact in place.",
    promptSnippet: "Deploy HTML to a live URL on Vercel/Cloudflare/Netlify/GitHub Pages",
    promptGuidelines: [
      "Use publish_artifact when the user asks for a visual, interactive, or shareable page \u2014 anything easier to look at in a browser than to read as terminal text.",
      "Build self-contained HTML with inline CSS and JS, embed images as data URIs.",
      "Call publish_artifact with the same title to update an existing artifact in place.",
    ],
    parameters: Type.Object({
      html: Type.String({ description: "Full self-contained HTML content to deploy" }),
      title: Type.String({ description: "Artifact title. Use the same title to update an existing artifact." }),
      platform: Type.Optional(
        StringEnum(["vercel", "cloudflare", "netlify", "github"] as const, {
          description: "Deployment platform. Auto-detected from installed CLIs if omitted.",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { html, title, platform: preferredPlatform } = params;

      const state = loadState(ctx.cwd);
      const existing = state.artifacts[title];

      const available = deployers.filter((d) => d.check());
      if (available.length === 0) {
        return { content: [{ type: "text", text: noCliMessage() }], isError: true };
      }

      const deployer = pickDeployer(preferredPlatform, existing, available);
      if (!deployer) {
        return {
          content: [{ type: "text", text: `Platform "${preferredPlatform}" not available. Install its CLI first.` }],
          isError: true,
        };
      }

      if (!existing && !sessionConfirmed && !isAutoConfirm()) {
        const ok = await ctx.ui.confirm(
          "Publish Artifact",
          `Deploy "${title}" to ${deployer.label}?\nThis will create a public URL.`
        );
        if (!ok) {
          return { content: [{ type: "text", text: "Artifact publishing cancelled." }] };
        }
        sessionConfirmed = true;
      }

      const slug = existing?.slug ?? slugify(title);
      const hubDirPath = hubDir(ctx.cwd, deployer.name);
      writeArtifact(hubDirPath, slug, html);

      onUpdate?.(`Deploying to ${deployer.label}...`);

      try {
        const result = deployer.deployHub(hubDirPath, ctx.cwd, state, exec);

        const baseUrl = result.baseUrl.replace(/\/$/, "");
        const url = `${baseUrl}/${slug}/`;

        updatePlatformState(state, deployer.name, baseUrl, result.projectName);

        state.artifacts[title] = {
          id: existing?.id ?? randomUUID(),
          url,
          platform: deployer.name,
          slug,
        };
        saveState(state, ctx.cwd);

        const verb = existing ? "Updated" : "Published";
        return { content: [{ type: "text", text: `${verb} artifact "${title}" \u2192 ${url}` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Deploy failed: ${msg}` }], isError: true };
      }
    },
  });
}
