import type { NextRequest } from 'next/server'
import { Prisma, prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { matchImportRows, summariesByIds, type ImportNeedle } from '@/lib/catalog'
import { hasValidCheckDigit, normalizeBarcode } from '@/lib/catalog-display'
import {
  CANONICAL_FIELDS,
  parsePrice,
  resolveRow,
  type CanonicalField,
  type ColumnMap,
  type MatchCandidate,
} from '@/lib/catalog-import'
import { parseSheet, toRecord } from '@/lib/csv'
import { getObjectBytes } from '@/lib/r2'

/**
 * E5-06 — confirm the column map and resolve every row, then read the result.
 *
 * `PATCH` is where the work happens: the file is re-read from `sourceKey`,
 * every row is resolved against the catalog, and `catalog_import_rows` is
 * written. **Re-read rather than carried through the client** — the file is
 * kept precisely so a disputed import can be looked at again, and trusting a
 * client-held copy of the parse would mean the rows the owner reviews need not
 * be the rows in the file.
 */

const patchSchema = z.object({
  columnMap: z.record(z.string(), z.enum(CANONICAL_FIELDS).nullable()),
})

/** The review screen is a list, so it pages like every other list. */
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

async function loadImport(organizationId: string, id: string) {
  return prisma.catalogImport.findFirst({
    // Scoped by organization in the `where`, never checked after the read. A
    // findUnique followed by an ownership comparison is one forgotten line away
    // from a cross-tenant read.
    where: { id, organizationId },
    select: {
      id: true,
      filename: true,
      status: true,
      columnMap: true,
      rowCount: true,
      matchedCount: true,
      unmatchedCount: true,
      sourceKey: true,
      committedAt: true,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const record = await loadImport(session.user.organizationId, params.id)
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

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the column choices and try again.', 422)
  }
  const columnMap: ColumnMap = parsed.data.columnMap

  const byField = new Map<CanonicalField, string>()
  for (const [header, field] of Object.entries(columnMap)) {
    if (field && !byField.has(field)) byField.set(field, header)
  }

  if (!byField.has('nameEn')) {
    return fail(
      'name_column_required',
      'Choose which column holds the product name. Nothing can be matched without it.',
      422
    )
  }

  const bytes = await getObjectBytes(record.sourceKey)
  if (!bytes) {
    return fail(
      'source_missing',
      'The uploaded file is no longer available. Upload it again.',
      409
    )
  }

  const sheet = parseSheet(bytes.toString('utf8'))
  const value = (row: string[], field: CanonicalField): string => {
    const header = byField.get(field)
    if (!header) return ''
    const index = sheet.headers.indexOf(header)
    return index === -1 ? '' : (row[index] ?? '')
  }

  // Only a barcode that passes its check digit is used to match. A mistyped one
  // matches nothing and would push the row to a name match anyway — but a
  // *transposed* one can match a real, different product, and that is the row
  // nobody would ever query.
  const needles: ImportNeedle[] = sheet.rows.map((row, index) => {
    const raw = value(row, 'barcode').trim()
    const barcode = raw ? normalizeBarcode(raw) : ''
    return {
      index,
      name: value(row, 'nameEn').trim(),
      barcode: barcode && hasValidCheckDigit(barcode) ? barcode : null,
    }
  })

  await prisma.catalogImport.update({
    where: { id: record.id },
    data: { status: 'MATCHING', columnMap: columnMap as Prisma.InputJsonObject },
  })

  const matches = await matchImportRows(session, needles)

  let matched = 0
  let unmatched = 0

  const rows = sheet.rows.map((row, index) => {
    const resolution = resolveRow({
      barcodeMatchId: matches.byBarcode.get(index) ?? null,
      candidates: matches.byName.get(index) ?? [],
    })

    if (resolution.status === 'MATCHED') matched += 1
    if (resolution.status === 'UNMATCHED') unmatched += 1

    const price = parsePrice(value(row, 'price'))

    return {
      importId: record.id,
      rowIndex: index,
      // The row exactly as it was read. The "we could not match this" screen
      // shows the owner their own row in their own words, not a parsed
      // approximation of it — so this is keyed by their headers, not by ours.
      raw: toRecord(sheet.headers, row) as Prisma.InputJsonObject,
      status: resolution.status,
      catalogProductId: resolution.catalogProductId,
      candidates:
        resolution.candidates.length > 0
          ? (resolution.candidates as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      price: price !== null ? new Prisma.Decimal(price) : null,
    }
  })

  // Replace rather than append: re-confirming a corrected map must not leave
  // the previous resolution behind, and `@@unique([importId, rowIndex])` would
  // reject the second write anyway.
  await prisma.$transaction([
    prisma.catalogImportRow.deleteMany({ where: { importId: record.id } }),
    prisma.catalogImportRow.createMany({ data: rows }),
    prisma.catalogImport.update({
      where: { id: record.id },
      data: {
        status: 'REVIEW',
        rowCount: rows.length,
        matchedCount: matched,
        unmatchedCount: unmatched,
      },
    }),
  ])

  return ok({
    importId: record.id,
    rowCount: rows.length,
    matchedCount: matched,
    ambiguousCount: rows.length - matched - unmatched,
    unmatchedCount: unmatched,
  })
}

/**
 * The review screen's read: the import, a page of its rows, and the product
 * summaries those rows point at.
 *
 * Summaries are fetched once for the whole page and returned alongside rather
 * than nested into each row. An ambiguous row carries three candidates and
 * several rows on a page will name the same product, so nesting would send the
 * same product a dozen times over.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const record = await loadImport(session.user.organizationId, params.id)
  if (!record) return fail('not_found', 'That import could not be found.', 404)

  const search = req.nextUrl.searchParams
  const limitParam = Number(search.get('limit'))
  const take = Math.min(
    Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT, 1),
    MAX_LIMIT
  )
  const cursor = search.get('cursor')

  const rows = await prisma.catalogImportRow.findMany({
    where: { importId: record.id },
    orderBy: { rowIndex: 'asc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      rowIndex: true,
      raw: true,
      status: true,
      catalogProductId: true,
      candidates: true,
      price: true,
    },
  })

  const page = rows.slice(0, take)

  const referenced = new Set<string>()
  for (const row of page) {
    if (row.catalogProductId) referenced.add(row.catalogProductId)
    for (const candidate of asCandidates(row.candidates)) {
      referenced.add(candidate.catalogProductId)
    }
  }

  const products = await summariesByIds(session, [...referenced])

  return ok({
    import: {
      id: record.id,
      filename: record.filename,
      status: record.status,
      columnMap: record.columnMap,
      rowCount: record.rowCount,
      matchedCount: record.matchedCount,
      unmatchedCount: record.unmatchedCount,
      committedAt: record.committedAt?.toISOString() ?? null,
    },
    rows: page.map((row) => ({
      id: row.id,
      rowIndex: row.rowIndex,
      raw: row.raw,
      status: row.status,
      catalogProductId: row.catalogProductId,
      candidates: asCandidates(row.candidates),
      // A string, not a number. It is a Decimal(10,2) headed for a printed
      // page, and JSON has only doubles.
      price: row.price?.toFixed(2) ?? null,
    })),
    products: Object.fromEntries(products),
    nextCursor: rows.length > take ? (page[page.length - 1]?.id ?? null) : null,
  })
}

/**
 * `candidates` is a Json column, so it arrives as `unknown` and is narrowed
 * rather than asserted. It was written by the PATCH above, but a Json column is
 * exactly the place where an old shape survives a deployment — so a row whose
 * candidates do not look right reads as having none, which the screen already
 * handles, instead of throwing on a `.map`.
 */
function asCandidates(value: Prisma.JsonValue | null): MatchCandidate[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof entry.catalogProductId === 'string' &&
      typeof entry.score === 'number'
    ) {
      return [{ catalogProductId: entry.catalogProductId, score: entry.score }]
    }
    return []
  })
}
