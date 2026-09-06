import { PrismaClient } from '@prisma/client'
import { formatPackSize, packLabel } from '@souqstudio/types'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Real catalog rows, in the shape the render harness composes.
 *
 * **Why this exists.** The layout engine, the block library, the price mark and
 * the fit ladder are all built and tested, and every page the harness has ever
 * produced was composed from about a dozen products invented in
 * `harness/dummy.ts`. E6 §10 names the risk — *"if the engine's output looks
 * like a real flyer with no manual adjustment, the product works"* — and that
 * question has only ever been asked of data written to be answerable. The
 * catalog now holds thousands of rows it has never seen.
 *
 * **Why a file rather than a database read in the harness.** `packages/engine`
 * has no dependency on `packages/db` and must not gain one: the engine is pure
 * geometry that the web app and the PDF worker both import, and a Prisma import
 * inside it would follow into every one of them. The dependency already runs the
 * other way — `@souqstudio/db` depends on `@souqstudio/engine` — so making the
 * harness read the database would close a cycle. This writes JSON; the harness
 * reads it if it is there and falls back to the dummies if it is not.
 *
 * **Prices are invented here, and that is the one thing to hold in mind when
 * looking at the output.** A catalog row has no price — a price belongs to an
 * offer, `offer_books` holds zero rows, and E6 owns the editor that would make
 * one. So `major`, `minor`, `comparePrice` and the promo tier are derived from a
 * hash of the row id: stable across runs, plausible in shape, and *not data*.
 * Everything else on the page is real. What this can answer is whether real
 * names, brands, specs and their absences compose; what it cannot answer is
 * anything about prices, which the `WORST_CASE` dummies still cover better
 * because they carry a three-decimal currency on purpose.
 *
 * Usage:
 *
 *   pnpm --filter @souqstudio/db catalog:harness-export
 *   pnpm --filter @souqstudio/db catalog:harness-export --count 12
 *   pnpm --filter @souqstudio/db catalog:harness-export --org <organizationId>
 *   pnpm --filter @souqstudio/db catalog:harness-export --out <path>
 *
 * Then: pnpm --filter @souqstudio/engine harness
 */

const prisma = new PrismaClient()

/** Default target: the harness's own directory, which reads it by name. */
const DEFAULT_OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../engine/harness/real-products.json'
)

// ─── The shape the harness composes ───────────────────────────────────────────

interface HarnessTier {
  labelEn: string
  labelAr: string
  token: 'primary' | 'secondary' | 'accent'
}

interface HarnessProduct {
  id: string
  nameEn: string
  nameAr: string | null
  specEn: string | null
  specAr: string | null
  brandEn: string | null
  major: string
  minor: string
  currency: string
  comparePrice?: string
  tier: HarnessTier
  origin: string
}

/**
 * The three promo tiers `pnpm db:seed` publishes, as labels only.
 *
 * Not read from `promo_tiers`: those rows are per-organization and this export
 * spans the universal catalog, which belongs to no organization. The labels are
 * duplicated rather than joined because they are decoration on an invented
 * price — see the note above. If the tier ever became real data here, it would
 * come from the offer, not from the product.
 */
const TIERS: HarnessTier[] = [
  { labelEn: 'Deal', labelAr: 'عرض', token: 'accent' },
  { labelEn: 'Half price', labelAr: 'نصف السعر', token: 'primary' },
  { labelEn: 'New', labelAr: 'جديد', token: 'secondary' },
]

// ─── Selection ────────────────────────────────────────────────────────────────

type Row = {
  id: string
  nameEn: string
  nameAr: string | null
  brandEn: string | null
  specEn: string | null
  specAr: string | null
  packSize: unknown
  packUnit: 'G' | 'KG' | 'ML' | 'L' | 'PIECE' | null
  packCount: number | null
  category: string | null
  source: string | null
}

const SELECT = {
  id: true,
  nameEn: true,
  nameAr: true,
  brandEn: true,
  specEn: true,
  specAr: true,
  packSize: true,
  packUnit: true,
  packCount: true,
  category: true,
  source: true,
} as const

/**
 * Four sets, each chosen to put a different real property in front of the
 * engine. A single random page would mix all four and make any finding
 * ambiguous — the same reason `dummy.ts` ships `FRIENDLY` and `WORST_CASE`
 * separately rather than one blended list.
 */
