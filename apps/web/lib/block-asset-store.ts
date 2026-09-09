import 'server-only'

import sharp from 'sharp'
import { prisma } from '@souqstudio/db'

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
 * A filename as a name an owner recognises.
 *
 * The extension goes because it is noise in a picker, and a long name is cut
 * rather than refused — the file is already uploaded by the time this runs, and
 * losing an owner's artwork over its title would be absurd.
 */
export function assetName(filename: string): string {
  const trimmed = filename.replace(/\.[^./\\]+$/, '').trim()
  return trimmed === '' ? 'Artwork' : trimmed.slice(0, 80)
}

/**
 * Measure a stored PNG.
 *
 * **From the bytes rather than from what the client said.** A picker draws each
 * asset at its own proportion, and a client-supplied width is a number that can
 * be wrong in a way nothing else would catch — the tile would simply be the
 * wrong shape, which reads as a rendering bug.
 */
export async function measurePng(bytes: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(bytes).metadata()
    if (meta.width === undefined || meta.height === undefined) return null
    return { width: meta.width, height: meta.height }
  } catch {
    return null
  }
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

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    width: row.width,
    height: row.height,
    seeded: row.organizationId === null,
  }))
}
