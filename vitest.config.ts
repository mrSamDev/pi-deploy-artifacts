import { defineConfig } from 'vitest/config'

// Two test projects:
//
//   unit        — fast, offline tests (test/[name].test.ts).
//                 Run by default with `pnpm test`.
//
//   integration — slow, real-deploy tests (test/[name].integration.test.ts)
//                 that hit live Netlify / Cloudflare / Vercel accounts.
//                 Opt-in via `pnpm test:integration`.
//
// Run everything:   `pnpm test:all`
// Run one project:  `pnpm test -- --project integration`
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.integration.test.ts'],
          // Real deploys + CDN propagation can take a while.
          testTimeout: 180_000,
          hookTimeout: 180_000,
          // Keep output readable and avoid hammering platform APIs at once.
          pool: 'threads',
          poolOptions: { threads: { singleThread: true } },
        },
      },
    ],
  },
})