import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import { vitestBase } from '@souqstudio/config/vitest.base'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(
  vitestBase,
  defineConfig({
    resolve: {
      alias: {
        // Vitest reads this file, not tsconfig.json, so the paths mapping there
        // does not reach it.
        '@': here('.'),
        // `server-only` exists to fail a build that pulls server code into a
        // client bundle. Under Vitest there is no bundle and the guard has
        // nothing to protect, so it resolves to nothing. The guard still does
        // its job in `next build`, which is where it matters.
        'server-only': here('test/stubs/server-only.ts'),
      },
    },
    test: {
      setupFiles: [here('vitest.setup.ts')],
    },
  })
)
