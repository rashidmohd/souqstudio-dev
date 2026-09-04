/**
 * Track resolution — fr units to pixels.
 *
 * A page's columns and rows are fr sizes, draggable exactly like column widths
 * in a spreadsheet. This turns them into offsets and sizes on a real canvas.
 */

export interface Track {
  /** Distance from the start of the content box. */
  offset: number
  size: number
}

/**
 * Distribute `total` across `fr` tracks separated by `gap`.
 *
 * Gaps sit between tracks, never outside them: n tracks carry n−1 gaps.
 */
export function resolveTracks(fr: readonly number[], total: number, gap: number): Track[] {
  if (fr.length === 0) {
    throw new Error('resolveTracks: at least one track is required')
  }
  if (fr.some((size) => !(size > 0))) {
    throw new Error('resolveTracks: every track size must be greater than zero')
  }
  if (gap < 0) {
    throw new Error('resolveTracks: gap cannot be negative')
  }

  const available = total - gap * (fr.length - 1)
  if (available <= 0) {
    throw new Error(
      `resolveTracks: ${fr.length} tracks with a gap of ${gap} do not fit in ${total}`
    )
  }

  const sum = fr.reduce((acc, size) => acc + size, 0)
  const tracks: Track[] = []
  let offset = 0

  for (const size of fr) {
    const px = (available * size) / sum
    tracks.push({ offset, size: px })
    offset += px + gap
  }

  return tracks
}
