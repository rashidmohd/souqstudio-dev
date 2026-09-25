import 'server-only'

import { prisma } from '@souqstudio/db'

// Moved to the designer package with the rasteriser; re-exported for this
// file's callers.
export { assetName, measurePng } from '@souqstudio/designer/lib/artwork-raster'
import { LIBRARY_ASSET_PREFIX, referencedAssetIds } from '@souqstudio/designer/lib/block-assets'

/**
 * Recording and listing block artwork. E7-C.
 *
 * **Separate from `lib/block-assets.ts`, which the designer imports.** That
 * module is the resolver — a pure function from key to URL that runs in the
 * browser — and putting Prisma beside it would pull the client into the bundle.
 * The split is the same one `assetResolver`'s own note argues for: rendering
 * must not need a query.
 *
 * What this adds is the listing. A key on its own cannot answer *what artwork
 * exists*, so without a row there is no picker, and without a picker there is no
 * reuse: an owner who uploads a badge for one block re-uploads it for the next
 * and leaves another object nothing references.
 */

/** What a picker needs to draw a tile and name it. */
export type StoredAsset = {
  id: string
  key: string
  name: string
  width: number
  height: number
  seeded: boolean
}



/**
 * Record an upload, or leave the existing row alone.
 *
 * **Idempotent on the key**, because the two upload paths can both arrive here
 * and a retry must not create a second row for one object. The key is unique in
 * the schema, so this is the difference between a retry and a 500.
 */
export async function recordAsset(input: {
  organizationId: string
  key: string
  name: string
  width: number
  height: number
  bytes: number
}): Promise<void> {
  await prisma.blockAsset.upsert({
    where: { key: input.key },
    // A second arrival is the same file. Nothing about it has changed, and
    // overwriting the name would undo a rename the owner may have made.
    update: {},
    create: input,
  })
}

/**
 * The artwork this organization may use: its own, and the motifs we ship.
 *
 * Seeded first and then newest-first within each, which is the order a picker
 * wants — the library is a fixed set you browse, and your own uploads are a list
 * whose top is where you just put something.
 */
export async function listAssets(organizationId: string): Promise<StoredAsset[]> {
  const rows = await prisma.blockAsset.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    orderBy: [{ organizationId: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, key: true, name: true, width: true, height: true, organizationId: true },
    take: 200,
  })

  /*
   * **Library artwork stays hidden until a published block uses it.** The admin
   * panel uploads it while a draft is being designed, often for a campaign that
   * has not been announced, and a platform asset is otherwise in every shop's
   * picker the moment it is recorded. Seeded artwork is outside the prefix and
   * unaffected. Only read when there is library artwork to decide about.
   */
  const libraryArt = rows.some(
    (row) => row.organizationId === null && row.key.startsWith(LIBRARY_ASSET_PREFIX)
  )
  const released = libraryArt ? await publishedLibraryAssets() : new Set<string>()
  const visible = rows.filter(
    (row) =>
      row.organizationId !== null ||
      !row.key.startsWith(LIBRARY_ASSET_PREFIX) ||
      released.has(row.key)
  )

  return visible.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    width: row.width,
    height: row.height,
    seeded: row.organizationId === null,
  }))
}

/**
 * Every artwork key a published SouqStudio block draws. What a shop may pick
 * from the library's uploads: published means it reached every shop anyway.
 */
async function publishedLibraryAssets(): Promise<Set<string>> {
  const blocks = await prisma.block.findMany({
    where: { organizationId: null, status: 'published' },
    select: { arrangements: true },
  })
  const keys = new Set<string>()
  for (const block of blocks) referencedAssetIds(block.arrangements, keys)
  return keys
}
