import { validateBlock } from '@souqstudio/engine'
import { z } from 'zod'
import { arrangementsSchema } from '@/lib/block-document'

/**
 * What a write to a block may say, and when it is refused. E7.
 *
 * Here rather than in the route because two routes write the same document —
 * creating a copy and saving an edit — and a second copy of these rules is how
 * the two start disagreeing about what a legal block is. A Next.js route module
 * may only export handlers, so shared route logic has nowhere else to live.
 */

export const blockUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  /**
   * `draft` hides a block from the composer without destroying it, `archived`
   * retires one that books already use. Neither touches a book that is already
   * drawn: a page grid names its block by id and keeps rendering it.
   */
  status: z.enum(['draft', 'published', 'archived']).optional(),
  repeats: z.boolean().optional(),
  arrangements: arrangementsSchema.optional(),
})

export type BlockUpdate = z.infer<typeof blockUpdateSchema>

/**
 * The structural refusal.
 *
 * **Errors refuse the save; warnings do not.** A block with an aspect gap still
 * renders — `pickArrangement` falls back to the nearest range, deliberately,
 * because a missing card on a printed flyer is worse than a cramped one — so
 * refusing to save it would be refusing a design that works. The designer shows
 * the warning beside the canvas instead, which is where the owner can judge it.
 */
export function blockErrors(input: { repeats: boolean; arrangements: unknown }): string[] {
  const arrangements = arrangementsSchema.safeParse(input.arrangements)
  if (!arrangements.success) return ['invalid-document']

  return validateBlock({ repeats: input.repeats, arrangements: arrangements.data })
    .filter((problem) => problem.severity === 'error')
    .map((problem) => problem.code)
}

/**
 * What to tell the owner, in their own terms.
 *
 * A code is what the client branches on; this is the sentence a shop owner
 * reads. Two rules are worth stating rather than merely enforcing, because both
 * are product decisions the designer's UI also has to honour.
 */
export function blockErrorMessage(codes: readonly string[]): string {
  if (codes.includes('product-binding-on-static-block')) {
    return 'This block is placed once rather than once per product, so it cannot show product details. Remove them, or make it repeat.'
  }
  if (codes.includes('duplicate-price-mark')) {
    return 'One offer has one price. Remove the second price mark.'
  }
  if (codes.includes('degenerate-box')) {
    return 'An element has no width or height. Give it a size, or remove it.'
  }
  if (codes.includes('no-arrangements')) {
    return 'A block needs at least one layout before it can be saved.'
  }
  return 'This block cannot be saved as it is. Check the problems listed beside the canvas.'
}
