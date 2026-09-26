import { prisma } from '@souqstudio/db'
import { requireAdminRole } from '@/lib/admin-auth'
import { STARTER_KINDS, STARTER_LABELS } from '@/lib/library-drafts'
import { MagicBlockForm } from '@/components/blocks/MagicBlockForm'
import { NewBlockForm } from '@/components/blocks/NewBlockForm'
import { PageHeader } from '@/components/shared/PageHeader'

/**
 * Start a library block. E13-04.
 *
 * The draft is created, then the designer opens on it. Nothing here reaches a
 * shop: a draft stays SouqStudio's until it is published from its block page.
 */
export const dynamic = 'force-dynamic'

export default async function NewBlockPage() {
  await requireAdminRole('catalog_manager')

  // SouqStudio's own blocks only. See the create route for why a customer's
  // block is never a starting point.
  const blocks = await prisma.block.findMany({
    where: { organizationId: null, NOT: { status: 'archived' } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, category: true, status: true },
    take: 500,
  })

  return (
    <>
      <PageHeader
        title="New block"
        description="Start a library draft. Shops see it only after it is published and synced."
      />
      <NewBlockForm
        kinds={STARTER_KINDS.map((kind) => ({
          value: `kind:${kind}`,
          label: STARTER_LABELS[kind],
        }))}
        blocks={blocks.map((block) => ({
          value: `block:${block.id}`,
          label: `${block.name}${block.category === null ? '' : `, ${block.category}`}${
            block.status === 'draft' ? ' (draft)' : ''
          }`,
        }))}
      />
      {/*
        The second way in: a picture of a design, matched by the same worker
        job the shop app's magic block uses. Only the kinds a starter exists
        for, which are the kinds the model is asked about.
      */}
      <MagicBlockForm
        kinds={STARTER_KINDS.map((kind) => ({ value: kind, label: STARTER_LABELS[kind] }))}
      />
    </>
  )
}
