import type { ShapeArt } from '@souqstudio/types'

/**
 * The shape gallery: outlines SouqStudio publishes for every shop's designer.
 * E13-04.
 *
 * A gallery shape is the same `ShapeArt` an owner's own uploaded shape carries,
 * so placing one is `artShapeElement(art)` and nothing downstream knows where it
 * came from. It is copied into the block when placed; retiring it from the
 * gallery changes no block that already uses it.
 */
export type GalleryShape = {
  id: string
  name: string
  group: ShapeGroup
  occasion: string | null
  art: ShapeArt
}

/**
 * How the gallery is browsed. A browsing aid only: nothing about how a shape
 * draws depends on its group. In the order the dialog offers them.
 */
export const SHAPE_GROUPS = [
  { value: 'badge', label: 'Badges' },
  { value: 'burst', label: 'Bursts and stars' },
  { value: 'arrow', label: 'Arrows' },
  { value: 'frame', label: 'Frames and panels' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'decoration', label: 'Decorations' },
] as const

export type ShapeGroup = (typeof SHAPE_GROUPS)[number]['value']

export function isShapeGroup(value: string): value is ShapeGroup {
  return SHAPE_GROUPS.some((group) => group.value === value)
}
