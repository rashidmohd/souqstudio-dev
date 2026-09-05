import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { createImportedProducts, type NewProduct } from '@/lib/catalog'
import { hasValidCheckDigit, normalizeBarcode } from '@/lib/catalog-display'
import {
  parsePackSize,
  parsePackUnit,
  type CanonicalField,
  type ColumnMap,
} from '@/lib/catalog-import'

/**
 * E5-06 — commit a reviewed import.
 *
 * **This lands rows in the catalog and stops there.** The epic's last step is
 * "offers created in the book, prices carried from the sheet", and there are no
 * offer books: `offer_books` holds zero rows and E6 owns the editor that makes
 * them. So the prices stay on `catalog_import_rows.price`, where the schema
 * already puts them, and the offer-creating half is E6's to add — one read of
 * the committed rows, not a rewrite of any of this.
 *
 * What it does do is the part that was blocking everything: an owner's own
 * product list, several hundred rows of it, becomes catalog rows they can put
 * on a page.
 *
 * Every decision is the owner's. `use` confirms a match — including one they
 * picked from an ambiguous row's candidates — `create` makes a new product from
 * their own row, and `skip` leaves it out. **Nothing defaults**: a row the
 * client does not mention keeps the status it had and is not committed, because
 * silently creating products for rows nobody looked at is how a catalog fills
 * with a supplier's whole price list.
 */

const schema = z.object({
  decisions: z
    .array(
      z.object({
        rowId: z.string().min(1),
        action: z.enum(['use', 'create', 'skip']),
        /** Required for `use`: which product this row is. */
        catalogProductId: z.string().min(1).optional(),
      })
    )
    .min(1)
    .max(10_000),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const record = await prisma.catalogImport.findFirst({
    where: { id: params.id, organizationId: session.user.organizationId },
    select: { id: true, columnMap: true, committedAt: true },
  })
  if (!record) return fail('not_found', 'That import could not be found.', 404)
  if (record.committedAt) {
    return fail('already_committed', 'That import has already been committed.', 409)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Something in that review could not be read. Try again.', 422)
  }

  const decisions = parsed.data.decisions
  const rows = await prisma.catalogImportRow.findMany({
    // Scoped through `importId`, which was itself scoped by organization above.
    // A findMany on the ids alone would accept another tenant's row ids.
    where: { importId: record.id, id: { in: decisions.map((d) => d.rowId) } },
    select: { id: true, raw: true },
  })
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  const byField = fieldHeaders(record.columnMap)

  // ── Products to create ─────────────────────────────────────────────────
  const creating = decisions.filter((decision) => decision.action === 'create')
  const drafts: NewProduct[] = []
  const draftRowIds: string[] = []

  for (const decision of creating) {
    const row = rowsById.get(decision.rowId)
    if (!row) continue

    const draft = toProduct(row.raw, byField)
    // A row with no name cannot become a product. It is not an error — the
    // owner asked to create from a row whose name column happens to be blank —
    // so it is skipped rather than failing the whole commit.
    if (!draft) continue

    drafts.push(draft)
    draftRowIds.push(decision.rowId)
  }

  const createdIds = await createImportedProducts(session, drafts)

  // ── Write the outcome back onto the rows ───────────────────────────────
  const updates = []

  draftRowIds.forEach((rowId, index) => {
    const catalogProductId = createdIds[index]
    if (!catalogProductId) return
    updates.push(
      prisma.catalogImportRow.update({
        where: { id: rowId },
        data: { status: 'CREATED', catalogProductId },
      })
    )
  })

  for (const decision of decisions) {
    if (!rowsById.has(decision.rowId)) continue

    if (decision.action === 'use' && decision.catalogProductId) {
      updates.push(
        prisma.catalogImportRow.update({
          where: { id: decision.rowId },
          data: { status: 'MATCHED', catalogProductId: decision.catalogProductId },
        })
      )
    }

    if (decision.action === 'skip') {
      updates.push(
        prisma.catalogImportRow.update({
          where: { id: decision.rowId },
          data: { status: 'SKIPPED', catalogProductId: null },
        })
      )
    }
  }

  updates.push(
    prisma.catalogImport.update({
      where: { id: record.id },
      data: { status: 'COMMITTED', committedAt: new Date() },
    })
  )

  await prisma.$transaction(updates)

  return ok({
    importId: record.id,
    created: createdIds.length,
    matched: decisions.filter((d) => d.action === 'use').length,
    skipped: decisions.filter((d) => d.action === 'skip').length,
  })
}

/** The confirmed map, inverted: canonical field → the owner's header name. */
function fieldHeaders(columnMap: unknown): Map<CanonicalField, string> {
  const byField = new Map<CanonicalField, string>()
  if (typeof columnMap !== 'object' || columnMap === null) return byField

  for (const [header, field] of Object.entries(columnMap as ColumnMap)) {
    if (typeof field === 'string' && !byField.has(field as CanonicalField)) {
      byField.set(field as CanonicalField, header)
    }
  }
  return byField
}

/**
 * One raw row, read through the confirmed map, as a product.
 *
 * Every optional field that does not parse is left null rather than guessed —
 * a pack size of "500g" stays out of `packSize` (E5 §4: that cell cannot be
 * split reliably, and a wrong one feeds a confident wrong unit price), and a
 * barcode that fails its check digit is dropped rather than stored, because a
 * stored bad barcode shadows the real product it will never match.
 */
function toProduct(raw: unknown, byField: Map<CanonicalField, string>): NewProduct | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>

  const read = (field: CanonicalField): string => {
    const header = byField.get(field)
    if (!header) return ''
    const value = record[header]
    return typeof value === 'string' ? value.trim() : ''
  }

  const nameEn = read('nameEn')
  if (!nameEn) return null

  const barcode = read('barcode') ? normalizeBarcode(read('barcode')) : ''
  const packCount = Number(read('packCount'))

  const packSize = parsePackSize(read('packSize'))
  const packUnit = parsePackUnit(read('packUnit'))

  return {
    nameEn,
    ...(read('nameAr') ? { nameAr: read('nameAr') } : {}),
    ...(read('brandEn') ? { brandEn: read('brandEn') } : {}),
    ...(read('specEn') ? { specEn: read('specEn') } : {}),
    ...(read('category') ? { category: read('category') } : {}),
    ...(packSize ? { packSize } : {}),
    ...(packUnit ? { packUnit } : {}),
    ...(Number.isInteger(packCount) && packCount > 1 ? { packCount } : {}),
    ...(barcode && hasValidCheckDigit(barcode) ? { barcode } : {}),
  }
}
