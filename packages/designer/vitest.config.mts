import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import { vitestBase } from '@souqstudio/config/vitest.base'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default mergeConfig(
  vitestBase,
  defineConfig({
    resolve: {
      alias: {
        // `server-only` fails a client bundle that pulls in server code. Under
        // Vitest there is no bundle, so it resolves to nothing. Same as apps/web.
        'server-only': here('test/stubs/server-only.ts'),
      },
    },
  })
)
