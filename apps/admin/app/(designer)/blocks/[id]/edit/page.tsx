import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { listFonts, prisma } from '@souqstudio/db'
import { toArrangements } from '@souqstudio/engine'
import { fontsForKit } from '@souqstudio/designer/lib/font-registry'
import {
  LIBRARY_PREVIEW_KIT,
  libraryPreviewIdentity,
} from '@souqstudio/designer/lib/library-preview'
import { requireAdmin, roleAtLeast } from '@/lib/admin-auth'
import { env } from '@/lib/env'
import { LibraryDesigner } from '@/components/blocks/LibraryDesigner'

export const metadata: Metadata = { title: 'Block designer · SouqStudio admin' }
export const dynamic = 'force-dynamic'

/**
 * The block designer, over one of SouqStudio's own blocks. E13-04.
 *
 * **Only SouqStudio's blocks.** An organization's block is that shop's design
 * and is read on `/blocks/[id]`, never opened here: the panel does not edit a
 * customer's work.
 *
 * **Editable only as a draft.** A published library row is the sync's copy of
 * what is in R2, so it opens read-only with "Duplicate to edit", which makes a
 * draft through `POST /api/v1/admin/blocks`. A support agent sees everything
 * read-only, the same bar the routes put on it.
 *
 * Drawn against a stand-in shop's colours, because a library block is drawn in
 * every shop's and must read well in anybody's. See `lib/library-preview.ts`.
 */
export default async function LibraryDesignerPage({ params }: { params: { id: string } }) {
  const { admin } = await requireAdmin()

  const block = await prisma.block.findFirst({
    where: { id: params.id, organizationId: null },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      repeats: true,
      arrangements: true,
    },
  })
  if (block === null) notFound()

  const arrangements = toArrangements(block.arrangements)
  if (arrangements === null) notFound()

  const { catalog, css } = fontsForKit(await listFonts(), LIBRARY_PREVIEW_KIT)

  return (
    <>
      {/* The kit's faces, served from R2, as the shop app's layout does. Empty
          until something is mirrored; the resolvers then fall back to a chrome
          face. */}
      {css !== '' && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <LibraryDesigner
        blockId={block.id}
        name={block.name}
        description={block.description}
        status={block.status}
        repeats={block.repeats}
        editable={block.status === 'draft' && roleAtLeast(admin.role, 'catalog_manager')}
        arrangements={arrangements}
        kit={LIBRARY_PREVIEW_KIT}
        identity={libraryPreviewIdentity()}
        assetBaseUrl={env.R2_PUBLIC_URL}
        fontCatalog={catalog}
      />
    </>
  )
}
