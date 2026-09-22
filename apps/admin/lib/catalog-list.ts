import 'server-only'

import { prisma, Prisma } from '@souqstudio/db'

/**
 * The catalog list query. E13-02.
 *
 * **Filtered and paged on the server, not in the client.** The universal
 * catalog is already 18,428 rows from one retailer's import; a client-side
 * table would need all of them in the browser to filter any of them.
 *
 * **Cursor-based, never page numbers**, per the API conventions. A page number
 * over a list somebody is editing skips and repeats rows as they archive
 * things.
 */

export const PAGE_SIZE = 50

/** Which collection a row belongs to. See E5 §1 and E13-02, "Two collections". */
export type Collection = 'all' | 'universal' | 'private'
export type ArchivedFilter = 'active' | 'archived' | 'all'
export type ImageFilter = 'any' | 'with' | 'without'

export type CatalogFilters = {
  q: string
  collection: Collection
  category: string
  archived: ArchivedFilter
  image: ImageFilter
  cursor: string | null
}

/**
 * Read the filters off the query string. Anything unrecognised falls back to
 * the default rather than erroring: a stale bookmark should show the catalog,
 * not a stack trace.
 */
export function parseFilters(params: Record<string, string | string[] | undefined>): CatalogFilters {
  const one = (key: string): string => {
    const value = params[key]
    return typeof value === 'string' ? value : ''
  }

  const collection = one('collection')
  const archived = one('archived')
  const image = one('image')

  return {
    q: one('q').trim(),
    collection:
      collection === 'universal' || collection === 'private' ? collection : 'all',
    category: one('category'),
    archived: archived === 'archived' || archived === 'all' ? archived : 'active',
    image: image === 'with' || image === 'without' ? image : 'any',
    cursor: one('cursor') === '' ? null : one('cursor'),
  }
}

export type CatalogRow = {
  id: string
  nameEn: string
  nameAr: string | null
  brand: string | null
  category: string | null
  barcode: string | null
  organizationId: string | null
  organizationName: string | null
  archivedAt: Date | null
  enrichedAt: Date | null
  imageCount: number
  pendingImages: number
}

function where(filters: CatalogFilters): Prisma.CatalogProductWhereInput {
  const clauses: Prisma.CatalogProductWhereInput[] = []

  if (filters.collection === 'universal') clauses.push({ organizationId: null })
  if (filters.collection === 'private') clauses.push({ NOT: { organizationId: null } })

  if (filters.archived === 'active') clauses.push({ archivedAt: null })
  if (filters.archived === 'archived') clauses.push({ NOT: { archivedAt: null } })

  if (filters.category !== '') clauses.push({ category: filters.category })

  if (filters.image === 'with') clauses.push({ images: { some: {} } })
  if (filters.image === 'without') clauses.push({ images: { none: {} } })

  /*
   * `contains` rather than the tsvector. The full-text index is tuned for a shop
   * owner searching for a product by name; a reviewer is as likely to be
   * pasting a barcode or a partial SKU, and neither is in `search_vector` at
   * all — a code passed to the ranked search matches nothing, which is the
   * defect `api-conventions.md` records for the shop owner route. The trigram
   * indexes on nameEn and nameAr carry the name half of this.
   */
  if (filters.q !== '') {
    clauses.push({
      OR: [
        { nameEn: { contains: filters.q, mode: 'insensitive' } },
        { nameAr: { contains: filters.q } },
        { brandEn: { contains: filters.q, mode: 'insensitive' } },
        { barcode: { contains: filters.q } },
        { sku: { contains: filters.q, mode: 'insensitive' } },
      ],
    })
  }

  return clauses.length === 0 ? {} : { AND: clauses }
}

export type CatalogPage = {
  rows: CatalogRow[]
  nextCursor: string | null
  /**
   * The count is deliberately **not** part of the page.
   *
   * A `COUNT(*)` over a filtered 18k-row table on every keystroke is the
   * slowest thing on the screen, and the number it returns is one a reviewer
   * never acts on. `hasMore` is what a person needs: whether to keep going.
   */
  hasMore: boolean
}

export async function listProducts(filters: CatalogFilters): Promise<CatalogPage> {
  const rows = await prisma.catalogProduct.findMany({
    where: where(filters),
    // One more than the page, to learn whether there is another page without
    // counting the whole table.
    take: PAGE_SIZE + 1,
    ...(filters.cursor === null ? {} : { cursor: { id: filters.cursor }, skip: 1 }),
    // `id` breaks ties on `updatedAt`, so the cursor is total and a page cannot
    // repeat a row when two were saved in the same millisecond.
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      brandEn: true,
      category: true,
      barcode: true,
      organizationId: true,
      archivedAt: true,
      enrichedAt: true,
      organization: { select: { name: true } },
      brand: { select: { nameEn: true } },
      images: { select: { reviewState: true } },
    },
  })

  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows

  return {
    hasMore,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    rows: page.map((row) => ({
      id: row.id,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      // The resolved brand wins over the free-text one, which is the fallback.
      brand: row.brand?.nameEn ?? row.brandEn,
      category: row.category,
      barcode: row.barcode,
      organizationId: row.organizationId,
      organizationName: row.organization?.name ?? null,
      archivedAt: row.archivedAt,
      enrichedAt: row.enrichedAt,
      imageCount: row.images.length,
      pendingImages: row.images.filter((image) => image.reviewState === 'PENDING').length,
    })),
  }
}

/** The categories as seeded, for the filter. Read from the table, not a constant. */
export async function listCategoryNames(): Promise<string[]> {
  const rows = await prisma.catalogCategory.findMany({
    where: { parentId: null },
    orderBy: { displayOrder: 'asc' },
    select: { name: true },
  })
  return rows.map((row) => row.name)
}
