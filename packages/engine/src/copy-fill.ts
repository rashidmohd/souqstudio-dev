// v4, like every schema handed to the SDK's `zodOutputFormat`.
import * as z from 'zod/v4'
import type { Arrangement, BlockElement, TypeLevel } from '@souqstudio/types'

/**
 * Generative fill: words for the text a block's author types, written by a
 * model from a short brief and the shop's profile.
 *
 * **Only free text, never a binding.** A line bound to the shop's name, the
 * book's dates or a product field already has an answer, and it is a better one
 * than a model's: it is the shop's real name and this week's real dates. Free
 * text is what is left, and it is exactly the part an owner least wants to
 * write, twice, in two scripts.
 *
 * **In the engine because three places read it.** The designer picks the
 * targets and applies the reply, the route validates the request, and the
 * worker checks the reply against what was asked. One definition of "free
 * text" and one of "too long", or the three drift.
 */

/** The most lines one fill writes. A header with more is a page of body copy. */
export const MAX_FILL_LINES = 24

/** How much the owner may say about what the block is for. */
export const MAX_FILL_BRIEF = 300

/** The static text column's own limit, from `textSourceSchema`. */
export const MAX_STATIC_TEXT = 280

type TextElement = Extract<BlockElement, { kind: 'text' }>
type StaticSource = Extract<TextElement['source'], { from: 'static' }>
export type FreeTextElement = TextElement & { source: StaticSource }

/**
 * Text the owner types, which is the only text a fill may write.
 *
 * **Locked text is left alone.** Locking is how an owner says "not this one",
 * and a fill that rewrote a locked legal line would be the one place in the
 * designer the lock did not hold.
 */
export function isFreeText(element: BlockElement): element is FreeTextElement {
  return element.kind === 'text' && element.source.from === 'static' && element.locked !== true
}

/**
 * What a fill writes: the selection's free text, or every free line when
 * nothing is selected.
 *
 * **A selection with no free text in it is an empty answer, not the whole
 * block.** An owner who selected a logo and a price and pressed the button
 * meant those, and silently widening to every line in the block would rewrite
 * things they did not point at.
 */
export function fillTargets(
  elements: readonly BlockElement[],
  selected: readonly BlockElement[]
): FreeTextElement[] {
  return (selected.length > 0 ? selected : elements).filter(isFreeText)
}

/** What a line is for, in words a copywriter knows. */
export type FillRole = 'headline' | 'subheading' | 'body' | 'small print'

const ROLE: Readonly<Record<TypeLevel, FillRole>> = {
  h1: 'headline',
  h2: 'headline',
  h3: 'subheading',
  h4: 'subheading',
  h5: 'body',
  h6: 'body',
  body: 'body',
  caption: 'small print',
}

/**
 * Characters that fit a box one block-width wide in a square block, per level.
 *
 * **A guide for the model, not a limit on the owner.** The fit ladder still
 * shrinks whatever arrives, so a line over budget prints smaller rather than
 * overflowing. The budget is there so it usually does not have to: a headline
 * that fits at its own size is a better headline than one set a step down.
 */
const BUDGET: Readonly<Record<TypeLevel, number>> = {
  h1: 22,
  h2: 28,
  h3: 36,
  h4: 44,
  h5: 52,
  h6: 60,
  body: 90,
  caption: 120,
}

/**
 * How many characters a line should run to.
 *
 * Type is sized against the block's geometric mean, so a box's width in those
 * units is `width × √aspect`: a full-width box in a 6:1 header band holds about
 * two and a half times what the same fraction of a square does.
 */
export function charBudget(element: TextElement, aspect: number): number {
  const scale = Number.isFinite(aspect) && aspect > 0 ? Math.sqrt(aspect) : 1
  const raw = Math.round(BUDGET[element.level] * element.box.width * scale)
  return Math.min(MAX_STATIC_TEXT, Math.max(6, raw))
}

/**
 * The aspect an arrangement is designed at, for budgeting.
 *
 * The geometric middle of its range, because the range is a ratio. An open
 * bound falls back to square, which under-budgets a wide band rather than
 * over-budgeting a tall one.
 */
