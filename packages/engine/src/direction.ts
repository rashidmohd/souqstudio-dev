/**
 * Which way a *string* reorders, which is not which way the page lays out.
 *
 * **Found by rendering real catalog rows, 6 September.** An Arabic edition draws
 * every text element with `direction: rtl`, and the great majority of catalog
 * rows carry no `specAr` at all — the Open Food Facts export has no language
 * variants in any of its 211 columns — so the display helpers fall back to the
 * English pack line, correctly. In an RTL paragraph the string `2 kg` reorders
 * to `kg 2`: the digit is bidi-weak, `kg` is a strong LTR run, and the space
 * between them is neutral. Every pack label on the Arabic page printed
 * backwards, and it is the kind of defect that survives review because it still
 * looks like text.
 *
 * **The chrome already solves this and the artboard did not.** `[data-figure]`
 * carries bidi isolation, which is why `ProductCard` is unaffected. There is no
 * `Figure` on an artboard, so the rule has to live somewhere both renderers can
 * reach — here, beside `price-mark`, which already decides that a price mark
 * lays out start-to-end and never mirrors. Direction resolution is the same kind
 * of decision: the engine says how it lays out, something else draws it.
 *
 * Every renderer needs it. `BlockPreview` and the harness use it today; E6's
 * Fabric layer and E9's SVG export must, and neither exists yet.
 */

import type { Direction } from './geometry'

/**
 * The scripts that lay out right-to-left.
 *
 * Tested against a character already known to be a **letter**, which is what
 * makes it correct. A first attempt matched code-point ranges instead and got
 * two things wrong that only a test caught:
 *
 * - **`×` decided the direction.** U+00D7 sits inside the Latin-1 Supplement
 *   between the accented letters, so a range spanning them swallows it — and
 *   `12 × 1.5 L` was being called a strong LTR string by its multiplication
 *   sign. It is a maths symbol; it reorders with whatever surrounds it.
 * - **Arabic-Indic digits decided it too.** U+0660–U+0669 sit inside the Arabic
 *   block, so `١٢ × ١٫٥ لتر` resolved RTL from its leading digit rather than
 *   from the Arabic word four characters later. It happened to give the right
 *   answer, which is the worst way for a rule to be wrong.
 *
 * Restricting to `\p{L}` first removes both by construction: a digit is `Nd`, a
 * symbol is `Sm`, and neither is strong in the Unicode bidi algorithm either.
 */
const LETTER = /\p{L}/u
const RTL_SCRIPT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u

/**
 * First-strong, which is the Unicode `plaintext` heuristic — what
 * `unicode-bidi: plaintext` would do in a renderer that honours it. Resolved in
 * code rather than left to CSS because three of the four renderers that need it
 * are not a browser: the PDF pipeline, the Fabric canvas and the harness all
 * draw text themselves.
 *
 * A string with no letter in it at all — a bare `500`, a lone `—`, `12 × 1.5` —
 * follows the page. There is nothing in it that can reorder, so the page's
 * answer is as good as any and keeps a column of numbers aligned with its
 * neighbours.
 *
 * **This decides glyph order only.** Where a line sits in its box stays a page
 * decision: an Arabic card right-aligns its English pack label. A renderer that
 * feeds this into its text anchor as well has misread it.
 */
export function textDirection(content: string, page: Direction): Direction {
  const first = LETTER.exec(content)
  if (first === null) return page
  return RTL_SCRIPT.test(first[0]) ? 'rtl' : 'ltr'
}
