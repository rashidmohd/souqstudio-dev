import 'server-only'

import { Prisma, prisma } from '@souqstudio/db'
import type {
  CatalogCategoryTile,
  CatalogCollection,
  CatalogMatchKind,
  CatalogProductSummary,
  CatalogSearchHit,
  PackUnit,
  Page,
} from '@souqstudio/types'
import { formatPackSize } from '@/lib/catalog-display'
import { publicUrl } from '@/lib/r2'
import type { VerifiedSession } from '@/lib/session'

/**
 * Reading the catalog. E5-01 and E5-02.
 *
 * One query layer that the `/catalog` screen and the API route both call, the
 * same way `lib/shops.ts` serves the shops screen — a server component that
 * already holds the organization should not fetch its own endpoint over HTTP
 * to reach a database it is connected to.
 *
 * **Search is raw SQL and has to be.** `search_vector` is
 * `Unsupported("tsvector")` in the schema, which Prisma excludes from the
 * generated client entirely, so the column can only be reached through
 * `$queryRaw`. `ts_rank`, `similarity()` and the synonym join have no Prisma
 * expression either. Every value is still parameterised — `Prisma.sql`
 * interpolation produces bind parameters, not string concatenation.
 */

/** Ten is what E5-01 specifies for the search panel. */
const SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 50

/** Category browsing is a scrollable grid, so it pages rather than truncating. */
const BROWSE_LIMIT = 40
const MAX_BROWSE_LIMIT = 100

/**
 * How the three ways of matching combine into one number.
 *
 * `ts_rank` returns roughly 0.0–1.0 and is the signal we trust most, so it
 * carries its own scale unweighted. The other two are additive nudges rather
 * than independent scores: a synonym hit is a real hit but a second-hand one,
 * and trigram similarity is a typo tolerance, not evidence of relevance. Both
 * constants are heuristic and deliberately small enough that a strong text
 * match always outranks a weak fuzzy one.
 */
const SYNONYM_BONUS = 0.25
const FUZZY_WEIGHT = 0.3

// ─── Pure ─────────────────────────────────────────────────────────────────────

/**
 * The owner's words, turned into a tsquery.
 *
 * Two things this must do that `plainto_tsquery` does not:
 *
 * **Prefix-match the last token.** The panel searches as the owner types, so
 * "ri" has to reach "rice". Without `:*` the query is the complete lexeme `ri`,
 * which matches nothing until the word is finished — the search looks broken
 * for every prefix of every word.
 *
 * **Survive punctuation.** `&`, `|`, `!`, `(`, `)` and `:` are tsquery syntax,
 * and a raw apostrophe or bracket makes `to_tsquery` raise rather than return
 * nothing. Tokens are cut on `\p{L}\p{N}` instead of blacklisting, so Arabic,
 * Hindi and Urdu survive intact and every operator is gone by construction.
 *
 * Returns null when nothing survives — an all-punctuation query is not a query,
 * and the caller browses categories instead of running an empty search.
 */
