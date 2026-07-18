---
name: artifacts
description: Deploy HTML pages to live URLs on Vercel, Cloudflare Pages, Netlify, or GitHub Pages. Use when the user asks for a visual, interactive, or shareable page — anything easier to look at in a browser than to read as terminal text.
---

# Artifacts

Use this skill when the user asks for a visual, interactive, or shareable page — anything that is easier to look at in a browser than to read as terminal text.

## When to use artifacts

Produce an HTML page and call `publish_artifact` when the user asks for:

- **Walk through a change**: annotated diffs, PR reviews with inline comments, design change walkthroughs
- **Compare alternatives**: multiple layouts, API shapes, or implementation plans side by side
- **Dashboards**: deploy failures by service, test results, build status, investigation timelines
- **Interactive controls**: sliders, toggles, input fields bound to parameters the user is tuning
- **Progress tracking**: checklists that fill in as work progresses, migration trackers
- **Shareable output**: anything the user might want to send a teammate a link to instead of pasting terminal output

## How to use

1. Build the HTML page with inline CSS and JavaScript (no external dependencies — everything self-contained)
2. Call `publish_artifact` with the HTML content and a descriptive title
3. The tool returns a live URL — share it with the user
4. To update an existing artifact, call `publish_artifact` again with the same title

## Supported platforms

- **Vercel** — requires `vercel` CLI installed and authenticated
- **Cloudflare Pages** — requires `wrangler` CLI installed and authenticated
- **Netlify** — requires `netlify-cli` installed and authenticated
- **GitHub Pages** — requires `npx` (ships with npm) and a git repo with a GitHub remote

The tool auto-detects which CLIs are available. Specify a platform explicitly to override.

## Guidelines

- Keep pages self-contained: inline all CSS and JS, embed images as data URIs
- Use semantic HTML and responsive design
- For interactive pages, prefer vanilla JS or minimal inline libraries
- Add a "Copy as prompt" or export button when the page is a decision tool the user wants to bring back to the session
- Use the title to describe what the page shows (e.g., "Deploy failures by service", "PR #42 review")
