import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Alias the `server-only` package to a no-op stub during tests.
    // The real module unconditionally throws to enforce the
    // Next.js client/server boundary at build time — that's correct
    // behavior in production but breaks Node test runners.
    alias: {
      'server-only': path.resolve(__dirname, 'src/test-stubs/server-only.ts'),
    },
  },
})