export function toTsQuery(raw: string): string | null {
  const tokens = raw.match(/[\p{L}\p{N}]+/gu)
  if (!tokens || tokens.length === 0) return null

  return tokens
    .map((token, index) => (index === tokens.length - 1 ? `${token}:*` : token))
    .join(' & ')
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

/**
 * What every catalog query selects. One shape, so the search panel, the
 * category grid and (later) the import review screen cannot drift apart in
 * what they know about a product.
 */
type CatalogRow = {
  id: string
  organizationId: string | null
  nameEn: string
  nameAr: string | null
  brandEn: string | null
  brandAr: string | null
  specEn: string | null
  specAr: string | null
  category: string | null
  subcategory: string | null
  packSize: string | null
  packUnit: PackUnit | null
  packCount: number | null
  barcode: string | null
  imageKey: string | null
  imageKind: 'ORIGINAL' | 'CUTOUT' | 'THUMB' | null
}

function toSummary(row: CatalogRow): CatalogProductSummary {
  const collection: CatalogCollection =
    row.organizationId === null ? 'universal' : 'organization'

  return {
    id: row.id,
    collection,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    brandEn: row.brandEn,
    brandAr: row.brandAr,
    specEn: row.specEn,
    specAr: row.specAr,
    category: row.category,
    subcategory: row.subcategory,
    packSize: formatPackSize(row.packSize),
    packUnit: row.packUnit,
    packCount: row.packCount,
    barcode: row.barcode,
    imageUrl: row.imageKey ? publicUrl(row.imageKey) : null,
    // A card asks for the CUTOUT and takes the ORIGINAL only under protest —
    // E5 §3. The flag is what lets the editor mark it rather than shipping a
    // white-background packshot onto a printed page unannounced.
    imageIsFallback: row.imageKey !== null && row.imageKind !== 'CUTOUT',
  }
}

/**
 * The one image a card should draw, chosen in SQL rather than by loading every
 * asset and picking in TypeScript.
 *
 * Preference order is approved cutout, then anything else that is not rejected,
 * newest first. A `PENDING` cutout is deliberately not preferred: `reviewState`
 * defaults to PENDING and the worker promotes it to APPROVED above the matte
 * threshold, so preferring PENDING would put exactly the haloed cutouts that
 * were sent to review onto the screen. A REJECTED asset is never returned at
 * all.
 */
const IMAGE_PICK = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT i."r2Key", i.kind
    FROM image_assets i
    WHERE i."productId" = p.id
      AND i."reviewState" <> 'REJECTED'
      AND i.kind <> 'THUMB'
    ORDER BY (i.kind = 'CUTOUT' AND i."reviewState" = 'APPROVED') DESC,
             i."createdAt" DESC
    LIMIT 1
  ) img ON TRUE
