import { z } from 'zod'

/**
 * What an admin may write to a cover prompt. E13, AI prompt management.
 *
 * **Not `server-only`** — the form imports it, so one schema decides what is
 * valid rather than a form and a route disagreeing.
 *
 * The vocabulary here mirrors `packages/db/src/cover-prompts.ts`, which is the
 * shipped default set. That file is the seed and this is the editor; the
 * database is the source of truth for both, and `seedCoverPrompts` never writes
 * over a row that already exists precisely so that an edit made here survives
 * the next deploy.
 */

/**
 * Who the scene wants in it.
 *
 * **The scene knows this and an owner does not have to.** A staff member
 * pushing a full trolley of shopping is not a picture of anything; a customer
 * doing it is the commonest retail cover there is. `staff` is the only one that
 * consumes the shop's character reference.
 */
export const PERSON = ['staff', 'customer', 'none'] as const

/**
 * A string in the database rather than an enum, because the groups are a
 * presentation judgement that will move and a row naming a dropped group should
 * still render. These three are what the picker knows today.
 */
export const GROUPS = ['everyday', 'season', 'occasion'] as const

export const promptSchema = z.object({
  /**
   * Stable across edits and what the client names. A `covers` row records the
   * slug it was generated from, so changing one orphans that history.
   */
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'A slug is lowercase letters, digits and hyphens.'),
  label: z.string().trim().min(1, 'The picker needs something to call it.').max(60),
  hint: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  /**
   * The paragraph that reaches the image model.
   *
   * **A photograph, not a theme.** That is the correction this field exists to
   * encode: "a weekend sale, energetic and simple" is an adjective, and a model
   * handed an adjective returns the average of everything ever labelled with
   * it. A scene names a place, a person doing something, and a light.
   *
   * The minimum is a real check rather than a formality. Every scene that has
   * worked runs to two or three sentences; anything under about forty
   * characters is an adjective wearing a full stop.
   */
  scene: z
    .string()
    .trim()
    .min(40, 'A scene names a place, a person doing something, and a light. This is too short to.')
    .max(1200),
  person: z.enum(PERSON),
  group: z.enum(GROUPS),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
})

export type PromptInput = z.infer<typeof promptSchema>

/**
 * A scene that dresses the person fights the character reference, which is how
 * a back-to-school prompt once put a school bag on the shop assistant. This
 * cannot be a schema rule: "wearing" is a legitimate word in a scene about a
 * butcher's apron on a rail. So it is a warning shown beside the field, and a
 * writer decides.
 */
const CLOTHING = [
  'wear',
  'wearing',
  'wears',
  'dressed',
  'uniform',
  'shirt',
  'apron',
  'hat',
  'cap',
  'jacket',
  'coat',
  'scarf',
  'bag',
  'backpack',
]

export function clothingWords(scene: string): string[] {
  const words = scene.toLowerCase().match(/[a-z]+/g) ?? []
  const found = new Set<string>()
  for (const word of words) {
    if (CLOTHING.includes(word)) found.add(word)
  }
  return [...found].sort()
}
