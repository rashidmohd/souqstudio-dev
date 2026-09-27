import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
/**
 * From `../src/client`, not the package index: the index opens five BullMQ
 * queues at import and the script would never exit. `import-unioncoop.ts`
 * carries the full note.
 */
import { prisma } from '../src/client'

/**
 * The universal catalog, as one file that `catalog:restore` can load back.
 *
 * ```
 * pnpm --filter @souqstudio/db catalog:backup
 * pnpm --filter @souqstudio/db catalog:backup -- --out ../../backups/before-import.json.gz
 * ```
 *
 * **Why this exists.** On 27 September the dev database was wiped from a
 * laptop, catalog and all, and the only Railway backup was a month old — from
 * before the Union Coop import. The catalog is the slowest thing in the
 * database to rebuild (an import, then an image run of hours), and the one a
 * book cannot be made without.
 *
 * **What it holds**: every category and brand, every *universal* product
 * (`organizationId` null — a shop's own products are that shop's data, not the
 * catalog's), and those products' synonyms and image rows. **Not the images**:
 * they live in R2 under keys derived from the rows, and a wiped database leaves
 * the bucket alone, so restoring the rows finds the pictures again.
 *
 * **Rows as Prisma returns them**, not SQL. `pg_dump` has to be at least the
 * server's version, and a laptop's is usually older than Railway's — this
 * works against any server the app itself can reach.
 */

function parseOut(argv: string[]): string {
  const at = argv.indexOf('--out')
  const given = at === -1 ? null : argv[at + 1]
  if (given !== undefined && given !== null) return resolve(process.cwd(), given)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return resolve(process.cwd(), `../../backups/catalog-${stamp}.json.gz`)
}

async function main(): Promise<void> {
  const out = parseOut(process.argv.slice(2))

  const categories = await prisma.catalogCategory.findMany()
  const brands = await prisma.productBrand.findMany()
  const products = await prisma.catalogProduct.findMany({ where: { organizationId: null } })
  const ids = products.map((product) => product.id)
  const synonyms = await prisma.productSynonym.findMany({ where: { catalogId: { in: ids } } })
  const images = await prisma.imageAsset.findMany({ where: { productId: { in: ids } } })

  const document = {
    version: 1,
    takenAt: new Date().toISOString(),
    counts: {
      catalogCategory: categories.length,
      productBrand: brands.length,
      catalogProduct: products.length,
      productSynonym: synonyms.length,
      imageAsset: images.length,
    },
    rows: {
      catalogCategory: categories,
      productBrand: brands,
      catalogProduct: products,
      productSynonym: synonyms,
      imageAsset: images,
    },
  }

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, gzipSync(JSON.stringify(document)))
  console.log(`[backup] ${JSON.stringify(document.counts)}`)
  console.log(`[backup] written to ${out}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
