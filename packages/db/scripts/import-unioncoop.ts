import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { brandSlug } from '@souqstudio/types'
/**
 * **From `../src/client`, not `../src/index`.** The package's entry point
 * re-exports `queue-client.ts`, which constructs five BullMQ queues at module
 * load — and a `Queue` opens its Redis connection immediately. Importing the
 * index here makes this script hold five idle connections for the length of a
 * bulk run and then never exit, because those handles keep the event loop
 * alive. Verified: the dry run printed its report and hung.
 *
 * This does not weaken the rule in CLAUDE.md that nothing imports
 * `@prisma/client` directly. That rule is about applications reaching past this
 * package; `src/client.ts` *is* this package's client, and a script inside it
 * may name the module it needs.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../src/client'
import {
  toProduct,
  type UnionCoopProduct,
  type UnionCoopRow,
} from '../src/unioncoop-mapping'

/**
 * Fill the universal catalog from a Union Coop export. The streaming and
 * writing half; `src/unioncoop-mapping.ts` is the deciding half and the tested
 * one.
 *
 * ```
 * pnpm --filter @souqstudio/db catalog:import-unioncoop -- --dry-run
 * pnpm --filter @souqstudio/db catalog:import-unioncoop
 * pnpm --filter @souqstudio/db catalog:import-unioncoop -- --limit 500
 * ```
 *
 * **Images are not touched here.** This script writes rows and records where
 * each row's packshot can be fetched from, in `metadata.sourceImageUrl`.
 * Fetching it, resizing it and writing `image_assets` is
 * `apps/worker/src/scripts/ingest-catalog-images.ts`, and it is a separate run
 * for three reasons: `packages/db` has neither `sharp` nor an S3 client and
 * should not grow them, the worker is already the only thing in the system that
 * writes a processed asset, and the rows are worth having on their own — the
 * Arabic names alone unblock Arabic editions — so a network failure fetching
 * 17,000 files must not be able to roll back the import.
 *
 * **Idempotent.** Every row is matched against the universal collection by
 * barcode first and item code second, so a second run updates rather than
 * duplicating. It never touches a row belonging to an organization.
 */

type Args = {
  file: string
  dryRun: boolean
  limit: number | null
  batch: number
  overwrite: boolean
}

function parseArgs(argv: string[]): Args {
  const has = (flag: string): boolean => argv.includes(flag)
  const value = (flag: string): string | null => {
    const at = argv.indexOf(flag)
    return at === -1 ? null : (argv[at + 1] ?? null)
  }

  const limit = value('--limit')
  const batch = value('--batch')

  return {
    file: value('--file') ?? resolve(process.cwd(), '../../products/products.json'),
    dryRun: has('--dry-run'),
    limit: limit === null ? null : Number(limit),
    batch: batch === null ? 500 : Number(batch),
    overwrite: has('--overwrite'),
  }
}

/** What `catalog_products.source` records for a row that came from this feed. */
const SOURCE = 'unioncoop'

/**
 * Sources this import may overwrite in place.
 *
 * **A row somebody curated is never overwritten by a scrape.** `manual` and
 * `user_contribution` rows were written by a person who looked at the product;
 * this feed is a retailer's website. Those rows are filled where they are empty
 * and left alone where they are not — which is still worth doing, because the
 * field most of them are missing is `nameAr` and that is the field this feed
 * has.
 *
 * `--overwrite` forces the full update regardless, for the case where a bad run
 * has to be corrected.
 */
const OVERWRITABLE = new Set([SOURCE, 'open_food_facts', 'demo', null])

