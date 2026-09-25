import { shapeArtSchema } from '@souqstudio/engine'
import type { ShapeArt } from '@souqstudio/types'
import { prisma } from './client'

/**
 * Reading the shape gallery. E13-04.
 *
 * Here because two apps read it: `apps/web` gives shops the published shapes,
 * and `apps/admin` lists every shape for the team that curates them. Both must
 * refuse the same rows, so the check lives once.
 *
 * **Every outline is re-validated on the way out.** It was validated when it was
 * uploaded, but `art` is a JSON column, and a row edited by hand or written by a
 * future bug must not reach a designer that draws its path data as it is. A row
 * that fails is skipped and logged rather than failing the whole gallery.
 */
export interface GalleryShapeRow {
  id: string
  name: string
  group: string
  occasion: string | null
  status: string
  art: ShapeArt
  updatedAt: Date
}

export async function listGalleryShapes(
  statuses: readonly string[] = ['published']
): Promise<GalleryShapeRow[]> {
  const rows = await prisma.libraryShape.findMany({
    where: { status: { in: [...statuses] } },
    orderBy: [{ group: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      group: true,
      occasion: true,
      status: true,
      art: true,
      updatedAt: true,
    },
    // A ceiling, not paging. The gallery is curated by hand; a number this far
    // from what anyone will upload makes it visible if that ever changes.
    take: 1000,
  })

  const shapes: GalleryShapeRow[] = []
  for (const row of rows) {
    const art = shapeArtSchema.safeParse(row.art)
    if (!art.success) {
      console.error('[shape-gallery] skipping a shape whose outline does not validate', row.id)
      continue
    }
    shapes.push({ ...row, art: art.data })
  }
  return shapes
}
