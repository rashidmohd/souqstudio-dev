import type { NextRequest } from 'next/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { importKey, presignUpload } from '@/lib/r2'

/**
 * E5-06 — authorise a spreadsheet upload.
 *
 * **CSV only.** XLSX is in the epic and is not built: reading it needs a
 * dependency, and the ones that do it also carry a great deal more than a
 * parser. That is a decision worth making deliberately rather than in passing —
 * see `docs/E5-pending.md`.
 *
 * Browsers disagree about what a .csv is: Chrome on macOS sends `text/csv`,
 * Windows often sends `application/vnd.ms-excel` for the same file, and some
 * send `text/plain`. Refusing on the declared type would reject valid files
 * depending on which machine the owner happens to be at, so the list is wide and
 * the parse is what actually decides.
 */

const ACCEPTED = [
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
] as const

/** A price list, not a media file. Ten thousand rows is well under this. */
const MAX_BYTES = 5 * 1024 * 1024

const schema = z.object({
  contentType: z.enum(ACCEPTED),
  contentLength: z.number().int().positive().max(MAX_BYTES),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail(
      'invalid_input',
      `Upload a CSV file under ${Math.round(MAX_BYTES / 1024 / 1024)}MB. Excel files are not supported yet.`,
      422
    )
  }

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)
  if (shop.role === 'viewer') {
    return fail('forbidden', 'You need edit access to import products.', 403)
  }

  const key = importKey(session.user.organizationId, shop.id, `${nanoid()}.csv`)

  return ok({
    uploadUrl: await presignUpload(key, parsed.data.contentType, parsed.data.contentLength),
    key,
  })
}
