import { defineConfig } from 'vitest/config'

/**
 * Shared Vitest defaults. Extend it per app rather than restating these.
 *
 * `node` environment by default: everything under test so far is server-side.
 * A package that needs a DOM sets `environment: 'jsdom'` in its own config and
 * takes the dependency itself, rather than making every other package carry it.
 */
export const vitestBase = defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
    clearMocks: true,
    restoreMocks: true,
  },
})

export default vitestBase
