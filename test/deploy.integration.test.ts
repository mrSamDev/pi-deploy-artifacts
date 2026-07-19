/**
 * Integration test — deploy artifact-flow.html to Netlify, Cloudflare Pages
 * (Wrangler) and Vercel, then fetch each live URL and assert the id/key markers
 * from the source HTML are present in the served response.
 *
 * This test performs REAL deployments to your authenticated accounts and takes
 * ~1–2 minutes. Run it explicitly:
 *
 *   pnpm test:integration                       # all platforms
 *   pnpm test:integration -- --project.integration Netlify   # one platform
 *
 * Requirements:
 *   - netlify, wrangler, vercel CLIs installed and authenticated
 *   - artifact-flow.html at the repo root
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE_FILE = join(__dirname, '..', 'artifact-flow.html')

/** id/key + platform-URL markers that MUST survive the deploy round-trip. */
const MARKERS = [
  '{ id, url, platform, slug }',
  'baseUrl',
  'projectName',
  'vercel.app',
  'pages.dev',
  'netlify.app',
  'github.io',
] as const

const ANSI = /\x1b\[[0-9;]*m/g
const stripAnsi = (s: string): string => s.replace(ANSI, '')

interface RunOptions {
  cwd?: string
  timeout?: number
}

/**
 * Run a shell command and return stdout+stderr merged. CLIs like Vercel write
 * deploy URLs to stderr, so both streams must be captured. ANSI codes stripped.
 */
function run(cmd: string, opts: RunOptions = {}): string {
  try {
    const out = execSync(`${cmd} 2>&1`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? 120_000,
      cwd: opts.cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    return stripAnsi(out)
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const out = stripAnsi(`${e.stdout ?? ''}${e.stderr ?? ''}`)
    throw new Error(`command failed: ${cmd}\n${out || e.message}`)
  }
}

/** Run a command, retrying up to `retries` times with a delay between attempts. */
async function runRetry(
  cmd: string,
  retries: number,
  delayMs: number,
  opts: RunOptions = {},
): Promise<string> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return run(cmd, opts)
    } catch (err) {
      lastErr = err
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}

/** Fetch a URL and return { status, body }; follows redirects. */
async function fetchBody(url: string, timeoutMs = 90_000): Promise<{ status: number; body: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal })
    const body = await res.text()
    return { status: res.status, body }
  } finally {
    clearTimeout(timer)
  }
}

/** Probe a URL once; return true if it responds HTTP 200. */
async function isLive(url: string): Promise<boolean> {
  try {
    const { status } = await fetchBody(url, 30_000)
    return status === 200
  } catch {
    return false
  }
}

/** Assert every marker is present in the served body. */
function expectMarkers(label: string, body: string): void {
  for (const marker of MARKERS) {
    expect(body, `${label}: marker "${marker}" should be present`).toContain(marker)
  }
}

// ---------------------------------------------------------------------------
// shared state
// ---------------------------------------------------------------------------
const SUFFIX = `artifact-flow-${Date.now()}-${process.pid}`

let deployDir: string
let tmpRoot: string

const created: {
  netlifySiteId: string
  netlifySiteName: string
  cloudflareProject: string
  vercelProject: string
} = {
  netlifySiteId: '',
  netlifySiteName: '',
  cloudflareProject: '',
  vercelProject: '',
}

const haveCli = (cmd: string): boolean => {
  try {
    execSync(`command -v ${cmd}`, { encoding: 'utf8', stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const ALL_CLIS =
  haveCli('netlify') && haveCli('wrangler') && haveCli('vercel') && existsSync(SOURCE_FILE)

// ---------------------------------------------------------------------------
// setup / teardown
// ---------------------------------------------------------------------------
beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'pi-artifacts-it-'))
  deployDir = join(tmpRoot, 'site')
  cpSync(SOURCE_FILE, join(deployDir, 'index.html'))
})

afterAll(() => {
  // Tear down every resource we created — best-effort, never fail the run.
  if (created.netlifySiteId) {
    try {
      run(`netlify sites:delete ${created.netlifySiteId} --force`)
    } catch { /* already gone */ }
  }
  if (created.cloudflareProject) {
    try {
      run(`wrangler pages project delete ${created.cloudflareProject} --yes`)
    } catch { /* already gone */ }
  }
  if (created.vercelProject) {
    try {
      run(`vercel rm ${created.vercelProject} --yes`)
    } catch { /* already gone */ }
  }
  if (tmpRoot) {
    try { rmSync(tmpRoot, { recursive: true, force: true }) } catch { /* ignore */ }
  }
})

// Skip the whole suite when CLIs / source file aren't available so the test
// file still loads cleanly in environments without deploy access.
const maybeDescribe = ALL_CLIS ? describe : describe.skip

