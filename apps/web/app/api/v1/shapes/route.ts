import { listGalleryShapes } from '@souqstudio/db'
import { isShapeGroup, type GalleryShape } from '@souqstudio/designer/lib/shape-gallery'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * The published shape gallery, for the designer's "More shapes" dialog. E13-04.
 *
 * SouqStudio curates it in the admin panel; every shop reads the same list, so
 * nothing here is scoped to an organization. Any signed-in member may read it:
 * browsing shapes changes nothing, and placing one is a block save, which is
 * where the role check already is.
 */
export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const rows = await listGalleryShapes(['published'])
  const shapes: GalleryShape[] = rows.flatMap((row) =>
    isShapeGroup(row.group)
      ? [{ id: row.id, name: row.name, group: row.group, occasion: row.occasion, art: row.art }]
      : []
  )

  return ok({ shapes })
}
