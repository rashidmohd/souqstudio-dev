import { NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/api-session'
import { templateSampleProducts } from '@/lib/catalog'
import { toCsv } from '@/lib/csv'

/**
 * The price-list template, as a file. `docs/E6-create-flow.md` §17.
 *
 * **Generated rather than documented, and that is the point.** A column spec in
 * a help page has to be retyped by whoever runs the shop's POS, and a spec that
 * is retyped is a spec that arrives wrong — a header spelled "Item Code" instead
 * of "Barcode" is a column the matcher will not guess and an owner will not
 * think to remap. Handing them a file removes the transcription.
 *
 * **The headers are the exact spellings `HEADER_HINTS` already recognises**, so
 * a file returned unchanged maps itself with nothing to confirm. They are not
 * the only spellings that work — the mapping selects are still there, because a
 * POS that cannot be told its column names is the common case and this template
 * is for the one that can.
 *
 * **The sample rows are the shop's own products where they have any.** They show
 * the shape and they also prove the file works, because those rows will match
 * when it comes back. Placeholders would show only the shape, and a template
 * that matches nothing on its first run teaches an owner the feature is broken.
 *
 * **Three columns, not seven.** `HEADER_HINTS` knows brand, pack size and Arabic
 * name, and this flow reads none of them — a template offering columns that are
 * silently ignored is worse than a narrow one, because the owner fills them in
 * and believes they arrived. When the flow reads them, they belong here.
 * `E6-create-flow.md` §16.5.
 *
 * **Not `{ data, error }`.** Every other route in `api/v1` returns the envelope
 * in `api-conventions.md`; this one returns a file, because it is downloaded by
 * an anchor rather than read by `fetch`. The convention is about API results and
 * this is not one.
 */
export async function GET() {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const samples = await templateSampleProducts(session)

  /*
   * **Prices are invented and the products are not.** There is no price on a
   * catalog row — a price belongs to an offer in a book — so these are examples
   * of the *format*: two decimals, no currency symbol, no thousands separator.
   * `parsePrice` reads a good deal more than that, but a template teaches the
   * shape it would rather receive.
   */
  const EXAMPLE_PRICES = ['12.90', '4.50', '24.00']

  const rows =
    samples.length > 0
      ? samples.map((product, index) => [
          product.nameEn,
          product.barcode,
          EXAMPLE_PRICES[index] ?? '9.90',
        ])
      : /*
         * A brand-new organization with an empty catalog still gets a usable
         * file. **These carry correct GS1 check digits and the first draft of
         * them did not** — three numbers that looked like barcodes, in a
         * template whose job is partly to teach what a barcode column is, which
         * `hasValidCheckDigit` would have dropped on the way back in. `629` is
         * the UAE prefix; `csv.test.ts` does not cover this because it is data
         * rather than behaviour, so it is checked here instead: changing a digit
         * means recomputing the last one.
         */
        [
          ['Basmati rice 5 kg', '6291100000012', '12.90'],
          ['Sunflower oil 1.8 L', '6291100000029', '4.50'],
          ['Laundry powder 3 kg', '6291100000036', '24.00'],
        ]

  // `\ufeff` is the BOM. See the content-type note below.
  const csv = '\ufeff' + toCsv(['Product name', 'Barcode', 'Price'], rows)

  return new NextResponse(csv, {
    headers: {
      // `charset=utf-8` and the BOM below are two halves of one problem: Excel
      // on Windows reads a UTF-8 CSV as the local code page unless the file
      // starts with a BOM, which turns an Arabic product name into mojibake the
      // owner then "fixes" by retyping it.
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="price-list-template.csv"',
      // A template seeded from a catalog that changes. Cheap to build, and a
      // stale one names products the shop may have archived.
      'cache-control': 'no-store',
    },
  })
}
