import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { Prisma } from '@prisma/client'
/** From `../src/client`, for the reason `catalog-backup.ts` gives. */
import { prisma } from '../src/client'

/**
 * Load a `catalog:backup` file back into the database.
 *
 * ```
 * pnpm --filter @souqstudio/db catalog:restore -- --file ../../backups/catalog-….json.gz --dry-run
 * pnpm --filter @souqstudio/db catalog:restore -- --file ../../backups/catalog-….json.gz
 * ```
 *
 * **Adds, never replaces.** Every insert skips a row whose id is already
 * there, so a restore over a catalog that survived changes nothing and a
 * second run is harmless. It deletes nothing.
 *
 * **In dependency order**, and within a table parents before children:
 * categories before their subcategories, brands before products, products
 * before their synonyms and images, an original image before what was derived
 * from it.
 *
 * The file holds JSON, so values come back as JSON types. The schema says what
 * each field is, and that is what turns an ISO string back into a date and a
 * `null` in a JSON column back into a database null, which Prisma will not take
 * as a plain `null`.
 */

const ORDER = [
  'catalogCategory',
  'productBrand',
  'catalogProduct',
  'productSynonym',
  'imageAsset',
] as const
type Table = (typeof ORDER)[number]

const MODEL: Record<Table, string> = {
  catalogCategory: 'CatalogCategory',
  productBrand: 'ProductBrand',
  catalogProduct: 'CatalogProduct',
  productSynonym: 'ProductSynonym',
  imageAsset: 'ImageAsset',
}

type Row = Record<string, unknown>

/** Rows with their schema types restored, relations and unsupported columns left out. */
function revive(table: Table, rows: Row[]): Row[] {
  const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === MODEL[table])
  if (model === undefined) throw new Error(`restore: no model ${MODEL[table]} in this schema`)
  const fields = new Map(
    model.fields.filter((field) => field.kind !== 'object').map((field) => [field.name, field])
  )
  return rows.map((row) => {
    const out: Row = {}
    for (const [name, value] of Object.entries(row)) {
      const field = fields.get(name)
      if (field === undefined) continue
      if (field.type === 'DateTime' && typeof value === 'string') out[name] = new Date(value)
      else if (field.type === 'Json' && value === null) out[name] = Prisma.DbNull
      else out[name] = value
    }
    return out
  })
}

/** Parents first, so a self-reference always points at a row already written. */
function parentsFirst(rows: Row[], parentKey: string): Row[] {
  return [...rows].sort(
    (a, b) => Number(a[parentKey] !== null && a[parentKey] !== undefined) -
      Number(b[parentKey] !== null && b[parentKey] !== undefined)
  )
}

async function insert(table: Table, rows: Row[]): Promise<number> {
  let written = 0
  for (let at = 0; at < rows.length; at += 500) {
    const data = rows.slice(at, at + 500)
    // `createMany` is on every delegate; the table name picks which one, and
    // the rows were typed by `revive` from the same schema the delegate is.
    const delegate = prisma[table] as unknown as {
      createMany: (args: { data: Row[]; skipDuplicates: boolean }) => Promise<{ count: number }>
    }
    const { count } = await delegate.createMany({ data, skipDuplicates: true })
    written += count
  }
  return written
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--file')
  const file = at === -1 ? undefined : argv[at + 1]
  if (file === undefined) throw new Error('restore: say which backup, with --file <path>')
  const dryRun = argv.includes('--dry-run')

  const document = JSON.parse(gunzipSync(readFileSync(resolve(process.cwd(), file))).toString()) as {
    version: number
    takenAt: string
    rows: Record<Table, Row[]>
  }
  if (document.version !== 1) throw new Error(`restore: unknown backup version ${document.version}`)
  console.log(`[restore] backup taken ${document.takenAt}`)

  for (const table of ORDER) {
    let rows = revive(table, document.rows[table] ?? [])
    if (table === 'catalogCategory') rows = parentsFirst(rows, 'parentId')
    if (table === 'imageAsset') rows = parentsFirst(rows, 'derivedFrom')
    if (dryRun) {
      console.log(`[restore] ${table}: ${rows.length} rows in the file`)
      continue
    }
    const written = await insert(table, rows)
    console.log(`[restore] ${table}: ${written} added, ${rows.length - written} already there`)
  }
  if (dryRun) console.log('[restore] dry run — nothing written')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
