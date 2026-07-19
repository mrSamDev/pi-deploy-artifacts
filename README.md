# pi-deploy-artifacts

Deploy HTML pages to live URLs on **Vercel**, **Cloudflare Pages**, **Netlify**, or **GitHub Pages** — like Claude Code artifacts for pi.

Ask pi to build a dashboard, annotated diff, comparison layout, or interactive page, and it deploys to a real URL you can share.

## Install

```bash
pi install npm:@mrsamdev/pi-deploy-artifacts
```

To try it for a single run without adding it to your Pi settings:

```bash
pi -e npm:@mrsamdev/pi-deploy-artifacts
```

Or install directly from GitHub:

```bash
pi install git:github.com/mrSamDev/pi-deploy-artifacts
```

## Links

- GitHub: https://github.com/mrSamDev/pi-deploy-artifacts
- npm: https://www.npmjs.com/package/@mrsamdev/pi-deploy-artifacts

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

## Troubleshooting

### Vercel: deployed URL shows a login page or 404

If `publish_artifact` returns a Vercel URL that redirects to `vercel.com/login` (or shows `404: NOT_FOUND`), the project has **SSO Deployment Protection** enabled. This puts every deployment behind a Vercel login wall so the artifact isn't publicly viewable.

Check and disable it:

```bash
# From your project's .pi/artifacts/hub/vercel directory
cd .pi/artifacts/hub/vercel

# Check current protection settings
vercel project protection vercel

# Disable SSO protection so deployments are public
vercel project protection disable vercel --sso
```

After disabling, both the preview deployment URL and the production alias URL will serve your artifact publicly:

```
https://<project>.vercel.app/<slug>/   ✅ works
```

> **Note:** This is a per-project setting. If you re-enable SSO protection on the project via the Vercel dashboard, `publish_artifact` will break again the same way.

## Settings

To skip the confirmation prompt, add to `~/.pi/agent/settings.json`:

```json
{
  "artifacts": { "autoConfirm": true }
}
```

## Testing

Unit tests run offline with mocked CLI calls:

```bash
pnpm test
```

Integration tests deploy `artifact-flow.html` (a self-contained HTML page at the
repo root) to live Vercel, Cloudflare, and Netlify accounts, then fetch each URL
to verify the content survived the round-trip. They require authenticated CLIs:

```bash
pnpm test:integration
```

## Package structure

```
pi-deploy-artifacts/
├── package.json              # pi manifest
├── vitest.config.ts
├── extensions/
│   ├── index.ts              # Extension entry point (publish_artifact tool)
│   ├── types.ts              # Shared types
│   ├── helpers.ts            # Pure functions (slugify, remoteToPagesUrl, which, execAsync)
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
│   ├── deployers.test.ts
│   └── deploy.integration.test.ts
├── artifact-flow.html        # Integration test fixture (self-contained HTML page)
└── README.md
```

## License

MIT
