/**
 * The shape a block is previewed at, width over height.
 *
 * A repeating card is drawn in the shape a booklet cell actually is: it carries
 * several arrangements and the tall one is the one it was designed in. A block
 * placed once is drawn at the shape its own aspect range says it was designed
 * for, which is what the designer's shape picker reads. Clamped, so a band
 * across a page still gets a tile an eye can find.
 *
 * Shared by the shop app's library tiles and the admin panel's, so both show a
 * block at the same shape.
 */
export function previewAspect(block: {
  repeats: boolean
  arrangements: readonly { aspectMin: number; aspectMax: number }[]
}): number {
  const arrangement = block.arrangements[0]
  return block.repeats || arrangement === undefined
    ? 0.72
    : Math.min(6, Math.max(0.4, Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)))
}
