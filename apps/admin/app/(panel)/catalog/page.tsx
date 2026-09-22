import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-auth'
import { listCategoryNames, listProducts, parseFilters } from '@/lib/catalog-list'
import { CatalogFilters } from '@/components/catalog/CatalogFilters'
import { PageHeader } from '@/components/shared/PageHeader'
import { ButtonLink } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState, ZeroResults } from '@/components/ui/states'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

/**
 * The catalog list. E13-02.
 *
 * Spans both collections — the universal catalog and every organization's
 * private rows — and says which one each row is, because "why can this shop see
 * that product" is the question this screen exists to answer.
 *
 * Every admin can read the catalog. Changing it needs `catalog_manager`, and
 * that gate is on the routes rather than here: a support agent looking up a
 * product to explain what a shop is seeing is the commonest use this screen has.
 */
export const dynamic = 'force-dynamic'

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { admin } = await requireAdmin()
  const filters = parseFilters(searchParams)

  const [page, categories] = await Promise.all([listProducts(filters), listCategoryNames()])

  const mayEdit = admin.role !== 'support_agent'
  const filtered =
    filters.q !== '' ||
    filters.category !== '' ||
    filters.collection !== 'all' ||
    filters.archived !== 'active' ||
    filters.image !== 'any'

  return (
    <>
      <PageHeader
        title="Catalog"
        description="Every product on the platform, universal and private."
        action={
          mayEdit ? (
            <ButtonLink href="/catalog/new" variant="primary">
              Add product
            </ButtonLink>
          ) : undefined
        }
      />

      <CatalogFilters filters={filters} categories={categories} />

      {page.rows.length === 0 ? (
        filtered ? (
          <ZeroResults
            query={filters.q}
            onReset={
              <Link href="/catalog" className="text-body text-link underline">
                Clear the filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No products yet"
            body="Import a feed, or add the first product by hand."
            action={
              mayEdit ? (
                <Link href="/catalog/new" className="text-body text-link underline">
                  Add product
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <Table>
            <Thead>
              <Th>Name</Th>
              <Th>Brand</Th>
              <Th>Category</Th>
              <Th>Barcode</Th>
              <Th>Collection</Th>
              <Th>State</Th>
              <Th numeric>Images</Th>
            </Thead>
            <Tbody>
              {page.rows.map((row) => (
                <Tr key={row.id} className="hover:bg-surface-hover">
                  <Td>
                    <Link
                      href={`/catalog/${row.id}`}
                      className="block max-w-full truncate text-link underline-offset-2 hover:underline"
                      title={row.nameEn}
                    >
                      {row.nameEn}
                    </Link>
                    {/*
                      The Arabic name's absence is shown on the list rather than
                      only on the row, because it is a publish-time blocker for
                      an Arabic edition and there are thousands of them: every
                      product seeded from Open Food Facts has a null nameAr.
                      See CLAUDE.md, worker handlers.
                    */}
                    {row.nameAr === null ? (
                      <span className="block text-body-sm text-caution-fg">No Arabic name</span>
                    ) : (
                      <span
                        dir="rtl"
                        className="block max-w-full truncate text-body-sm text-muted"
                        title={row.nameAr}
                      >
                        {row.nameAr}
                      </span>
                    )}
                  </Td>
                  <Td className="text-secondary">{row.brand ?? '-'}</Td>
                  <Td className="text-secondary">{row.category ?? '-'}</Td>
                  <Td>
                    {row.barcode === null ? (
                      <span className="text-muted">-</span>
                    ) : (
                      <Figure size="data-sm">{row.barcode}</Figure>
                    )}
                  </Td>
                  <Td>
                    {row.organizationId === null ? (
                      <StatusPill tone="neutral">Universal</StatusPill>
                    ) : (
                      <span
                        className="block max-w-full truncate text-body-sm text-secondary"
                        title={row.organizationName ?? row.organizationId}
                      >
                        {row.organizationName ?? row.organizationId}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {row.archivedAt === null ? (
                      <StatusPill tone="positive">Active</StatusPill>
                    ) : (
                      <StatusPill tone="quiet">Archived</StatusPill>
                    )}
                  </Td>
                  <Td numeric>
                    <Figure size="data-sm">{row.imageCount}</Figure>
                    {row.pendingImages > 0 ? (
                      <span className="ms-2 inline-block">
                        <StatusPill tone="caution">
                          {row.pendingImages} to review
                        </StatusPill>
                      </span>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          {page.nextCursor === null ? null : (
            <div className="flex justify-center">
              <Link
                href={`/catalog?${new URLSearchParams({
                  ...Object.fromEntries(
                    Object.entries(searchParams).filter(
                      (entry): entry is [string, string] => typeof entry[1] === 'string'
                    )
                  ),
                  cursor: page.nextCursor,
                }).toString()}`}
                className="text-body text-link underline"
              >
                Next 50
              </Link>
            </div>
          )}
        </>
      )}
    </>
  )
}