type ExistingRow = {
  id: string
  barcode: string | null
  sku: string | null
  source: string | null
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  console.log(`[unioncoop] reading ${args.file}`)
  const parsed: unknown = JSON.parse(readFileSync(args.file, 'utf8'))
  const rows = extractRows(parsed)
  console.log(`[unioncoop] ${rows.length} rows in the file`)

  const source = args.limit === null ? rows : rows.slice(0, args.limit)

  // ─── Map ────────────────────────────────────────────────────────────────────

  const mapped: UnionCoopProduct[] = []
  let skipped = 0
  for (const row of source) {
    const product = toProduct(row)
    if (product) mapped.push(product)
    else skipped += 1
  }
  console.log(`[unioncoop] mapped ${mapped.length}, skipped ${skipped}`)

  if (args.dryRun) {
    report(mapped)
    console.log('[unioncoop] dry run — nothing written')
    return
  }

  // ─── Brands ─────────────────────────────────────────────────────────────────
  //
  // Resolved up front and in bulk rather than per product: 18,428 rows carry
  // 1,611 distinct brands, so doing it inline is 18,428 upserts to write 1,611
  // rows. `brandSlug()` is what collapses `ALMARAI`, `Almarai` and `Al Marai`
  // onto one of them — this script must not compute that key itself.

  const brandIdBySlug = await resolveBrands(mapped)
  console.log(`[unioncoop] ${brandIdBySlug.size} brands resolved`)

  // ─── Existing rows ──────────────────────────────────────────────────────────
  //
  // One query rather than a lookup per row. The universal collection is the
  // only thing consulted: `organizationId: null` is the whole tenancy rule
  // here, and a private row carrying the same barcode is a shop's own
  // correction which E5 §1 says shadows this one rather than being replaced by
  // it.

  const existing = (await prisma.catalogProduct.findMany({
    where: { organizationId: null },
    select: { id: true, barcode: true, sku: true, source: true },
  })) as ExistingRow[]

  const byBarcode = new Map<string, ExistingRow>()
  const bySku = new Map<string, ExistingRow>()
  for (const row of existing) {
    if (row.barcode) byBarcode.set(row.barcode, row)
    if (row.sku) bySku.set(row.sku, row)
  }
  console.log(`[unioncoop] ${existing.length} universal rows already present`)

  // ─── Write ──────────────────────────────────────────────────────────────────

  let created = 0
  let updated = 0
  let leftAlone = 0
  let duplicates = 0

  /** Keys this run has already inserted. See the note where it is filled. */
  const writtenThisRun = new Set<string>()

  /**
   * **No transaction around a batch, and that is deliberate.**
   *
   * The first version wrapped each batch in `prisma.$transaction`, and it
   * failed on the first real run with P2028 — an interactive transaction
   * defaults to a five-second budget, and twenty sequential writes over a
   * remote connection is already past it. Raising the timeout would have been
   * the wrong fix twice over: an interactive transaction holds its locks for
   * the whole run, and this import has nothing to roll back to. It is
   * idempotent and resumable by construction, so an interrupted run leaves a
   * partially filled catalog that the next run completes — which is exactly
   * what per-batch atomicity would have bought, without the locks.
   */
  for (let at = 0; at < mapped.length; at += args.batch) {
    const slice = mapped.slice(at, at + args.batch)

    const inserts: Prisma.CatalogProductCreateManyInput[] = []

    for (const product of slice) {
      /**
       * **Barcode first, item code second.** A barcode is the world's identity
       * for a product and the item code is one retailer's, so a barcode match
       * is the stronger claim — the same precedence `catalog-import.ts`
       * applies to an owner's spreadsheet, inverted only because that one
       * matches within a single shop's own collection, where its item code is
       * the more authoritative key.
       */
      if (
        (product.barcode && writtenThisRun.has(`b:${product.barcode}`)) ||
        writtenThisRun.has(`s:${product.sku}`)
      ) {
        // The file carried this identity twice. Neither key repeats in the
        // 18,428 rows measured, so this is a guard rather than a path — but a
        // second insert under the same barcode is the one failure that would
        // put a duplicate into the shared catalog.
        duplicates += 1
        continue
      }

      const match =
        (product.barcode ? byBarcode.get(product.barcode) : undefined) ??
        bySku.get(product.sku)

      const data = toRow(product, brandIdBySlug)

      if (!match) {
        inserts.push({ ...data, organizationId: null })
        continue
      }

      const mayOverwrite = args.overwrite || OVERWRITABLE.has(match.source)
      if (!mayOverwrite) {
        // Fill the holes and touch nothing else. `nameAr` is the one that
        // matters: a curated row missing it cannot publish an Arabic edition.
        await prisma.catalogProduct.update({
          where: { id: match.id },
          data: fillOnly(data),
        })
        leftAlone += 1
        continue
      }

      await prisma.catalogProduct.update({ where: { id: match.id }, data })
      updated += 1
    }

    if (inserts.length > 0) {
      /**
       * One round trip per batch rather than one per row. Over a remote
       * database that is the difference between minutes and hours: 18,428
       * inserts at a few hundred milliseconds each is most of a day.
       *
       * Safe as a bulk insert because **barcode and item code are both unique
       * within the file** — 17,888 distinct barcodes across 17,888 rows that
       * have one, and 18,428 distinct SKUs across 18,428 rows — so no batch can
       * collide with itself. `skipDuplicates` covers the remaining case, a row
       * the universal collection gained between the lookup above and this
       * write.
       */
      const result = await prisma.catalogProduct.createMany({
        data: inserts,
        skipDuplicates: true,
      })
      created += result.count

      /**
       * Remember what this run inserted, so a later batch cannot insert it
       * again.
       *
       * A *set of keys* rather than entries in the two lookup maps above:
       * `createMany` returns a count and not the ids, so a map entry for one of
       * these rows would have no id to update by, and the next batch would
       * issue `update({ where: { id: '' } })` and fail. This says "already
       * written, skip it" — which is the only thing the run can honestly know.
       */
      for (const insert of inserts) {
        if (insert.barcode) writtenThisRun.add(`b:${insert.barcode}`)
        if (insert.sku) writtenThisRun.add(`s:${insert.sku}`)
      }
    }

    console.log(
      `[unioncoop] ${Math.min(at + args.batch, mapped.length)}/${mapped.length} — ` +
        `${created} created, ${updated} updated, ${leftAlone} filled`
    )
  }

  console.log(
    `[unioncoop] done: ${created} created, ${updated} updated, ${leftAlone} filled in place` +
      (duplicates > 0 ? `, ${duplicates} duplicate identities skipped` : '')
  )
  console.log(
    '[unioncoop] images are not fetched by this script — run ' +
      'pnpm --filter @souqstudio/worker catalog:images next'
  )
}