export function designAspect(arrangement: Pick<Arrangement, 'aspectMin' | 'aspectMax'>): number {
  const middle = Math.sqrt(arrangement.aspectMin * arrangement.aspectMax)
  return Number.isFinite(middle) && middle > 0 ? middle : 1
}

/** One line to write, as the model is shown it. */
export const fillSlotSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(['headline', 'subheading', 'body', 'small print']),
  maxChars: z.number().int().min(1).max(MAX_STATIC_TEXT),
  /** What the line says now, which tells the model what the author meant it for. */
  currentEn: z.string().max(MAX_STATIC_TEXT),
  currentAr: z.string().max(MAX_STATIC_TEXT),
})

export type FillSlot = z.infer<typeof fillSlotSchema>

/** The request body the designer sends, validated at the route. */
export const fillRequestSchema = z.object({
  blockId: z.string().min(1).max(64),
  brief: z.string().trim().max(MAX_FILL_BRIEF).default(''),
  slots: z.array(fillSlotSchema).min(1).max(MAX_FILL_LINES),
})

export type FillRequest = z.infer<typeof fillRequestSchema>

/** A slot per target, in paint order. */
export function fillSlots(targets: readonly FreeTextElement[], aspect: number): FillSlot[] {
  return targets.slice(0, MAX_FILL_LINES).map((element) => ({
    id: element.id,
    role: ROLE[element.level],
    maxChars: charBudget(element, aspect),
    currentEn: element.source.textEn,
    currentAr: element.source.textAr,
  }))
}

/**
 * The model's reply. Deliberately plain: no length keywords, because the
 * structured-output schema is a grammar rather than a validator, and the
 * lengths are checked below where a failure can be named.
 */
export const fillReplySchema = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      textEn: z.string(),
      textAr: z.string(),
    })
  ),
})

export type FillLine = z.infer<typeof fillReplySchema>['lines'][number]

/** The reply's JSON Schema, for a provider that is asked for it in the prompt. */
export function fillReplyJsonSchema(): unknown {
  return z.toJSONSchema(fillReplySchema)
}

/**
 * The reply, held to what was asked.
 *
 * Lines for ids nobody asked about are dropped, a line missing either language
 * is dropped, and everything is cut to the column's limit. **Em dashes are
 * recast as commas** in each script's own comma: this product does not print
 * them, and a model reaches for them constantly.
 */
export function interpretFill(reply: unknown, slots: readonly FillSlot[]): FillLine[] {
  const parsed = fillReplySchema.safeParse(reply)
  if (!parsed.success) return []

  const asked = new Set(slots.map((slot) => slot.id))
  const seen = new Set<string>()
  const lines: FillLine[] = []

  for (const line of parsed.data.lines) {
    if (!asked.has(line.id) || seen.has(line.id)) continue
    const textEn = clean(line.textEn, ', ')
    const textAr = clean(line.textAr, '، ')
    if (textEn === '' || textAr === '') continue
    seen.add(line.id)
    lines.push({ id: line.id, textEn, textAr })
  }

  return lines
}

function clean(text: string, comma: string): string {
  return text
    // Em dashes only. An en dash is a numeric range, `2–4`, and stays.
    .replace(/\s*—\s*/g, comma)
    .trim()
    .slice(0, MAX_STATIC_TEXT)
}

/**
 * The document with the fill written in, across every layout.
 *
 * **Every layout, because the ids are shared.** A second layout starts as a
 * copy of the first, element ids and all, so the same headline appears in each
 * and an owner who filled it once expects it filled everywhere. A line is only
 * ever written over free text: an element that became bound or locked while
 * the job ran keeps what it has.
 */
export function applyFill(
  arrangements: readonly Arrangement[],
  lines: readonly FillLine[]
): Arrangement[] {
  const byId = new Map(lines.map((line) => [line.id, line]))

  return arrangements.map((arrangement) => ({
    ...arrangement,
    elements: arrangement.elements.map((element) => {
      const line = byId.get(element.id)
      if (line === undefined || !isFreeText(element)) return element
      return {
        ...element,
        source: { from: 'static', textEn: line.textEn, textAr: line.textAr, machine: true },
      }
    }),
  }))
}
