import type { BrandColor, BrandKit } from '@souqstudio/types'
import {
  MAX_PROPOSED,
  MIN_PROPOSED,
  TYPE_MOODS,
  isValidHex,
  type ProposedColor,
  type TypeMood,
} from '@souqstudio/engine'
import { EDITORIAL, type FontRole } from '@/lib/font-editorial'
import { palettePatch } from '@/lib/brand-palette'

/**
 * Turning an accepted brand direction into a brand kit. E8-08.
 *
 * **The web side of the feature, and the half the model does not touch.** The
 * worker returns a palette and a *mood*; the mapping from a mood to four
 * typefaces lives here, because the catalog it draws from lives here — ten
 * families filtered per slot, every one covering Arabic and Latin. Asking a
 * model to name four families instead would be asking it to redo that filtering
 * from a photograph, and one wrong answer is a kit rendering in a fallback
 * nobody chose.
 *
 * It is also the rule the first live magic block run produced, in its third
 * register: do not ask a model anything the code already knows.
 */

/**
 * The four faces each mood resolves to.
 *
 * **Every family named here is checked against the catalog at module load**, by
 * `MOOD_FONTS_ARE_REAL` below — a typo in this table would otherwise reach
 * `PATCH /api/v1/brand`'s own font validation as a rejected patch, which reads
 * to an owner as "accepting the palette failed" with nothing to do about it.
 *
 * The pairings are ordinary typographic choices and are meant to be edited.
 * What they are not is open-ended: a mood resolves to exactly one set, so two
 * shops that accept the same mood get the same faces and the result is
 * reproducible.
 */
const MOOD_FONTS: Readonly<Record<TypeMood, Record<FontRole, string>>> = {
  plain: {
    headline: 'Readex Pro',
    display: 'Readex Pro',
    price: 'Changa',
    body: 'Almarai',
  },
  'bold-retail': {
    headline: 'Lalezar',
    display: 'Cairo',
    price: 'Changa',
    body: 'Almarai',
  },
  warm: {
    headline: 'Baloo Bhaijaan 2',
    display: 'Rubik',
    price: 'Baloo Bhaijaan 2',
    body: 'Tajawal',
  },
  premium: {
    headline: 'Reem Kufi',
    display: 'Readex Pro',
    price: 'Noto Sans Arabic',
    body: 'Tajawal',
  },
}

/**
 * Every family in the table exists and is offered for the slot it is used in.
 *
 * Thrown at import rather than returned, because there is no runtime answer to
 * a table that names a font we do not load — the deploy is wrong, and it should
 * be wrong loudly in CI rather than quietly in one owner's brand kit.
 */
/**
 * Checked against the **editorial** map, not the registry.
 *
 * The registry is a database table now and this runs at import; a module that
 * queried Postgres to load would be a module that cannot be imported by a test,
 * a script or the build. What can still be checked here is the thing this guard
 * was always really about: that a mood names a family we have an opinion about,
 * in a slot that opinion allows. Whether the files are mirrored is a *runtime*
 * question, and `resolveFont()` already falls back on it rather than drawing a
 * face it does not hold.
 */
const MOOD_FONTS_ARE_REAL = TYPE_MOODS.every((mood) =>
  (Object.entries(MOOD_FONTS[mood]) as [FontRole, string][]).every(([role, family]) =>
    (EDITORIAL[family]?.roles ?? []).includes(role)
  )
)

if (!MOOD_FONTS_ARE_REAL) {
  throw new Error('brand-direction: MOOD_FONTS names a family the editorial catalog does not offer')
}

/** The four faces a mood resolves to. */
export function fontsForMood(mood: TypeMood): Record<FontRole, string> {
  return MOOD_FONTS[mood]
}

/**
 * What the worker wrote onto `ai_jobs.result`, as this app reads it back.
 *
 * Declared rather than imported from the job, because it crosses a queue and a
 * JSONB column: what comes back is whatever was written by whichever version of
 * the worker ran, and treating it as a typed object we control would be a lie
 * the first time the two deploy apart. `isProposal` is the gate.
 */
export interface DirectionProposal {
  palette: ProposedColor[]
  priceIndex: number
  mood: TypeMood
  notes: string[]
}

/** Whether a completed job's result is a proposal this version can apply. */
export function isProposal(value: unknown): value is DirectionProposal {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<DirectionProposal>

  if (!Array.isArray(candidate.palette)) return false
  if (candidate.palette.length < MIN_PROPOSED || candidate.palette.length > MAX_PROPOSED) {
    return false
  }
  if (
    !candidate.palette.every(
      (color) =>
        typeof color?.name === 'string' &&
        typeof color?.hex === 'string' &&
        isValidHex(color.hex) &&
        typeof color?.why === 'string'
    )
  ) {
    return false
  }

  if (typeof candidate.mood !== 'string') return false
  if (!TYPE_MOODS.includes(candidate.mood as TypeMood)) return false

  if (typeof candidate.priceIndex !== 'number') return false
  if (!Number.isInteger(candidate.priceIndex)) return false
  if (candidate.priceIndex < 0 || candidate.priceIndex >= candidate.palette.length) return false

  return Array.isArray(candidate.notes) && candidate.notes.every((n) => typeof n === 'string')
}

/**
 * The kit patch an accepted proposal becomes.
 *
 * **The price colour is moved to the front of the palette.** `palettePatch`
 * keeps `primaryColor`, `secondaryColor` and `accentColor` in sync with the
 * first three entries, and everything written before the palette was open-ended
 * still reads `primaryColor` — including the seeded blocks. The one colour the
 * model was asked to be careful about is the one that must survive that
 * narrowing, so it leads. The rest keep the order the model proposed.
 *
 * Ids are generated here rather than by the model: they are this app's join
 * between a palette entry and the text styles that bind to it, and a model has
 * no business minting them.
 */
export function patchFromProposal(proposal: DirectionProposal): Partial<BrandKit> {
  const price = proposal.palette[proposal.priceIndex]
  const rest = proposal.palette.filter((_, index) => index !== proposal.priceIndex)
  const ordered = price === undefined ? proposal.palette : [price, ...rest]

  const palette: BrandColor[] = ordered.map((color, index) => ({
    id: `c${index + 1}`,
    name: color.name,
    hex: color.hex,
  }))

  const fonts = fontsForMood(proposal.mood)

  return {
    ...palettePatch(palette),
    fontHeadline: fonts.headline,
    fontDisplay: fonts.display,
    fontPrice: fonts.price,
    fontBody: fonts.body,
  }
}
