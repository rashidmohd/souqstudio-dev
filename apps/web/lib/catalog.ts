import 'server-only'

import { Prisma, prisma } from '@souqstudio/db'
import type { MatchCandidate } from '@/lib/catalog-import'
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

/** How many brand suggestions a datalist gets. Enough to choose from, not to read. */
const BRAND_SUGGESTIONS = 10

/**
 * Brands already in the catalog, matched against what is being typed.
 *
 * **Suggestions, never a closed list.** `catalog_products.brandEn` is free text
 * and stays free text: E5's ingest rule is that nothing blocks an owner adding
 * a product, and a brand they cannot find is exactly the case where a required
 * pick would stop them. This narrows the typing, it does not constrain it — the
 * field accepts anything, including a brand nobody has entered before.
 *
 * Derived from the products rather than from a brand table, for the same reason
 * `listSubcategories` derives its list: there is no brand entity in the schema,
 * and inventing one here would make this the only place that knows about it.
 * If a `ProductBrand` table is ever added — for logos, or to deduplicate what
 * the Open Food Facts import produces — this is the function it replaces.
 *
 * `DISTINCT` on a case-insensitive match rather than `GROUP BY`: two shops that
 * typed "Almarai" and "almarai" are one suggestion, and the one that appears is
 * whichever the ordering picks. That inconsistency is a property of free-text
 * brands and is the argument for the table, not something to paper over here.
 *
 * **Unindexed, and that is fine only while the catalog is small.**
 * `catalog_products` carries trigram GINs on `nameEn` and `nameAr` and nothing
 * on `brandEn`, so this is a sequential scan. At 99 rows it is free; after the
 * Open Food Facts seed it needs `@@index([brandEn])` or a trigram GIN, the same
 * outstanding index decision `listCategories` and `listSubcategories` carry.
 */
