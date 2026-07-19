import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { slugify, execAsync } from "./helpers.js";
import { hubDir, loadState, saveState, withLock, LockError } from "./state.js";
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

// The runtime reads `isError` from the result (agent-loop.js) even though
// it's not in the AgentToolResult type definition.
type ToolResult = AgentToolResult<undefined> & { isError?: boolean };

function textResult(text: string, isError = false): ToolResult {
  return {
    content: [{ type: "text" as const, text }],
    details: undefined,
    isError,
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

      const available = deployers.filter((d) => d.check());
      if (available.length === 0) {
        return textResult(noCliMessage(), true);
      }

      try {
        return await withLock(ctx.cwd, async () => {
          const state = loadState(ctx.cwd);
          const existing = state.artifacts[title];

          const choice = resolvePlatformChoice({
            preferred: preferredPlatform,
            existing: existing?.platform,
            sessionChoice: sessionPreferredPlatform,
            available,
          });

          let deployer: Deployer | undefined;
          if (choice.kind === "unavailable") {
            return textResult(`Platform "${preferredPlatform}" not available. Install its CLI first.`, true);
          }
          if (choice.kind === "use") {
            deployer = choice.deployer;
          } else if (choice.kind === "ask") {
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
            // Non-UI mode or cancelled selection: fall back to first available.
            if (!deployer) deployer = choice.options[0];
          }

          if (!deployer) {
            return textResult("No deployer selected.", true);
          }

          if (!existing && !sessionConfirmed && !isAutoConfirm()) {
            const ok = await ctx.ui.confirm(
              "Publish Artifact",
              `Deploy "${title}" to ${deployer.label}?\nThis will create a public URL.`
            );
            if (!ok) {
              return textResult("Artifact publishing cancelled.");
            }
            sessionConfirmed = true;
          }

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
            return textResult(`Deploy failed: ${msg}`, true);
          }
        });
      } catch (err) {
        if (err instanceof LockError) {
          return textResult(err.message, true);
        }
        throw err;
      }
    },
  });
}