/** The file is `{ count, products: [...] }`; a bare array is accepted too. */
function extractRows(parsed: unknown): UnionCoopRow[] {
  if (Array.isArray(parsed)) return parsed as UnionCoopRow[]
  if (parsed && typeof parsed === 'object' && 'products' in parsed) {
    const products = (parsed as { products: unknown }).products
    if (Array.isArray(products)) return products as UnionCoopRow[]
  }
  throw new Error('Expected { products: [...] } or a bare array')
}

/**
 * The write shape. Kept out of the mapping module so that stays free of Prisma
 * — this function is the one place the pure half and the client meet.
 */
function toRow(
  product: UnionCoopProduct,
  brandIdBySlug: Map<string, string>
): Prisma.CatalogProductUncheckedCreateInput {
  const brandId = product.brandEn ? brandIdBySlug.get(brandSlug(product.brandEn)) : undefined

  return {
    nameEn: product.nameEn,
    nameAr: product.nameAr,
    brandEn: product.brandEn,
    // No Arabic brand in this feed. The seeded canonical brands carry one, and
    // a card reads it off `product_brands` when `brandId` resolved.
    brandAr: null,
    ...(brandId === undefined ? {} : { brandId }),
    specEn: product.specEn,
    originEn: product.originEn,
    category: product.category,
    subcategory: product.subcategory,
    packSize:
      product.packSize === null ? null : new Prisma.Decimal(product.packSize.toFixed(3)),
    packUnit: product.packUnit,
    packCount: product.packCount,
    sellBy: product.sellBy,
    sku: product.sku,
    barcode: product.barcode,
    tags: product.tags,
    source: SOURCE,
    /**
     * Provenance, and the queue for the image run.
     *
     * `sourceImageUrl` is what `ingest-catalog-images.ts` reads; it is left in
     * place after the fetch rather than cleared, because the presence of an
     * `image_assets` row is what says the image arrived, and keeping the
     * original URL is what lets a licensed replacement pass find the products
     * whose packshot came from here.
     */
    metadata: {
      source: SOURCE,
      sourceUrl: product.sourceUrl,
      sourceImageUrl: product.sourceImageUrl,
      sourceSku: product.sku,
    } satisfies Prisma.InputJsonObject,
  }
}

