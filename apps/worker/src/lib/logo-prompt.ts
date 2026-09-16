import {
  LOGO_STRUCTURES,
  LOGO_STRUCTURE_NOTE,
  LOGO_SYMBOLS,
  LOGO_SYMBOL_NOTE,
  MARKS_PER_RUN,
  logoSetSchema,
  type LogoSet,
} from '@souqstudio/engine'

/**
 * What a model is asked for a logo mark, and what its answer has to be. E8-09.
 *
 * **No image goes to a model here, in either direction.** The inputs are a name,
 * a trade and some hex; the output is a structure name and five bounded fields,
 * and this process draws the SVG. That is what lets this feature ship while
 * E8-01 to E8-04 wait on a diffusion provider nobody has chosen, and it is also
 * why the privacy question E8-01 raises — a mascot built from a photograph of
 * somebody's employees — does not arise at all.
 *
 * Provider-independent, for the reason `magic-prompt.ts` gives.
 */

/** The name will not make a mark of any of these kinds. */
export class NoMarkError extends Error {
  constructor(readonly notes: readonly string[]) {
    super('no_mark')
    this.name = 'NoMarkError'
  }
}

/** The model answered, but not in a shape the schema accepts. */
export class UnusableMarkError extends Error {
  constructor() {
    super('unusable_mark')
    this.name = 'UnusableMarkError'
  }
}

export interface MarkInput {
  shopName: string
  trade?: string
  /** The shop's palette, as hex, in its own order. Indices refer into this. */
  palette: readonly string[]
}

export type MarkReader = (input: MarkInput) => Promise<LogoSet>

const STRUCTURES = LOGO_STRUCTURES.map((s) => `- ${s}: ${LOGO_STRUCTURE_NOTE[s]}`).join('\n')
const SYMBOLS = LOGO_SYMBOLS.map((s) => `- ${s}: ${LOGO_SYMBOL_NOTE[s]}`).join('\n')

export const SYSTEM = `You design a logo mark for a small retail shop by choosing one of
our layouts and saying how to set it.

The shop is in the Gulf — a grocery, a pharmacy, an electronics shop, a bakery.
It has no logo, which is why you are here, and no designer. The mark you specify
goes on the header of every offer book they print, on their social posts, and on
paper at A3.

**You are not drawing anything.** You pick a structure from a fixed list and fill
in a few fields; the platform draws the SVG from the shop's own colours. You
never invent a structure and you never name one that is not on the list.

## The structures

${STRUCTURES}

## The symbols, for a lockup only

${SYMBOLS}

Only choose \`cross\` for an actual pharmacy or clinic. It reads as a medical
symbol everywhere this product ships, and on a grocery it is wrong in a way that
is not merely a matter of taste.

## setAs — the name as it should be set

Usually the shop's name, and sometimes less of it. A shop registered as
"Al Noor Trading LLC" is "Al Noor" on its own sign; a mark carrying the legal
suffix reads as a letterhead rather than a shopfront. So you may **drop** words.

**You may never add or change a word.** Every word you keep has to be a word the
shop's own name already contains — that is checked after you answer, and a mark
that fails is thrown away. If the name is long, drop more of it rather than
rewriting it.

## initials, tagline, symbol

Fill all three every time, even when the structure you chose ignores them. It
costs you nothing and it means a person can switch a mark to another structure
later without a second call.

\`initials\` is one or two letters. \`tagline\` is the line under the name in a
badge — short, and true of any shop: "Est. 1998" only if you were told a year,
otherwise something like "Fresh daily" or the trade itself.

## inkIndex and accentIndex

Positions in the palette you were given, counting from zero. \`ink\` is what the
name is set in and \`accent\` is the second colour — the picked-out word, the
monogram plate, the badge ring, the symbol. Choose an ink dark enough to read
and an accent that is visibly a different colour from it, not a shade of it.

## How many marks

Up to ${MARKS_PER_RUN}, and **they must be genuinely different from each other** — different
structures, not the same structure four times with a different accent. The owner
is choosing between them, so four near-identical marks is one mark and three
wasted slots. Order them best first.

## When there is no mark to make

Set \`isMakeable: false\` with an empty \`marks\` array when the name cannot be set
legibly in any of these — most often because it is very long and dropping words
would leave something that is not recognisably the shop. Say why in \`notes\`.
Declining costs the owner nothing.

## notes

At most four short sentences, written for the shop owner. Say what you read from
the name and the trade, and anything you were unsure about.`

export function questionFor(input: MarkInput): string {
  const trade =
    input.trade === undefined || input.trade.trim() === ''
      ? ''
      : ` The owner describes the shop as: "${input.trade}".`

  return [
    `The shop is called "${input.shopName}".${trade}`,
    '',
    `Its palette, in order — index 0 first:`,
    input.palette.map((hex, index) => `${index}: ${hex}`).join('\n'),
    '',
    `Propose up to ${MARKS_PER_RUN} marks.`,
  ].join('\n')
}

/** The answer, checked. `magic-prompt.ts` → `interpret` makes the argument. */
export function interpretMarks(raw: unknown): LogoSet {
  return interpretFirstMarks([raw])
}

export function interpretFirstMarks(candidates: readonly unknown[]): LogoSet {
  for (const candidate of candidates) {
    const parsed = logoSetSchema.safeParse(candidate)
    if (!parsed.success) continue

    if (!parsed.data.isMakeable || parsed.data.marks.length === 0) {
      throw new NoMarkError(parsed.data.notes)
    }

    return parsed.data
  }

  throw new UnusableMarkError()
}
