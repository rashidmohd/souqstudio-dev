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
 * **Six columns, and every one of them is read.** The first version of this file
 * carried three — name, barcode, price — which described what the code read that
 * morning rather than what the import is for: a sheet carries the shop's
 * *promotion*, and taking one price from it left every was-price and every
 * buy-one-get-one to be typed back in, card by card, in the editor. That is the
 * work the import exists to remove. `E6-create-flow.md` §18.
 *
 * A template offering columns that are silently ignored is worse than a narrow
 * one, because the owner fills them in and believes they arrived — which is why
 * brand, pack size and Arabic name are still *not* here. `HEADER_HINTS` knows
 * them and this flow does not read them. §16.5.
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
   *
   * **The three rows are three different promotions on purpose**, because the
   * columns are the part an owner has to understand: a plain price cut, a
   * percentage with no promotion price worked out, and a mechanic where the
   * price does not move at all. A template where every row looks the same
   * teaches only the first one.
   */
  const EXAMPLE_OFFERS: string[][] = [
    // Both prices given. The commonest case, and the one where "price now"
    // versus "price before" has to be the right way round.
    ['32.00', '24.50', '', ''],
    // A shelf price and a percentage: the promotion price is worked out.
    ['18.00', '', '25', ''],
    // Buy one get one. **One price, in "now", and nothing struck through** —
    // the price does not move, so a was-price here would print a discount the
    // shop is not giving.
    ['', '9.90', '', 'bogo'],
  ]

  const rows =
    samples.length > 0
      ? samples.map((product, index) => [
          product.nameEn,
          product.barcode,
          ...(EXAMPLE_OFFERS[index] ?? ['9.90', '', '', '']),
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
          ['Basmati rice 5 kg', '6291100000012', ...(EXAMPLE_OFFERS[0] as string[])],
          ['Sunflower oil 1.8 L', '6291100000029', ...(EXAMPLE_OFFERS[1] as string[])],
          ['Laundry powder 3 kg', '6291100000036', ...(EXAMPLE_OFFERS[2] as string[])],
        ]

  // `\ufeff` is the BOM. See the content-type note below.
  const csv =
    '\ufeff' +
    toCsv(
      // Spelled as the mapping screen labels them, not as a till does: "Price
      // before" and "Price now" rather than "Price" and "Offer price". The
      // inversion between the two namings is the mistake this whole column set
      // exists to stop somebody making.
      ['Product name', 'Barcode', 'Price before', 'Price now', 'Discount %', 'Offer type'],
      rows
    )

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
