import { prisma } from '@souqstudio/db'
import { requireAdmin, roleAtLeast } from '@/lib/admin-auth'
import { libraryConfig } from '@/lib/library-client'
import { PageHeader } from '@/components/shared/PageHeader'
import { ButtonLink } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/states'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

/**
 * The block library console. E13-04.
 *
 * Every block on the platform at once, including every organization's own,
 * and the way into SouqStudio's own authoring: "New block" starts a library
 * draft and opens the designer on it.
 *
 * **The designer is the shop app's designer**, mounted from
 * `@souqstudio/designer` at `/blocks/[id]/edit`, not a reimplementation. It
 * draws through the one painter that also renders the editor, the brand preview
 * and, when E9 lands, the PDF, because a second painter is how the print output
 * stops matching the screen.
 */
export const dynamic = 'force-dynamic'

const LIBRARY_ID = /^blk_[a-z0-9_]+$/

export default async function BlocksPage() {
  const { admin } = await requireAdmin()

  const [blocks, config] = await Promise.all([
    prisma.block.findMany({
      orderBy: [{ organizationId: 'asc' }, { category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        repeats: true,
        isSeasonal: true,
        organizationId: true,
        updatedAt: true,
        organization: { select: { name: true } },
        _count: { select: { versions: true } },
      },
      // A ceiling rather than paging. Sixty-six seeded blocks plus whatever
      // organizations have authored is not yet a list that needs a cursor, and
      // a number this far from the limit makes that visible if it changes.
      take: 500,
    }),
    Promise.resolve(libraryConfig()),
  ])

  // SouqStudio's drafts are platform rows too, but they are work in progress
  // rather than library, so they are counted apart. See `lib/library-drafts.ts`.
  const seeded = blocks.filter(
    (block) => block.organizationId === null && block.status !== 'draft'
  )
  const drafts = blocks.filter(
    (block) => block.organizationId === null && block.status === 'draft'
  )
  const authored = blocks.filter((block) => block.organizationId !== null)

  return (
    <>
      <PageHeader
        title="Block library"
        description="Every block on the platform. Design a new one here, then publish it to the library."
        action={
          roleAtLeast(admin.role, 'catalog_manager') ? (
            <ButtonLink href="/blocks/new" variant="primary">
              New block
            </ButtonLink>
          ) : undefined
        }
      />

      {config.configured ? null : (
        <div className="rounded-block bg-sand p-3">
          <p className="text-body text-charcoal">
            Publishing is off on this deployment. {config.reason}
          </p>
          <p className="text-body-sm text-secondary">
            Without both variables the console can list blocks and cannot change what shops
            see.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <StatusPill tone="neutral">
          {seeded.length} in the library
        </StatusPill>
        <StatusPill tone="caution">{drafts.length} SouqStudio drafts</StatusPill>
        <StatusPill tone="quiet">{authored.length} authored by an organization</StatusPill>
      </div>

      {blocks.length === 0 ? (
        <EmptyState
          title="No blocks"
          body="Run pnpm db:seed to load the shipped library, or set BLOCK_LIBRARY_URL and sync from R2."
        />
      ) : (
        <Table>
          <Thead>
            <Th>Name</Th>
            <Th>Group</Th>
            <Th>Kind</Th>
            <Th>Owner</Th>
            <Th>State</Th>
            <Th numeric>Versions</Th>
            <Th>Library id</Th>
          </Thead>
          <Tbody>
            {blocks.map((block) => (
              <Tr key={block.id} className="hover:bg-surface-hover">
                <Td>
                  <a
                    href={`/blocks/${block.id}`}
                    className="block max-w-full truncate text-link underline-offset-2 hover:underline"
                    title={block.name}
                  >
                    {block.name}
                  </a>
                </Td>
                <Td className="text-secondary">{block.category ?? '-'}</Td>
                <Td className="text-secondary">
                  {block.repeats ? 'Repeating' : 'Static'}
                  {block.isSeasonal ? ', seasonal' : ''}
                </Td>
                <Td className="text-secondary">
                  {block.organizationId === null ? (
                    <StatusPill tone="neutral">SouqStudio</StatusPill>
                  ) : (
                    <span
                      className="block max-w-full truncate"
                      title={block.organization?.name ?? block.organizationId}
                    >
                      {block.organization?.name ?? block.organizationId}
                    </span>
                  )}
                </Td>
                <Td>
                  {block.status === 'published' ? (
                    <StatusPill tone="positive">Published</StatusPill>
                  ) : block.status === 'archived' ? (
                    <StatusPill tone="quiet">Archived</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Draft</StatusPill>
                  )}
                </Td>
                <Td numeric>
                  <Figure size="data-sm">{block._count.versions}</Figure>
                </Td>
                <Td>
                  {LIBRARY_ID.test(block.id) ? (
                    <Figure size="data-sm">{block.id}</Figure>
                  ) : (
                    <span className="text-muted">Needs one</span>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <p className="text-body-sm text-muted">
        Showing up to 500 blocks. Add paging here if the library ever passes that.
      </p>
      <div>
        <ButtonLink href="/audit?entityType=block">See what has been published</ButtonLink>
      </div>
    </>
  )
}
