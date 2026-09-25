import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SAMPLE_PACKSHOT } from '@souqstudio/designer/lib/preview-product'

/**
 * The designer draws its sample product from `SAMPLE_PACKSHOT`, a path under
 * the app's own `public/`, so each app that mounts the designer has to serve
 * the file. `apps/web` owns it; this app carries a copy, because without one
 * every product image in the admin designer and the block previews is a 404.
 *
 * A copy can drift, so this pins it: change the drawing in `apps/web` and this
 * fails until the copy here is updated to match.
 */
const inPublic = (app: string) =>
  fileURLToPath(new URL(`../../${app}/public${SAMPLE_PACKSHOT}`, import.meta.url))

describe('the designer sample packshot', () => {
  it('is served by the admin app, identical to the shop app copy', () => {
    const web = readFileSync(inPublic('web'))
    const admin = readFileSync(inPublic('admin'))
    expect(admin.equals(web)).toBe(true)
  })
})