// ===========================================================================
// Netlify
// ===========================================================================
maybeDescribe('Netlify', () => {
  let liveUrl = ''

  it('creates a site', () => {
    const slug =
      process.env.NETLIFY_ACCOUNT_SLUG ??
      run('netlify api listAccountsForUser').match(/"slug"\s*:\s*"([^"]+)"/)?.[1] ??
      ''
    expect(slug, 'Netlify account slug resolved').toBeTruthy()

    created.netlifySiteName = SUFFIX
    const out = run(`netlify sites:create --account-slug=${slug} --name=${SUFFIX}`, {
      cwd: tmpRoot, // contain the `.netlify` link folder
    })
    created.netlifySiteId = out.match(/Site ID:\s*([0-9a-f-]+)/i)?.[1] ?? ''
    // Match the site URL (ends in .netlify.app), NOT the "Admin URL:" line
    // which points at app.netlify.com.
    liveUrl = out.match(/URL:\s*(https:\/\/\S*\.netlify\.app)/i)?.[1] ?? ''
    expect(created.netlifySiteId, 'site id parsed').toBeTruthy()
    expect(liveUrl, 'site url parsed').toMatch(/netlify\.app$/)
  })

  it('deploys artifact-flow.html (prod)', () => {
    const out = run(
      `netlify deploy --site=${created.netlifySiteId} --prod --dir=${deployDir} --message=integration-test`,
    )
    liveUrl = out.match(/Website URL:\s*(https:\/\/\S+)/i)?.[1] ?? liveUrl
    expect(liveUrl, 'live url').toMatch(/netlify\.app$/)
  })

  it('serves all id/key markers', async () => {
    const { status, body } = await fetchBody(liveUrl)
    expect(status, `HTTP status for ${liveUrl}`).toBe(200)
    expectMarkers('Netlify', body)
  })
})

// ===========================================================================
// Cloudflare Pages (Wrangler)
// ===========================================================================
maybeDescribe('Cloudflare Pages', () => {
  let liveUrl = ''

  it('creates a project', async () => {
    created.cloudflareProject = SUFFIX.toLowerCase().replace(/[^a-z0-9-]/g, '')
    // The Cloudflare API occasionally returns a transient "code 8000000" error
    // on project creation, so retry a couple of times.
    try {
      await runRetry(
        `wrangler pages project create ${created.cloudflareProject} --production-branch=main`,
        2,
        5000,
      )
    } catch (e) {
      // "already exists" is fine — anything else rethrows.
      if (!String(e).includes('already exists')) throw e
    }
    expect(created.cloudflareProject).toBeTruthy()
  })

  it('deploys artifact-flow.html (production branch)', () => {
    const out = run(
      `wrangler pages deploy ${deployDir} --project-name=${created.cloudflareProject} --branch=main --commit-dirty`,
    )
    liveUrl =
      out.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/i)?.[0] ??
      `https://${created.cloudflareProject}.pages.dev`
    expect(liveUrl, 'live url').toMatch(/pages\.dev$/)
  })

  it('serves all id/key markers', async () => {
    // The per-deployment URL can take a moment / fail SSL on a fresh project;
    // fall back to the canonical project URL if needed.
    if (!(await isLive(liveUrl))) {
      liveUrl = `https://${created.cloudflareProject}.pages.dev`
      // give Cloudflare a moment to propagate the first deployment
      await new Promise((r) => setTimeout(r, 8000))
    }
    const { status, body } = await fetchBody(liveUrl)
    expect(status, `HTTP status for ${liveUrl}`).toBe(200)
    expectMarkers('Cloudflare', body)
  })
})

// ===========================================================================
// Vercel
// ===========================================================================
maybeDescribe('Vercel', () => {
  let liveUrl = ''

  it('deploys artifact-flow.html (prod)', () => {
    const out = run('vercel deploy --prod --yes', { cwd: deployDir })
    // The per-deployment "Production" URL serves a Vercel build page, NOT our
    // content. The "Aliased" URL (written to stderr) is the one that serves
    // the HTML.
    liveUrl =
      out.match(/Aliased\s+(https:\/\/[a-z0-9.-]+\.vercel\.app)/i)?.[1] ?? ''
    created.vercelProject =
      out.match(/Linked\s+\S+\/(\S+)/i)?.[1] ?? ''
    expect(liveUrl, 'aliased live url').toMatch(/vercel\.app$/)
    expect(created.vercelProject, 'project name for cleanup').toBeTruthy()
  })

  it('serves all id/key markers', async () => {
    const { status, body } = await fetchBody(liveUrl)
    expect(status, `HTTP status for ${liveUrl}`).toBe(200)
    expectMarkers('Vercel', body)
  })
})