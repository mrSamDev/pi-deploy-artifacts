import { defineConfig } from 'vitest/config'

// Two test projects, both under tests/:
//
//   unit        — fast, offline tests (tests/[name].test.ts).
//                 Run by default with `pnpm test`.
//
//   integration — slow, real-deploy tests (tests/[name].integration.test.ts)
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
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/**/*.integration.test.ts'],
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