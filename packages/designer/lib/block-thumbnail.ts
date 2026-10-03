import 'server-only'
import { createHash } from 'node:crypto'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { enqueueBlockThumbnail, prisma, type RenderKitSource } from '@souqstudio/db'
import { previewAspect } from './preview-shape'

/**
 * Block thumbnails: PNGs the worker draws, so a list of blocks shows pictures
 * instead of composing every block live.
 *
 * **The PNG is the painter's own output, captured.** The worker opens the web
 * app's `/render/block/[id]` in headless Chromium, which draws the block with
 * `BlockPreview`, the shop's real faces from R2 and the browser's own text
 * measurement, and screenshots it. There is no second renderer to drift from
 * the first, which is the rule every surface in this product keeps.
 *
 * **A list never waits for one.** A block with no PNG for its current key draws
 * live, as every list did before, and asking for it queues the render. So an
 * edit, a brand change or a painter fix never shows a stale picture: the key
 * changes, the old PNG stops matching, and the live preview covers the gap.
 */

/**
 * Bump when the painter changes what it draws. Every key changes with it, so
 * every PNG is redrawn the next time it is asked for rather than showing what
 * the old painter made.
 */
export const RENDERER_VERSION = 2
// 2 — `BlockPreview` now hands the painter the shop's palette. Every PNG drawn
// before it shows a colour picked by id as near-black, so every one is redrawn.

/** The long edge of a thumbnail in CSS pixels. Captured at twice this. */
const LONG_EDGE = 640

/** Captured at this device scale, so a thumbnail stays sharp on a retina tile. */
export const THUMBNAIL_SCALE = 2

/**
 * The box a block is drawn into for its thumbnail.
 *
 * **The shape every list already draws it at**: `previewAspect`, the one
 * `BlockTile` and the admin panel share. That is what lets one PNG stand in for
 * the live preview in every list, each fitting it into its own box.
 */
export function thumbnailBox(block: {
  repeats: boolean
  arrangements: readonly Arrangement[]
}): { width: number; height: number } {
  const aspect = previewAspect(block)
  return aspect >= 1
    ? { width: LONG_EDGE, height: Math.round(LONG_EDGE / aspect) }
    : { width: Math.round(LONG_EDGE * aspect), height: LONG_EDGE }
}

/**
 * What a thumbnail is a picture of, as one string.
 *
 * Everything that changes the drawing goes in: the document, the kit (palette
 * and faces), the direction and the painter's version. The block's name and
 * status do not, because the card does not draw them.
 */
export function renderKey(input: {
  arrangements: readonly Arrangement[]
  kit: BrandKit
  direction: 'ltr' | 'rtl'
}): string {
  const body = stable({
    v: RENDERER_VERSION,
    arrangements: input.arrangements,
    kit: input.kit,
    direction: input.direction,
  })
  return createHash('sha256').update(body).digest('hex').slice(0, 32)
}

/**
 * The thumbnail URL for each block that has one for this kit and direction,
 * and a render queued for each that does not.
 *
 * For server components and routes that list blocks. Queuing is fire and
 * forget: a list that cannot reach Redis still renders, live, as it always did.
 */
export async function thumbnailsFor(
  blocks: readonly { id: string; arrangements: readonly Arrangement[] }[],
  context: { kit: BrandKit; source: RenderKitSource; direction?: 'ltr' | 'rtl' }
): Promise<Map<string, string>> {
  const direction = context.direction ?? 'ltr'
  const wanted = blocks.map((block) => ({
    blockId: block.id,
    renderKey: renderKey({ arrangements: block.arrangements, kit: context.kit, direction }),
  }))
  if (wanted.length === 0) return new Map()

  let found: { blockId: string; url: string }[]
  try {
    found = await prisma.blockThumbnail.findMany({
      where: { OR: wanted },
      select: { blockId: true, url: true },
    })
  } catch (error) {
    // A thumbnail is never worth a page. Before the `block_thumbnails`
    // migration has run, or with the database briefly unreachable, every list
    // draws live exactly as it did before thumbnails existed.
    console.error('[thumbnails] lookup failed; drawing live:', error)
    return new Map()
  }
  const urls = new Map(found.map((row) => [row.blockId, row.url]))

  const missing = wanted.filter((want) => !urls.has(want.blockId))
  if (missing.length > 0) {
    void Promise.allSettled(
      missing.map((want) =>
        enqueueBlockThumbnail({ ...want, kit: context.source, direction })
      )
    )
  }

  return urls
}

/** JSON with sorted keys, so two equal kits built in different orders hash alike. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
