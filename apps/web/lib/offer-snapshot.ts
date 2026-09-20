import { z } from 'zod'
import { AMOUNT_PATTERN } from '@souqstudio/types'

/**
 * Everything needed to put a removed offer back exactly as it was.
 *
 * **Removal is undoable, and this is what makes it so.** The design skill →
 * Destructive actions names this case directly: *"A toast with an Undo action
 * beats a confirmation dialog for anything reversible — archiving a book,
 * removing a product, clearing a cell."* Undo needs the offer back, and the
 * `DELETE` route hard-deletes the row — deliberately, and the reasoning at that
 * call site still stands: an offer *is* a reference, and archiving it would put
 * a row in the table that every read then has to learn to ignore.
 *
 * So the row is not kept; its contents are handed to the client and handed
 * back. That is the same shape as the rest of the undo stack — E6-06 holds
 * *logical operations*, not object diffs, and re-issues them through the API
 * rather than restoring a client's private copy of the truth.
 *
 * **The id travels with it, and that is the load-bearing part.** A slot
 * override carries an `offerId` and lives on the *page* rather than on the
 * offer, so it does not cascade when the row goes; restoring under a fresh id
 * would leave the nudge pointing at nothing and the card would come back in the
 * wrong place. Undo has to return the book to the state it was in, not to a
 * state that merely looks like it.
 *
 * **Money is text here for the same reason it is text in the PATCH route.** A
 * price routed through a JavaScript float is the one place a rounding error can
 * enter a number a customer reads off a flyer, and a restore is not a special
 * case.
 */

/** Up to two decimals, at least one digit before the point. Same as PATCH. */
/**
 * **The snapshot records what was stored, so its grammar is the column's.**
 * Widened alongside `offers.price`: a KWD offer carries three decimals, and a
 * snapshot that refused them would make undo fail on exactly the currencies
 * whose prices are hardest to retype.
 */
const MONEY = AMOUNT_PATTERN
/** A rate, to the three decimals the column carries. */
const RATE = /^\d{1,7}(\.\d{1,3})?$/

const itemSchema = z.object({
  id: z.string().min(1),
  catalogProductId: z.string().min(1),
  position: z.number().int().min(0).max(19),
  connector: z.enum(['OR', 'AND']).nullable(),
  nameOverrideEn: z.string().nullable(),
  nameOverrideAr: z.string().nullable(),
  specOverrideEn: z.string().nullable(),
  specOverrideAr: z.string().nullable(),
  imageAssetId: z.string().nullable(),
})

const chipSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['COUNTER', 'ORIGIN', 'CERT', 'SCALE', 'LOYALTY', 'CUSTOM']),
  labelEn: z.string(),
  labelAr: z.string().nullable(),
  /** Kind-specific payload — `{ scale: 3, of: 5 }`, `{ amount: 0.20 }`. */
  value: z.record(z.unknown()).nullable(),
  anchor: z.enum(['TOP_START', 'TOP_END', 'INLINE']),
})

const footnoteSchema = z.object({
  id: z.string().min(1),
  textEn: z.string(),
  textAr: z.string().nullable(),
  scope: z.enum(['PAGE', 'BOOK']),
})

/**
 * Per-branch price and availability.
 *
 * **Carried even though nothing in the editor writes them yet**, because
 * something will, and a snapshot that silently drops a column is an undo that
 * quietly loses a shop's pricing. Cheaper to include now than to discover from
 * a support ticket.
 */
const shopOverrideSchema = z.object({
  shopId: z.string().min(1),
  price: z.string().regex(MONEY).nullable(),
  isAvailable: z.boolean(),
})

export const offerSnapshotSchema = z.object({
  id: z.string().min(1),
  /** Where it sat in the book. Restoring pushes everything from here along. */
  position: z.number().int().min(0),
  price: z.string().regex(MONEY),
  priceMode: z.enum(['FIXED', 'FROM', 'PER_UNIT']),
  comparePrice: z.string().regex(MONEY).nullable(),
  currency: z.string().min(3).max(3),
  promoTierId: z.string().min(1),
  unitPriceMode: z.enum(['AUTO', 'MANUAL', 'HIDDEN']),
  unitPriceValue: z.string().regex(RATE).nullable(),
  unitPriceUnit: z.enum(['G', 'KG', 'ML', 'L', 'PIECE']).nullable(),
  legalLines: z.array(z.string()).max(4),
  /** An offer with no product is a price attached to nothing. */
  items: z.array(itemSchema).min(1).max(20),
  chips: z.array(chipSchema).max(20),
  footnotes: z.array(footnoteSchema).max(20),
  shopOverrides: z.array(shopOverrideSchema).max(200),
})

export type OfferSnapshot = z.infer<typeof offerSnapshotSchema>
