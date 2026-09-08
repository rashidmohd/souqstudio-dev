import { clampOverride } from '@souqstudio/engine'
import type { SlotOverride } from '@souqstudio/types'

/**
 * Reading `offer_book_pages.slotOverrides` back out of JSONB. E6-04.
 *
 * **One parser, two readers** — `loadBook` draws with these and the override
 * route merges into them, and two readings of the same column is how a nudge
 * that draws one way gets saved another.
 *
 * A malformed entry is **dropped, never repaired**. An override is a few
 * millimetres of nudge, so losing one costs almost nothing; trusting a bad one
 * costs a card drawn somewhere nobody put it. Everything that survives is
 * clamped on the way out, because storage is not a trust boundary: a row
 * written before a limit changed must not be able to move a card out of its
 * region.
 *
 * Pure, and in `lib/` rather than in the route because `lib/offer-book.ts` is
 * `server-only` and this is neither.
 */
export function readOverrides(value: unknown): SlotOverride[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    if (typeof row.regionId !== 'string') return []
    // A static region's override carries a null offer, which is a value rather
    // than a missing field — an entry with neither is not addressable, and is
    // dropped.
    if (row.offerId !== null && typeof row.offerId !== 'string') return []

    return [
      clampOverride({
        regionId: row.regionId,
        offerId: row.offerId,
        ...(typeof row.offsetX === 'number' ? { offsetX: row.offsetX } : {}),
        ...(typeof row.offsetY === 'number' ? { offsetY: row.offsetY } : {}),
        ...(typeof row.imageScale === 'number' ? { imageScale: row.imageScale } : {}),
        ...(typeof row.imageAssetId === 'string' ? { imageAssetId: row.imageAssetId } : {}),
      }),
    ]
  })
}

/**
 * The key one card's override is held under, client-side.
 *
 * Both halves, because both halves are the key: the region is the position on
 * the page and the offer is what is standing in it, and a nudge that survives
 * next week's products is one that matched on both.
 */
export const overrideKey = (regionId: string, offerId: string | null) =>
  `${regionId} ${offerId ?? ''}`