async function collect(
  organizationId: string | null,
  count: number
): Promise<Record<string, Row[]>> {
  // The collection under test. Universal rows plus, when an org is named, that
  // organization's own — which is what a shop owner actually composes from.
  const visible =
    organizationId === null
      ? { organizationId: null }
      : { OR: [{ organizationId: null }, { organizationId }] }
  const live = { ...visible, archivedAt: null }

  // `typical` is ordered by id, which is a cuid — monotonic in creation time,
  // so this is the head of the table rather than a sample of it. Taking every
  // Nth row instead: the import wrote in barcode order, so a contiguous slice is
  // one region's products and one region's name lengths.
  const pool = await prisma.catalogProduct.findMany({
    where: live,
    select: SELECT,
    orderBy: { id: 'asc' },
  })
  const stride = Math.max(1, Math.floor(pool.length / count))
  const typical = Array.from({ length: count }, (_, i) => pool[i * stride]).filter(
    (row): row is Row => row !== undefined
  )

  // The upper bound on what the fit ladder has to absorb. Ordered in SQL rather
  // than in JS over the pool, so it is the longest in the catalog and not the
  // longest in a sample of it.
  const longest = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "id", "nameEn", "nameAr", "brandEn", "specEn", "specAr",
            "packSize"::text AS "packSize", "packUnit"::text AS "packUnit", "packCount",
            "category", "source"
       FROM catalog_products
      WHERE "archivedAt" IS NULL
        AND (${organizationId === null ? '"organizationId" IS NULL' : '"organizationId" IS NULL OR "organizationId" = $2'})
      ORDER BY length("nameEn") DESC
      LIMIT $1`,
    count,
    ...(organizationId === null ? [] : [organizationId])
  )

  // The RTL page with real strings — consistency check #9's requirement, and
  // the one set that cannot be drawn from the Open Food Facts rows at all.
  const arabic = await prisma.catalogProduct.findMany({
    where: { ...live, nameAr: { not: null } },
    select: SELECT,
    orderBy: { id: 'asc' },
    take: count,
  })

  // The thinnest rows a real catalog holds: a name and nothing else. Most of a
  // GCC-relevant Open Food Facts row set looks like this.
  const sparse = await prisma.catalogProduct.findMany({
    where: { ...live, brandEn: null, specEn: null, packSize: null },
    select: SELECT,
    orderBy: { id: 'asc' },
    take: count,
  })

  return { typical, longest, arabic, sparse }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function toHarness(row: Row): HarnessProduct {
  const h = hash(row.id)

  // The spec line as the product card builds it: the free-text spec when the
  // source had one, otherwise the pack columns through the shared label. Not a
  // third rule invented here — that is why `packLabel` moved to
  // `@souqstudio/types`.
  const packSize = row.packSize === null ? null : String(row.packSize)
  const pack = packLabel({
    packSize: formatPackSize(packSize),
    packUnit: row.packUnit,
    packCount: row.packCount,
  })

  const base: HarnessProduct = {
    id: row.id,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    specEn: row.specEn ?? pack,
    specAr: row.specAr,
    brandEn: row.brandEn,
    // Invented. See the header note.
    major: String((h % 97) + 2),
    minor: ['00', '25', '50', '75', '95'][h % 5] ?? '00',
    currency: 'AED',
    tier: TIERS[h % TIERS.length] ?? TIERS[0]!,
    origin: row.source ?? 'unknown',
  }

  // A third of cards carry a struck-through was-price, which is what makes the
  // price mark's compare piece appear at all.
  if (h % 3 === 0) {
    const was = Math.round(((h % 97) + 2) * 1.35)
    return { ...base, comparePrice: `${was}.00` }
  }
  return base
}

/** FNV-1a. Any stable hash would do; the point is that a re-export produces the
 *  same invented prices, so a change in the output is a change in the catalog or
 *  in the engine and never in this script. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// ─── Counts, so the page can be read against the catalog it came from ─────────

async function census(organizationId: string | null) {
  const visible =
    organizationId === null
      ? { organizationId: null }
      : { OR: [{ organizationId: null }, { organizationId }] }
  const where = { ...visible, archivedAt: null }

  const [total, withNameAr, withBrand, withSpec, withPack, withCategory, withImage] =
    await Promise.all([
      prisma.catalogProduct.count({ where }),
      prisma.catalogProduct.count({ where: { ...where, nameAr: { not: null } } }),
      prisma.catalogProduct.count({ where: { ...where, brandEn: { not: null } } }),
      prisma.catalogProduct.count({ where: { ...where, specEn: { not: null } } }),
      prisma.catalogProduct.count({ where: { ...where, packSize: { not: null } } }),
      prisma.catalogProduct.count({ where: { ...where, category: { not: null } } }),
      prisma.catalogProduct.count({ where: { ...where, images: { some: {} } } }),
    ])

  return { total, withNameAr, withBrand, withSpec, withPack, withCategory, withImage }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

type Options = { organizationId: string | null; count: number; out: string }

function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | null => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }
  const count = Number(value('--count') ?? 12)

  return {
    organizationId: value('--org'),
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 12,
    out: value('--out') ?? DEFAULT_OUT,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const counts = await census(options.organizationId)
  if (counts.total === 0) {
    console.error(
      '[harness-export] the catalog is empty — run `pnpm --filter @souqstudio/db catalog:seed-demo` first'
    )
    process.exit(1)
  }

  const sets = await collect(options.organizationId, options.count)
  const mapped = Object.fromEntries(
    Object.entries(sets).map(([name, rows]) => [name, rows.map(toHarness)])
  )

  const payload = {
    // Everything a reader of the JSON needs to know it is not looking at data.
    note:
      'Real catalog rows with INVENTED prices and promo tiers. A catalog row has no ' +
      'price; offer_books holds zero rows. Names, brands, specs and their absences are real.',
    generatedAt: new Date().toISOString(),
    organizationId: options.organizationId,
    counts,
    sets: mapped,
  }

  mkdirSync(dirname(options.out), { recursive: true })
  writeFileSync(options.out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const pct = (n: number) => `${((n / counts.total) * 100).toFixed(1)}%`
  console.log(`[harness-export] ${counts.total} rows visible`)
  console.log(
    `[harness-export]   nameAr ${counts.withNameAr} (${pct(counts.withNameAr)}), ` +
      `brand ${counts.withBrand} (${pct(counts.withBrand)}), ` +
      `spec ${counts.withSpec} (${pct(counts.withSpec)}), ` +
      `pack ${counts.withPack} (${pct(counts.withPack)}), ` +
      `category ${counts.withCategory} (${pct(counts.withCategory)}), ` +
      `image ${counts.withImage} (${pct(counts.withImage)})`
  )
  for (const [name, rows] of Object.entries(mapped)) {
    console.log(`[harness-export]   ${name}: ${rows.length}`)
  }
  console.log(`[harness-export] wrote ${options.out}`)
  console.log('[harness-export] now run: pnpm --filter @souqstudio/engine harness')
}

main()
  .catch((error) => {
    console.error('[harness-export] failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
