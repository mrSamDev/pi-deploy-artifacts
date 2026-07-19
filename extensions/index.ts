import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { slugify, execAsync } from "./helpers.js";
import { hubDir, loadState, saveState, withLock } from "./state.js";
import { deployers } from "./deployers/index.js";
import type { Deployer } from "./deployers/types.js";
import type { ArtifactState, Platform } from "./types.js";
import { resolvePlatformChoice } from "./resolvePlatform.js";

const SETTINGS_FILE = join(homedir(), ".pi", "agent", "settings.json");

function isAutoConfirm(): boolean {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
    return settings.artifacts?.autoConfirm === true;
  } catch {
    return false;
  }
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

function textResult(text: string): AgentToolResult<undefined> {
  return {
    content: [{ type: "text" as const, text }],
    details: undefined,
  };
}

function updatePlatformState(
  state: ArtifactState,
  platform: Platform,
  baseUrl: string,
  projectName?: string,
): void {
  if (!state.platforms[platform]) {
    state.platforms[platform] = {};
  }
  const info = state.platforms[platform]!;
  if (projectName) {
    info.projectName = projectName;
  }
  info.baseUrl = baseUrl;
}

export default function (pi: ExtensionAPI) {
  let sessionConfirmed = false;
  let sessionPreferredPlatform: string | undefined;

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
      "If the user has a preferred hosting platform, pass it via `platform`; otherwise the user picks interactively when several CLIs are installed.",
    ],
    parameters: Type.Object({
      html: Type.String({ description: "Full self-contained HTML content to deploy" }),
      title: Type.String({ description: "Artifact title. Use the same title to update an existing artifact." }),
      platform: Type.Optional(
        StringEnum(["vercel", "cloudflare", "netlify", "github"] as const, {
          description: "Deployment platform. Auto-detected from installed CLIs if omitted. When multiple are installed, the user is prompted to choose.",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { html, title, platform: preferredPlatform } = params;

      // ── CLI check + platform resolution + user prompts (outside the lock) ─
      // The lock is only held for the read-modify-write on state.json, not
      // while the user is sitting at a prompt.

      const available = deployers.filter((d) => d.check());
      if (available.length === 0) {
        throw new Error(noCliMessage());
      }

      const preState = loadState(ctx.cwd);
      const preExisting = preState.artifacts[title];

      const choice = resolvePlatformChoice({
        preferred: preferredPlatform,
        existing: preExisting?.platform,
        sessionChoice: sessionPreferredPlatform,
        available,
      });

      if (choice.kind === "unavailable") {
        throw new Error(`Platform "${preferredPlatform}" not available. Install its CLI first.`);
      }

      let deployer: Deployer;
      if (choice.kind === "use") {
        deployer = choice.deployer;
      } else {
        // choice.kind === "ask" — options is always non-empty (available.length > 0)
        deployer = choice.options[0];
        if (ctx.hasUI && choice.options.length > 1) {
          const labels = choice.options.map((d) => d.label);
          const picked = await ctx.ui.select("Choose deployment platform", labels);
          if (picked) {
            const d = choice.options.find((d) => d.label === picked);
            if (d) {
              deployer = d;
              sessionPreferredPlatform = d.name;
            }
          }
        }
      }

      if (!preExisting && !sessionConfirmed && !isAutoConfirm()) {
        const ok = await ctx.ui.confirm(
          "Publish Artifact",
          `Deploy "${title}" to ${deployer.label}?\nThis will create a public URL.`
        );
        if (!ok) {
          return textResult("Artifact publishing cancelled.");
        }
        sessionConfirmed = true;
      }

      // ── Read-modify-write on state.json (inside the lock) ──
      return withLock(ctx.cwd, async () => {
        // Re-load — state may have changed while we prompted the user.
        const state = loadState(ctx.cwd);
        const existing = state.artifacts[title];

        const slug = existing?.slug ?? slugify(title);
        const hubDirPath = hubDir(ctx.cwd, deployer.name);
        writeArtifact(hubDirPath, slug, html);

        const deployLines: string[] = [];
        const execFn = (cmd: string, cwd: string) =>
          execAsync(cmd, cwd, (line) => {
            deployLines.push(line);
            const display = deployLines.slice(-5).join("\n");
            onUpdate?.(textResult(`Deploying to ${deployer.label}...\n${display}`));
          }, signal);

        try {
          const result = await deployer.deployHub(hubDirPath, ctx.cwd, state, execFn);

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
          return textResult(`${verb} artifact "${title}" \u2192 ${url}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Deploy failed: ${msg}`);
        }
      });
    },
  });
}
