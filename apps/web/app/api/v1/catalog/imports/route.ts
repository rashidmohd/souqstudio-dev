import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { inferColumnMap } from '@/lib/catalog-import'
import { parseSheet } from '@/lib/csv'
import { getObjectBytes, importKey } from '@/lib/r2'

/**
 * E5-06 — start an import.
 *
 * Reads the uploaded file back, parses it, and hands the owner the headers with
 * a *guess* at what each column is. The guess is never applied: the mapping
 * screen is the next step and confirming it is what moves the import on. A
 * column called "Code" could be a barcode or an internal SKU, and choosing
 * wrong means matching every row in the sheet against the wrong number.
 *
 * The row data is deliberately **not** stored yet. `catalog_import_rows` is
 * written when the map is confirmed, because `raw` is keyed by header and a map
 * the owner is still editing would mean writing every row twice.
 */

const schema = z.object({
  key: z.string().min(1).max(300),
  filename: z.string().trim().min(1).max(255),
})

/** Enough rows for the owner to recognise their own sheet on the mapping screen. */
const SAMPLE_ROWS = 5

/**
 * A ceiling on rows per import, so one upload cannot become a query that never
 * returns. Ten thousand is far above a weekly price list and far below the
 * point where the two `unnest` queries stop being sensible.
 */
const MAX_ROWS = 10_000

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)
  if (shop.role === 'viewer') {
    return fail('forbidden', 'You need edit access to import products.', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Choose a file and try again.', 422)
  }

  // Same rule as the product photo: the key must be one this shop was handed,
  // or the field is an arbitrary read of the bucket.
  const prefix = importKey(session.user.organizationId, shop.id, '')
  if (!parsed.data.key.startsWith(prefix)) {
    return fail('invalid_input', 'That upload could not be matched to this shop.', 422)
  }

  const bytes = await getObjectBytes(parsed.data.key)
  if (!bytes) {
    return fail('upload_missing', 'That file did not arrive. Try choosing it again.', 409)
  }

  const sheet = parseSheet(bytes.toString('utf8'))

  if (sheet.headers.length === 0) {
    return fail('empty_file', 'That file has no columns in it. Check it and try again.', 422)
  }
  if (sheet.rows.length === 0) {
    return fail(
      'no_rows',
      'That file has column headings but no products under them.',
      422
    )
  }
  if (sheet.rows.length > MAX_ROWS) {
    return fail(
      'too_many_rows',
      `That file has ${sheet.rows.length} rows. Split it into files of ${MAX_ROWS} or fewer.`,
      422
    )
  }

  const record = await prisma.catalogImport.create({
    data: {
      organizationId: session.user.organizationId,
      shopId: shop.id,
      sourceKey: parsed.data.key,
      filename: parsed.data.filename,
      status: 'UPLOADED',
      rowCount: sheet.rows.length,
    },
    select: { id: true, rowCount: true, filename: true },
  })

  return ok(
    {
      importId: record.id,
      filename: record.filename,
      headers: sheet.headers,
      columnMap: inferColumnMap(sheet.headers),
      rowCount: record.rowCount,
      sample: sheet.rows.slice(0, SAMPLE_ROWS),
    },
    201
  )
}
