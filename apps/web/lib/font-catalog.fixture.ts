import { EDITORIAL } from '@/lib/font-editorial'
import type { CatalogFont, FontCatalog } from '@/lib/font-catalog'

/**
 * A catalog for tests, standing in for the `fonts` table.
 *
 * **Built from `EDITORIAL` rather than restated**, so a test never asserts
 * against a tenth family the picker no longer offers. What it invents is only
 * the part that comes from Google — weights, subsets, category — because no test
 * here is about those numbers; the mirror's own tests cover reading them.
 *
 * Rubik carries an italic and the rest do not, which is true of the real ten and
 * is what `italicIsSynthetic` needs something to distinguish.
 */
const WEIGHTS = [400, 500, 700]

export const TEST_CATALOG: FontCatalog = Object.entries(EDITORIAL).map(
  ([family, editorial]): CatalogFont => ({
    family,
    slug: family.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    roles: editorial.roles,
    weights: WEIGHTS,
    italicWeights: family === 'Rubik' ? WEIGHTS : [],
    subsets: ['arabic', 'latin'],
    category: 'sans-serif',
    note: editorial.note,
    hasItalic: family === 'Rubik',
    recommended: true,
  })
)

/** What a fresh environment looks like: mirrored nothing. */
export const EMPTY_CATALOG: FontCatalog = []
