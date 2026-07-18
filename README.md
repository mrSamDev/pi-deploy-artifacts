# pi-artifacts

Deploy HTML pages to live URLs on **Vercel**, **Cloudflare Pages**, **Netlify**, or **GitHub Pages** — like Claude Code artifacts for pi.

Ask pi to build a dashboard, annotated diff, comparison layout, or interactive page, and it deploys to a real URL you can share.

## Install

```bash
pi install git:github.com/mrSamDev/pi-artifacts
```

Or test without installing:

```bash
pi -e ./path/to/pi-artifacts/extensions/index.ts
```

## Links

- GitHub: https://github.com/mrSamDev/pi-artifacts

## Prerequisites

Install at least one deployment CLI and authenticate:

```bash
# Vercel
npm i -g vercel && vercel login

# Cloudflare Pages
npm i -g wrangler && wrangler login

# Netlify
npm i -g netlify-cli && netlify login

# GitHub Pages (no CLI install needed — uses npx)
# Requires a git repo with a GitHub remote
```

## Usage

Ask pi to build something visual:

> "Build a dashboard of our open PRs and publish it as an artifact"

> "Make an artifact that walks through this diff with annotations"

> "Create a comparison page of these three layout options"

Pi will:
1. Build a self-contained HTML page
2. Call `publish_artifact` to deploy it
3. Return a live URL

Call with the same title to update an existing artifact in place.

## How it works

- All artifacts on the same platform share **one project** — each gets its own path
- HTML files stored in `.pi/artifacts/hub/<platform>/<slug>/index.html`
- Runs the platform CLI to deploy the entire hub directory
- Tracks artifacts by title in `.pi/artifacts/state.json`
- Confirms before first deploy per session

### URL structure

| Platform | Example URL |
|----------|-------------|
| Vercel | `https://my-project.vercel.app/my-slug/` |
| Cloudflare Pages | `https://my-project.pages.dev/my-slug/` |
| Netlify | `https://my-site.netlify.app/my-slug/` |
| GitHub Pages | `https://user.github.io/repo/my-slug/` |

## Settings

To skip the confirmation prompt, add to `~/.pi/agent/settings.json`:

```json
{
  "artifacts": { "autoConfirm": true }
}
```

## Package structure

```
pi-artifacts/
├── package.json              # pi manifest
├── vitest.config.ts
├── extensions/
│   ├── index.ts              # Extension entry point (publish_artifact tool)
│   ├── types.ts              # Shared types
│   ├── helpers.ts            # Pure functions (slugify, remoteToPagesUrl, which, exec)
│   ├── state.ts              # State load/save, path helpers
│   └── deployers/
│       ├── index.ts          # Deployer registry
│       ├── types.ts          # Deployer interface
│       ├── vercel.ts
│       ├── cloudflare.ts
│       ├── netlify.ts
│       └── github.ts
├── skills/
│   └── artifacts/
│       └── SKILL.md          # Teaches LLM when to use artifacts
├── tests/
│   ├── helpers.test.ts
│   ├── state.test.ts
│   └── deployers.test.ts
└── README.md
```

## License

MIT