export async function suggestBrands(
  session: VerifiedSession,
  query: string
): Promise<string[]> {
  const q = query.trim()
  if (!q) return []

  const organizationId = session.user.organizationId

  const rows = await prisma.$queryRaw<Array<{ brand: string }>>(
    Prisma.sql`
      SELECT d.brand
      FROM (
        SELECT DISTINCT ON (lower(p."brandEn")) p."brandEn" AS brand
        FROM catalog_products p
        WHERE p."brandEn" IS NOT NULL
          AND p."brandEn" <> ''
          AND p."brandEn" ILIKE ${`%${q}%`}
          AND ${visibleRows(organizationId)}
        ORDER BY lower(p."brandEn") ASC
      ) d
      -- **A match at the start of a word outranks one buried inside.** Typing
      -- "al" should offer Al Alali and Almarai, not Signal and Galaxy, which a
      -- plain substring match returns with equal standing and alphabetical
      -- order then puts first. Interior matches are kept rather than filtered,
      -- because "marai" finding Almarai is the other half of what makes typing
      -- a partial brand work — they just sort last.
      ORDER BY
        (d.brand ILIKE ${`${q}%`}) DESC,
        (d.brand ILIKE ${`% ${q}%`}) DESC,
        lower(d.brand) ASC
      LIMIT ${BRAND_SUGGESTIONS}
    `
  )

  return rows.map((row) => row.brand)
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

// ─── Barcode lookup — E5-03 ───────────────────────────────────────────────────

/**
 * One product by its barcode, the organization's own row winning.
 *
 * Not a search. A barcode is an identity, so this is an equality test and the
 * ranking machinery above has nothing to contribute — which is also why the
 * search box has to route here rather than pass the number to `searchCatalog`:
 * **`barcode` is not in `search_vector`.** The migration's trigger builds the
 * vector from name, brand, category, spec and tags and nothing else, so typing
 * a barcode into full-text search finds precisely nothing.
 *
 * The shadowing predicate is not needed here — ordering the organization's row
 * first does the same job for a single lookup, and it also returns the private
 * row when the universal one carries the same barcode, which is the point.
 */
export async function lookupBarcode(
  session: VerifiedSession,
  barcode: string
): Promise<CatalogProductSummary | null> {
  const organizationId = session.user.organizationId

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
      WHERE p."archivedAt" IS NULL
        AND p.barcode = ${barcode}
        AND (p."organizationId" = ${organizationId} OR p."organizationId" IS NULL)
      ORDER BY (p."organizationId" IS NULL) ASC
      LIMIT 1
    `
  )

  const row = rows[0]
  return row ? toSummary(row) : null
}

// ─── Creating a product in the organization's collection — E5-04 ──────────────

export type NewProduct = {
  nameEn: string
  nameAr?: string | undefined
  brandEn?: string | undefined
  specEn?: string | undefined
  category?: string | undefined
  subcategory?: string | undefined
  packSize?: string | undefined
  packUnit?: PackUnit | undefined
  packCount?: number | undefined
  barcode?: string | undefined
}

export type NewProductImage = {
  r2Key: string
  url: string
  width: number
  height: number
}

/**
 * E5-04 — a product the owner adds because the catalog did not have it.
 *
 * **It lands in the organization's collection and is usable immediately.**
 * Review decides promotion to the universal catalog, not availability: a shop
 * owner in Dubai at 11pm does not wait on a reviewer in the morning. The
 * contribution row is the queue entry, and it points at a product that is
 * already live for the shop that submitted it.
 *
 * All three writes are one transaction. A product with no image row renders as
 * a grey tile nobody can explain, and an `image_assets` row pointing at a
 * product that failed to insert is an orphan the cutout worker would pick up
 * and fail on — neither half is worth having without the other.
 *
 * The `ImageAsset` is `ORIGINAL` and `APPROVED`: it is what the owner
 * photographed, so there is no matte to judge. The cutout the worker produces
 * arrives as a second row, `PENDING`, and `IMAGE_PICK` above will not prefer it
 * until it is approved.
 */
export async function createOrgProduct(
  session: VerifiedSession,
  shopId: string,
  product: NewProduct,
  image: NewProductImage
): Promise<{ id: string; imageAssetId: string }> {
  const organizationId = session.user.organizationId

  return prisma.$transaction(async (tx) => {
    const created = await tx.catalogProduct.create({
      data: {
        organizationId,
        nameEn: product.nameEn,
        nameAr: product.nameAr ?? null,
        brandEn: product.brandEn ?? null,
        specEn: product.specEn ?? null,
        category: product.category ?? null,
        subcategory: product.subcategory ?? null,
        packSize: product.packSize ?? null,
        packUnit: product.packUnit ?? null,
        packCount: product.packCount ?? null,
        barcode: product.barcode ?? null,
        source: 'user_contribution',
      },
      select: { id: true },
    })

    const asset = await tx.imageAsset.create({
      data: {
        productId: created.id,
        kind: 'ORIGINAL',
        r2Key: image.r2Key,
        width: image.width,
        height: image.height,
        reviewState: 'APPROVED',
      },
      select: { id: true },
    })

    await tx.productContribution.create({
      data: {
        shopId,
        catalogId: created.id,
        imageUrl: image.url,
        name: product.nameEn,
        brand: product.brandEn ?? null,
        category: product.category ?? null,
      },
    })

    return { id: created.id, imageAssetId: asset.id }
  })
}


// ─── Import matching — E5-06 ──────────────────────────────────────────────────

/**
 * How many candidates an ambiguous row offers the owner.
 *
 * Three. A picker with ten near-identical names is not a decision, it is a
 * second search — and if the right product is not in the top three, the score
 * was never going to find it and the row wants creating instead.
 */
const MAX_CANDIDATES = 3

export type ImportNeedle = { index: number; name: string; barcode: string | null }

export type ImportMatches = {
  /** Row index → the product its barcode identifies, when it has one. */
  byBarcode: Map<number, string>
  /** Row index → ranked name candidates. */
  byName: Map<number, MatchCandidate[]>
}

/**
 * Resolve a whole sheet's worth of rows in two queries.
 *
 * **Two queries for the sheet, not two per row.** A five-hundred-row import
 * doing a round trip per row is a thousand round trips, and against a hosted
 * database that is minutes rather than seconds — long enough that the owner
 * leaves. Both queries fan out over `unnest`, so the row count changes the size
 * of one array rather than the number of calls.
 *
 * **tsvector for recall, trigram for the score.** E5-06 asks for both, and they
 * do different jobs: full-text finds "Rice Basmati" from "Basmati Rice", which
 * trigram scores poorly on word order, while `similarity()` returns a true
 * 0..1 the match thresholds in `catalog-import.ts` can be reasoned about. So the
 * `WHERE` admits either and the ranking is the similarity alone — mixing
 * `ts_rank`, which is unbounded and corpus-dependent, into a number compared
 * against a constant would make that constant meaningless.
 */
export async function matchImportRows(
  session: VerifiedSession,
  needles: ImportNeedle[]
): Promise<ImportMatches> {
  const organizationId = session.user.organizationId
  const byBarcode = new Map<number, string>()
  const byName = new Map<number, MatchCandidate[]>()

  if (needles.length === 0) return { byBarcode, byName }

  // ── Barcodes ────────────────────────────────────────────────────────────
  const withBarcodes = needles.filter(
    (needle): needle is ImportNeedle & { barcode: string } => needle.barcode !== null
  )

  if (withBarcodes.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ barcode: string; id: string }>>(
      Prisma.sql`
        SELECT DISTINCT ON (p.barcode) p.barcode, p.id
        FROM catalog_products p
        WHERE p."archivedAt" IS NULL
          AND p.barcode = ANY(${withBarcodes.map((n) => n.barcode)}::text[])
          AND (p."organizationId" = ${organizationId} OR p."organizationId" IS NULL)
        -- DISTINCT ON keeps the first row per barcode, so this ORDER BY is what
        -- makes the organization's own record win over the universal one.
        ORDER BY p.barcode, (p."organizationId" IS NULL) ASC, p.id ASC
      `
    )

    const found = new Map(rows.map((row) => [row.barcode, row.id]))
    for (const needle of withBarcodes) {
      const id = found.get(needle.barcode)
      if (id) byBarcode.set(needle.index, id)
    }
  }

  // ── Names ───────────────────────────────────────────────────────────────
  const unresolved = needles.filter(
    (needle) => !byBarcode.has(needle.index) && needle.name.trim() !== ''
  )

  if (unresolved.length > 0) {
    const rows = await prisma.$queryRaw<
      Array<{ idx: number; id: string; score: number }>
    >(
      Prisma.sql`
        WITH needle(idx, name) AS (
          SELECT * FROM unnest(
            ${unresolved.map((n) => n.index)}::int[],
            ${unresolved.map((n) => n.name)}::text[]
          )
        )
        SELECT n.idx, m.id, m.score
        FROM needle n
        JOIN LATERAL (
          SELECT
            p.id,
            GREATEST(
              similarity(p."nameEn", n.name),
              COALESCE(similarity(p."nameAr", n.name), 0)
            ) AS score
          FROM catalog_products p
          WHERE ${visibleRows(organizationId)}
            AND (
              p."nameEn" % n.name
              OR p."nameAr" % n.name
              OR p.search_vector @@ plainto_tsquery('simple', n.name)
            )
          ORDER BY score DESC, (p."organizationId" IS NULL) ASC, p.id ASC
          LIMIT ${MAX_CANDIDATES}
        ) m ON TRUE
        ORDER BY n.idx ASC, m.score DESC
      `
    )

    for (const row of rows) {
      const list = byName.get(row.idx) ?? []
      list.push({ catalogProductId: row.id, score: row.score })
      byName.set(row.idx, list)
    }
  }

  return { byBarcode, byName }
}

/**
 * Products created from import rows the owner chose to keep.
 *
 * **No `ProductContribution` row, unlike E5-04.** A photographed product is an
 * offer to the universal catalog and belongs in the review queue; a line from
 * the shop's own stock list is their private record, often an own-brand line
 * that would never be promoted. Sending every imported row to a reviewer would
 * bury the queue in exactly the products it should not contain.
 *
 * No image either. That is what E5-07's phone capture is for, and until then
 * the card falls back to no image rather than to a wrong one.
 */
export async function createImportedProducts(
  session: VerifiedSession,
  products: NewProduct[]
): Promise<string[]> {
  const organizationId = session.user.organizationId

  const created = await prisma.$transaction(
    products.map((product) =>
      prisma.catalogProduct.create({
        data: {
          organizationId,
          nameEn: product.nameEn,
          nameAr: product.nameAr ?? null,
          brandEn: product.brandEn ?? null,
          specEn: product.specEn ?? null,
          category: product.category ?? null,
          subcategory: product.subcategory ?? null,
          packSize: product.packSize ?? null,
          packUnit: product.packUnit ?? null,
          packCount: product.packCount ?? null,
          barcode: product.barcode ?? null,
          source: 'import',
        },
        select: { id: true },
      })
    )
  )

  return created.map((row) => row.id)
}

/** The summaries the review screen needs for matched rows and candidates. */
export async function summariesByIds(
  session: VerifiedSession,
  ids: string[]
): Promise<Map<string, CatalogProductSummary>> {
  if (ids.length === 0) return new Map()

  const organizationId = session.user.organizationId

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
      WHERE p.id = ANY(${ids}::text[])
        AND (p."organizationId" = ${organizationId} OR p."organizationId" IS NULL)
    `
  )

  return new Map(rows.map((row) => [row.id, toSummary(row)]))
}
