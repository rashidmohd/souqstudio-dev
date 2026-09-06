/**
 * The key that makes two spellings of a brand one brand. E5, `ProductBrand`.
 *
 * **Here rather than in `packages/db` for the same reason `barcode.ts` is**:
 * three callers have to agree on the answer — the Open Food Facts importer
 * resolving a public string, the add-a-product route resolving what an owner
 * typed, and the suggestion query matching what they are typing. A second copy
 * of this rule is a copy that eventually disagrees, and the direction it
 * disagrees in is two rows for one brand, which is exactly what the table
 * exists to prevent. `packages/types` has no dependencies at all, so it is the
 * only package a browser bundle and a CLI script can both import.
 *
 * **What it normalises away, and why each one is real.** These are not
 * hypothetical: they are what the export and a keyboard actually produce.
 *
 * - **Case.** `Almarai`, `almarai`, `AL MARAI` are one brand.
 * - **Trademark marks.** `Almarai®` and `Nestlé™` are the same companies as
 *   their unmarked spellings; the symbol is a legal notice, not part of a name.
 * - **Accents.** `Nestlé` and `Nestle` are typed interchangeably, and a Gulf
 *   keyboard produces the second far more often.
 * - **Punctuation and separators, whitespace included.** `Coca-Cola`,
 *   `Coca Cola` and `CocaCola` all appear in the export and are one brand.
 *   Spaces have to go for the same reason hyphens do, and **leaving them in was
 *   a bug**: stripping the hyphen but keeping the space files `Coca-Cola` under
 *   `cocacola` and `Coca Cola` under `coca cola`, so the same brand splits on
 *   nothing but which separator someone typed. It was caught by `AL MARAI`
 *   landing beside `Almarai` as a second row.
 *
 * **Arabic and other non-Latin scripts are preserved.** The strip is defined by
 * what it removes — marks, punctuation, separators — rather than by an
 * allowlist of Latin letters, because an allowlist would reduce `المراعي` to an
 * empty slug and collapse every Arabic-named brand into a single row.
 */
export function brandSlug(raw: string): string {
  return (
    raw
      .normalize('NFKD')
      // Combining marks left behind by NFKD: `é` → `e` + U+0301, and this drops
      // the U+0301. Arabic letters are not decomposed by NFKD, so this does not
      // touch them; Arabic diacritics are in the same block and are also
      // vowel marks a brand name is written without.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Everything that is not a letter or a number, in any script. Whitespace
      // included — see the note above.
      .replace(/[^\p{L}\p{N}]/gu, '')
  )
}

/**
 * Whether a string is worth treating as a brand at all.
 *
 * A slug that normalises to nothing — punctuation, a stray `®`, a single
 * character — would otherwise become a row, and the first such row would then
 * collect every other unnameable string in the export.
 */
export function isUsableBrand(raw: string): boolean {
  const slug = brandSlug(raw)
  return slug.length >= 2 && slug.length <= 80
}
