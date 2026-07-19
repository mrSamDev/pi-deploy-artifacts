# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Validate `projectName` loaded from persistent state before interpolating into
  shell commands — prevents command injection from hand-edited `state.json`.
- Cloudflare deployer rethrows non-"already exists" errors instead of swallowing
  all failures silently.
- Netlify deployer throws with raw output on invalid JSON instead of silently
  regex-scraping a potentially wrong URL.
- `state.json` writes are now atomic (temp file + rename) — a crash mid-write
  can no longer leave a truncated state file.
- Added a lockfile (`.pi/artifacts/.lock`) to prevent concurrent
  `publish_artifact` calls from racing on `state.json`.
- Thread the agent's `AbortSignal` through to spawned deploy CLI processes —
  cancelling a deploy now kills the running CLI instead of leaving it orphaned.

### Added

- `typecheck` script (`tsc --noEmit`) wired into `prepublishOnly` and CI.
- `tsconfig.json` now includes `extensions/**/*.ts` so `strict: true` is enforced.
- Type dependencies (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
  `typebox`) as devDependencies for type-checking.

## [0.1.0] - 2025-07-19

### Added

- `publish_artifact` tool deploying HTML to Vercel, Cloudflare Pages, Netlify,
  or GitHub Pages.
- Platform auto-detection from installed CLIs with interactive selection.
- Per-title artifact tracking in `.pi/artifacts/state.json`.
- Shared project per platform — each artifact gets its own path.
- Streaming deploy output with progress updates.
- Session-scoped confirmation prompt with `autoConfirm` setting override.