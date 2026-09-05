import { createReadStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { PrismaClient } from '@prisma/client'
import {
  OFF_FIELDS,
  isRelevant,
  toProduct,
  type OffProduct,
  type OffRow,
} from '../src/off-mapping'

/**
 * Seed the universal catalog from Open Food Facts. E5, "Catalog Sources".
 *
 * ```
 * pnpm catalog:import-off -- --url                 # stream the live export
 * pnpm catalog:import-off -- --file off.csv.gz     # or a copy already on disk
 * pnpm catalog:import-off -- --url --limit 5000    # a smoke run
 * pnpm catalog:import-off -- --url --dry-run       # parse and count, write nothing
 * ```
 *
 * **Streamed, never loaded.** The export is 1.28GB gzipped and about 9GB open —
 * far past what fits in memory, and the reason this is a script with a pipeline
 * rather than a function that returns rows. It is read a line at a time, mapped,
 * and written in batches; peak memory is one batch.
 *
 * **Licence: ODbL, which permits commercial use, and no images are taken.** The
 * mapping module reads a named handful of columns and the image columns are not
 * among them — see the note there. That is a licence position rather than a
 * preference: E5's "Catalog Sources" table says images come from licensed
 * sources or direct brand permission only, and never from scraping.
 *
 * **Idempotent by barcode.** Rows are upserted against the universal partial
 * unique index, so a re-run after a failed one corrects rather than duplicates.
 * That index — `catalog_products_universal_barcode_key` — is what makes this
 * safe, and it exists because Postgres treats NULLs as distinct and every
 * universal row has a null `organizationId`.
 *
 * **It never touches an organization's own rows.** Everything written here has
 * `organizationId: null`. A shop that has corrected a public record keeps its
 * correction: E5 §1's shadowing means their row wins on read regardless of what
 * lands here.
 */

const EXPORT_URL =
  'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'

/**
 * The export is tab-separated despite the `.csv` name, and quoting is absent —
 * which is why this does not reuse the RFC-4180 parser the spreadsheet import
 * uses. A field containing a tab would be malformed at source; a field
 * containing a comma or a quote is ordinary and would be mangled by a parser
 * expecting quotes to be significant.
 */
const DELIMITER = '\t'

/** Rows per write. Large enough to amortise the round trip, small enough to retry. */
const BATCH_SIZE = 500

type Options = {
  source: { kind: 'url'; url: string } | { kind: 'file'; path: string }
  limit: number | null
  dryRun: boolean
}

function parseArgs(argv: string[]): Options {
  const has = (flag: string) => argv.includes(flag)
  const value = (flag: string): string | null => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  const file = value('--file')
  const limitRaw = value('--limit')
  const limit = limitRaw ? Number(limitRaw) : null

  return {
    source: file ? { kind: 'file', path: file } : { kind: 'url', url: EXPORT_URL },
    limit: limit !== null && Number.isFinite(limit) && limit > 0 ? limit : null,
    dryRun: has('--dry-run'),
  }
}

async function openSource(options: Options): Promise<NodeJS.ReadableStream> {
  if (options.source.kind === 'file') {
    return createReadStream(options.source.path)
  }

  console.log(`[off] streaming ${options.source.url}`)
  const response = await fetch(options.source.url, {
    // Open Food Facts asks that bulk clients identify themselves, and a request
    // without this is the one they rate-limit first.
    headers: { 'User-Agent': 'SouqStudio/0.1 (catalog seed; support@souqstudio.com)' },
  })

  if (!response.ok || !response.body) {
    throw new Error(`[off] export fetch failed: ${response.status}`)
  }
  return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
}

const prisma = new PrismaClient()

/**
 * Written one row at a time inside a transaction rather than with `createMany`.
 *
 * `createMany` cannot upsert, and `skipDuplicates` would silently drop the
 * corrections a re-run exists to apply — an OFF row whose name was fixed
 * upstream would never reach us. The cost is real and is the reason for the
 * batch size; correctness of a re-run is worth more than the throughput.
 */
async function writeBatch(batch: OffProduct[]): Promise<number> {
  if (batch.length === 0) return 0

  await prisma.$transaction(
    batch.map((product) =>
      prisma.catalogProduct.upsert({
        // The compound unique index. `organizationId: null` is the universal
        // collection, and is what the partial index in the E5 migration covers.
        where: { organizationId_barcode: { organizationId: null, barcode: product.barcode } },
        update: {
          nameEn: product.nameEn,
          nameAr: product.nameAr,
          brandEn: product.brandEn,
          specEn: product.specEn,
          originEn: product.originEn,
          category: product.category,
          tags: product.tags,
        },
        create: {
          organizationId: null,
          barcode: product.barcode,
          nameEn: product.nameEn,
          nameAr: product.nameAr,
          brandEn: product.brandEn,
          specEn: product.specEn,
          originEn: product.originEn,
          category: product.category,
          tags: product.tags,
          source: 'open_food_facts',
        },
      })
    )
  )

  return batch.length
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  console.log(
    `[off] ${options.dryRun ? 'dry run' : 'writing'}${options.limit ? `, limit ${options.limit}` : ''}`
  )

  const source = await openSource(options)
  const stream =
    options.source.kind === 'file' && !options.source.path.endsWith('.gz')
      ? source
      : source.pipe(createGunzip())

  const lines = createInterface({ input: stream, crlfDelay: Infinity })

  let header: string[] | null = null
  let seen = 0
  let relevant = 0
  let mapped = 0
  let written = 0
  let batch: OffProduct[] = []

  for await (const line of lines) {
    if (!header) {
      header = line.split(DELIMITER)
      const missing = OFF_FIELDS.filter((field) => !header?.includes(field))
      // Fail loudly rather than importing nine million rows of nulls. The export
      // has changed its columns before, and a silent success is the worst
      // outcome available here.
      if (missing.length > 0) {
        throw new Error(`[off] export is missing expected columns: ${missing.join(', ')}`)
      }
      continue
    }

    seen += 1
    const cells = line.split(DELIMITER)

    const row: OffRow = {}
    for (const field of OFF_FIELDS) {
      const index = header.indexOf(field)
      if (index !== -1) row[field] = cells[index]
    }

    if (!isRelevant(row)) continue
    relevant += 1

    const product = toProduct(row)
    if (!product) continue
    mapped += 1

    if (!options.dryRun) {
      batch.push(product)
      if (batch.length >= BATCH_SIZE) {
        written += await writeBatch(batch)
        batch = []
        console.log(`[off] ${written} written · ${seen} rows read`)
      }
    }

    if (options.limit && mapped >= options.limit) break
  }

  if (!options.dryRun) written += await writeBatch(batch)

  console.log(
    [
      `[off] done.`,
      `read ${seen}`,
      `GCC-relevant ${relevant}`,
      `mapped ${mapped}`,
      options.dryRun ? 'written 0 (dry run)' : `written ${written}`,
    ].join(' · ')
  )

  // Said explicitly because the number is always much smaller than `read`, and
  // a run that looks like it lost most of the file has not.
  console.log(
    `[off] ${seen - relevant} rows were not listed for a relevant country, and ` +
      `${relevant - mapped} more had no usable barcode or name.`
  )
}

main()
  .catch((error: unknown) => {
    console.error('[off] failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