`

/**
 * Which rows this organization may see, and which universal ones are shadowed.
 *
 * Visibility is its own rows plus every universal one. Shadowing is the second
 * half of E5 §1 and is easy to miss: a private row carrying the same barcode as
 * a universal row **replaces** it rather than merely outranking it. That is the
 * mechanic that lets a chain correct a bad public record for itself without
 * waiting on review — and without it the owner sees their correction and the
 * thing they corrected sitting next to each other, which reads as a duplicate.
 *
 * Archived rows are excluded everywhere. Catalog products are archived and
 * never deleted, because a published offer book references them.
 */
function visibleRows(organizationId: string): Prisma.Sql {
  return Prisma.sql`
    p."archivedAt" IS NULL
    AND (p."organizationId" = ${organizationId} OR p."organizationId" IS NULL)
    AND NOT (
      p."organizationId" IS NULL
      AND p.barcode IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM catalog_products own
        WHERE own."organizationId" = ${organizationId}
          AND own.barcode = p.barcode
          AND own."archivedAt" IS NULL
      )
    )
  `
}

// ─── Search — E5-01 ───────────────────────────────────────────────────────────

export type SearchCatalogOptions = {
  q: string
  limit?: number | undefined
  /** Narrow to one category tile without leaving the search box. */
  category?: string | undefined
}

/**
 * Full-text search over both collections.
 *
 * The `simple` dictionary throughout, never `english` — English stemming
 * applied to Arabic, Hindi and Urdu transliterations produces wrong matches,
 * and language handling lives in the synonym table instead. The stored vector
 * is built the same way by the migration's trigger, so query and index agree.
 *
 * Ordering is score first, then **the organization's own rows ahead of the
 * universal ones at equal score** — the two-collection precedence. `nameEn` and
 * `id` break the remaining ties so the same query returns the same order twice,
 * which matters more than it sounds: an as-you-type panel that reshuffles equal
 * results between keystrokes is unusable.
 */
export async function searchCatalog(
  session: VerifiedSession,
  options: SearchCatalogOptions
): Promise<CatalogSearchHit[]> {
  const tsquery = toTsQuery(options.q)
  if (!tsquery) return []

  const organizationId = session.user.organizationId
  const take = Math.min(Math.max(options.limit ?? SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT)
  const category = options.category?.trim()

  const rows = await prisma.$queryRaw<Array<CatalogRow & { matchedBy: CatalogMatchKind }>>(
    Prisma.sql`
      WITH q AS (
        SELECT to_tsquery('simple', ${tsquery}) AS tsq, ${options.q}::text AS raw
      )
      SELECT
        p.id,
        p."organizationId",
        p."nameEn", p."nameAr",
        p."brandEn", p."brandAr",
        p."specEn", p."specAr",
        p.category, p.subcategory,
        p."packSize"::text AS "packSize",
        p."packUnit"::text AS "packUnit",
        p."packCount",
        p.barcode,
        img."r2Key" AS "imageKey",
        img.kind::text AS "imageKind",
        CASE
          WHEN p.search_vector @@ q.tsq THEN 'text'
          WHEN syn.hit THEN 'synonym'
          ELSE 'fuzzy'
        END AS "matchedBy"
      FROM catalog_products p
      CROSS JOIN q
      ${IMAGE_PICK}
      LEFT JOIN LATERAL (
        SELECT TRUE AS hit
        FROM product_synonyms s
        WHERE s."catalogId" = p.id
          AND to_tsvector('simple', s.synonym) @@ q.tsq
        LIMIT 1
      ) syn ON TRUE
      WHERE ${visibleRows(organizationId)}
        AND (${category ? Prisma.sql`p.category = ${category}` : Prisma.sql`TRUE`})
        AND (
          p.search_vector @@ q.tsq
          OR syn.hit
          OR p."nameEn" % q.raw
          OR p."nameAr" % q.raw
        )
      ORDER BY
        (
          ts_rank(p.search_vector, q.tsq)
          + CASE WHEN syn.hit THEN ${SYNONYM_BONUS}::float8 ELSE 0 END
          + ${FUZZY_WEIGHT}::float8 * COALESCE(
              GREATEST(similarity(p."nameEn", q.raw), similarity(p."nameAr", q.raw)),
              0
            )
        ) DESC,
        (p."organizationId" IS NULL) ASC,
        p."nameEn" ASC,
        p.id ASC
      LIMIT ${take}
    `
  )

  return rows.map((row) => ({ ...toSummary(row), matchedBy: row.matchedBy }))
}

// ─── Categories — E5-02 ───────────────────────────────────────────────────────

/**
 * The tiles on the empty search state.
 *
 * Counts are the organization's own view of each category: its rows plus the
 * universal ones, shadowing applied. A tile that says 0 is worth showing —
 * "Electronics, nothing here yet" is information, and hiding empty tiles would
 * make the ten-category taxonomy look different for every account.
 *
 * `catalog_products.category` is a plain string rather than a foreign key, so
 * the join is on the category's name. That is the schema as written; a tile
 * whose name no owner's data matches simply counts zero.
 */
export async function listCategories(
  session: VerifiedSession
): Promise<CatalogCategoryTile[]> {
  const organizationId = session.user.organizationId

  return prisma.$queryRaw<CatalogCategoryTile[]>(
    Prisma.sql`
      SELECT
        c.id,
        c.name,
        c."nameAr",
        c."iconUrl",
        COALESCE(counts.n, 0)::int AS "productCount"
      FROM catalog_categories c
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS n
        FROM catalog_products p
        WHERE p.category = c.name
          AND ${visibleRows(organizationId)}
      ) counts ON TRUE
      WHERE c."parentId" IS NULL
      ORDER BY c."displayOrder" ASC, c.name ASC
    `
  )
}

/**
 * The subcategories inside one category, read from the products themselves.
 *
 * `catalog_categories` can hold child rows and E5-08 will let an admin manage
 * them, but seeding a subcategory taxonomy now would be inventing one: nothing
 * in E5 names the subcategories, and a seeded list would immediately disagree
 * with whatever the Open Food Facts import actually produces. Deriving them
 * from the rows on hand means the breadcrumb only ever offers a step that has
 * something behind it.
 */
export async function listSubcategories(
  session: VerifiedSession,
  category: string
): Promise<Array<{ name: string; productCount: number }>> {
  const organizationId = session.user.organizationId

  return prisma.$queryRaw<Array<{ name: string; productCount: number }>>(
    Prisma.sql`
      SELECT p.subcategory AS name, COUNT(*)::int AS "productCount"
      FROM catalog_products p
      WHERE p.subcategory IS NOT NULL
        AND p.category = ${category}
        AND ${visibleRows(organizationId)}
      GROUP BY p.subcategory
      ORDER BY p.subcategory ASC
    `
  )
}

export type BrowseCatalogOptions = {
  category: string
  subcategory?: string | undefined
  cursor?: string | undefined
  limit?: number | undefined
}

/**
 * Products inside a category, cursor-paged.
 *
 * Ordered by name and then id, and the cursor is the composite of the two: an
 * `id`-only cursor would be wrong here because the sort is not on id, and two
 * products sharing a name would let one straddle a page boundary and never be
 * returned. Same reasoning as `listShops`, different sort key.
 *
 * The organization's own rows sort ahead of the universal ones within a name,
 * so a corrected private row is the one an owner meets first.
 */
export async function browseCatalog(
  session: VerifiedSession,
  options: BrowseCatalogOptions
): Promise<Page<CatalogProductSummary>> {
  const organizationId = session.user.organizationId
  const take = Math.min(Math.max(options.limit ?? BROWSE_LIMIT, 1), MAX_BROWSE_LIMIT)
  const cursor = decodeCursor(options.cursor)

  const rows = await prisma.$queryRaw<CatalogRow[]>(
    Prisma.sql`
      SELECT
        p.id,
        p."organizationId",
        p."nameEn", p."nameAr",
        p."brandEn", p."brandAr",
        p."specEn", p."specAr",
        p.category, p.subcategory,
        p."packSize"::text AS "packSize",
        p."packUnit"::text AS "packUnit",
        p."packCount",
        p.barcode,
        img."r2Key" AS "imageKey",
        img.kind::text AS "imageKind"
      FROM catalog_products p
      ${IMAGE_PICK}
      WHERE ${visibleRows(organizationId)}
        AND p.category = ${options.category}
        AND (${
          options.subcategory
            ? Prisma.sql`p.subcategory = ${options.subcategory}`
            : Prisma.sql`TRUE`
        })
        AND (${
          cursor
            ? // Both sides cast explicitly: Prisma sends bind parameters
              // untyped, and Postgres cannot infer a type for a parameter
              // inside a row constructor on its own.
              Prisma.sql`(p."nameEn", p.id) > (${cursor.nameEn}::text, ${cursor.id}::text)`
            : Prisma.sql`TRUE`
        })
      ORDER BY p."nameEn" ASC, p.id ASC
      LIMIT ${take + 1}
    `
  )

  const page = rows.slice(0, take)
  const last = page[page.length - 1]

  return {
    items: page.map(toSummary),
    nextCursor: rows.length > take && last ? encodeCursor(last) : null,
  }
}

/**
 * The cursor carries both sort keys, so it is a pair rather than an id.
 *
 * Base64url rather than raw JSON because it travels in a query string, and
 * opaque rather than readable because a client that can parse a cursor is a
 * client that will eventually construct one. A malformed cursor resolves to no
 * cursor — the first page — rather than to an error: the failure of a paging
 * token should be a page the owner recognises, not a screen they cannot leave.
 */
type BrowseCursor = { nameEn: string; id: string }

function encodeCursor(row: CatalogRow): string {
  return Buffer.from(JSON.stringify({ nameEn: row.nameEn, id: row.id })).toString(
    'base64url'
  )
}

function decodeCursor(value: string | undefined): BrowseCursor | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'nameEn' in parsed &&
      'id' in parsed &&
      typeof parsed.nameEn === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return { nameEn: parsed.nameEn, id: parsed.id }
    }
    return null
  } catch {
    return null
  }
}
