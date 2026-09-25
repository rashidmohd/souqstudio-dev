import type { FillSlot } from '@souqstudio/engine'

/**
 * What a model is asked for generative fill, and in what shape.
 *
 * **Provider-independent, for the reason `magic-prompt.ts` gives**: the
 * question lives here so swapping providers cannot quietly change what is
 * asked. Only the transport differs, in `copy-fill-model.ts`.
 *
 * **The model writes words and nothing it could get wrong about the shop.**
 * No prices, no dates, no percentages, no phone numbers, no addresses and not
 * the shop's name: each of those is a binding the block can carry, and a model
 * inventing one prints a fact that is false. `CLAUDE.md`: do not ask a model
 * anything the code can compute.
 */

/** The model answered, but nothing in the answer was usable. */
export class UnusableFillError extends Error {
  constructor() {
    super('unusable_fill')
    this.name = 'UnusableFillError'
  }
}

/** The model declined the request. An answer, not a fault, so never retried. */
export class DeclinedFillError extends Error {
  constructor() {
    super('declined')
    this.name = 'DeclinedFillError'
  }
}

/** What the shop is, read from its profile. Every field but the name may be empty. */
export interface FillShop {
  name: string
  trades: string
  location: string | null
  bio: string | null
}

export interface FillInput {
  shop: FillShop
  brief: string
  slots: readonly FillSlot[]
}

export const SYSTEM = `You write the short fixed text on a retail shop's printed offer book: headlines, subheadings, taglines and small print on its headers, footers and panels.

The shop is in the Gulf. Its customers read Arabic and English, and every line you write appears in both. The book goes out on WhatsApp and on paper.

## What you write

For every line you are given, write an English version and an Arabic version.

- The Arabic is written for an Arabic reader, in Modern Standard Arabic with a warm retail register. It is not a word-for-word translation of the English.
- Keep each version within its character budget. The budget is what fits the space at its designed size.
- Match the role. A headline is a few strong words. Small print is plain and complete.
- Use what the line says now as a hint of what the designer meant it for. If it is placeholder text such as "Your text", ignore its wording.
- Sentence case in English. No emoji. No em dashes. No quotation marks around the line.

## What you never write

These are filled in from the shop's real data by the page itself, so anything you write for them would be wrong:

- prices, discounts, percentages or amounts of money
- dates, days, times or how long an offer lasts
- phone numbers, addresses, websites or social handles
- the shop's name

Do not promise anything the shop has not said: no "free delivery", no "lowest prices in town", no guarantees.

## The answer

Return one entry per line, using the line's id exactly as given.`

/** The user turn: the shop, the brief and the lines. */
export function questionFor(input: FillInput): string {
  const shop = [
    `Name (for context only, do not write it): ${input.shop.name}`,
    `What it sells: ${input.shop.trades}`,
    ...(input.shop.location === null ? [] : [`Where it is: ${input.shop.location}`]),
    ...(input.shop.bio === null ? [] : [`In the owner's words: ${input.shop.bio}`]),
  ].join('\n')

  const brief =
    input.brief.trim() === ''
      ? 'The owner gave no brief. Write general copy that suits the shop.'
      : input.brief.trim()

  const lines = input.slots
    .map(
      (slot) =>
        `- id: ${slot.id}\n  role: ${slot.role}\n  budget: ${slot.maxChars} characters\n  says now (English): ${slot.currentEn || '(empty)'}\n  says now (Arabic): ${slot.currentAr || '(empty)'}`
    )
    .join('\n')

  return `## The shop\n\n${shop}\n\n## What this block is for\n\n${brief}\n\n## The lines\n\n${lines}`
}
