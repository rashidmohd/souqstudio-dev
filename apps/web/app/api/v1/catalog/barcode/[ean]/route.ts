import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { lookupBarcode } from '@/lib/catalog'
import { hasValidCheckDigit, normalizeBarcode } from '@/lib/catalog-display'

/**
 * E5-03 — find a product by its barcode.
 *
 * Three answers, and they are deliberately three rather than two:
 *
 * - **`invalid_barcode`** — the number is not a GTIN, or its check digit does
 *   not agree with the rest of it. Almost always a typo on desktop entry.
 * - **`{ product: null }`** — a valid code we have never seen. That is the
 *   E5-04 prompt, not an error, so it is a 200: nothing went wrong, and the
 *   client's next move is to offer to add it.
 * - **`{ product }`** — found, organization row first.
 *
 * Collapsing the first two would tell an owner to add a product that already
 * exists under the number they mistyped, which is how a catalog fills with
 * duplicates that no reviewer can spot.
 */
export async function GET(
  _req: Request,
  { params }: { params: { ean: string } }
) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const barcode = normalizeBarcode(decodeURIComponent(params.ean))

  if (!hasValidCheckDigit(barcode)) {
    return fail(
      'invalid_barcode',
      'That is not a valid barcode. Check the digits under the bars and try again.',
      422
    )
  }

  return ok({ barcode, product: await lookupBarcode(session, barcode) })
}