/** The same row, reduced to the columns a curated row may have filled in. */
function fillOnly(
  data: Prisma.CatalogProductUncheckedCreateInput
): Prisma.CatalogProductUncheckedUpdateInput {
  const fill: Prisma.CatalogProductUncheckedUpdateInput = {}

  if (data.nameAr) fill.nameAr = data.nameAr
  if (data.brandEn) fill.brandEn = data.brandEn
  if (data.originEn) fill.originEn = data.originEn
  if (data.category) fill.category = data.category
  if (data.subcategory) fill.subcategory = data.subcategory
  // All three or none — the same rule the mapping enforces, restated because
  // this is a different write path and a partial set here would be just as
  // wrong. `undefined` is excluded explicitly: under `exactOptionalPropertyTypes`
  // it is not the same thing as "leave this column alone".
  if (data.packSize !== null && data.packSize !== undefined && data.packUnit) {
    fill.packSize = data.packSize
    fill.packUnit = data.packUnit
    fill.packCount = data.packCount ?? null
  }
  return fill
}

/**
 * Every distinct brand in the batch, as `product_brands` rows.
 *
 * Created `unreviewed`, which is what everything ingest produces — review
 * decides promotion, not availability. The 92 curated brands `pnpm db:seed`
 * publishes are `canonical` and already carry Arabic; an upsert on the slug
 * finds them rather than writing a second row, which is the entire reason the
 * slug exists.
 */
async function resolveBrands(products: UnionCoopProduct[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const product of products) {
    if (!product.brandEn) continue
    const slug = brandSlug(product.brandEn)
    if (slug && !names.has(slug)) names.set(slug, product.brandEn.trim())
  }

  const resolved = new Map<string, string>()
  for (const [slug, nameEn] of names) {
    const row = await prisma.productBrand.upsert({
      where: { slug },
      // An existing brand keeps its name — a canonical row's curated spelling
      // must not be replaced by whatever case this feed wrote.
      update: {},
      create: { slug, nameEn, status: 'unreviewed' },
      select: { id: true },
    })
    resolved.set(slug, row.id)
  }
  return resolved
}

/** What a dry run prints, so the mapping can be judged before anything is written. */
function report(products: UnionCoopProduct[]): void {
  const total = products.length || 1
  const share = (n: number): string => `${n} (${((n / total) * 100).toFixed(1)}%)`

  console.log('  barcode      ', share(products.filter((p) => p.barcode).length))
  console.log('  nameAr       ', share(products.filter((p) => p.nameAr).length))
  console.log('  brandEn      ', share(products.filter((p) => p.brandEn).length))
  console.log('  originEn     ', share(products.filter((p) => p.originEn).length))
  console.log('  category     ', share(products.filter((p) => p.category).length))
  console.log(
    '  pack maths   ',
    share(products.filter((p) => p.packSize !== null && p.packUnit !== null).length)
  )
  console.log('  LOOSE        ', share(products.filter((p) => p.sellBy === 'LOOSE').length))
  console.log('  image to fetch', share(products.filter((p) => p.sourceImageUrl).length))

  const uncategorised = products.filter((p) => !p.category).length
  if (uncategorised > 0) {
    console.log(
      `  ${uncategorised} rows have no browsable category — the hypermarket aisles the ` +
        'ten do not cover. Searchable, not browsable. See pickCategory.'
    )
  }
}

main()
  .catch((error: unknown) => {
    console.error('[unioncoop] failed:', error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
