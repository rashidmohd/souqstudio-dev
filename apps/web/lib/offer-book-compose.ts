import type { Connector, Currency, PageGrid, PriceMark, Region } from '@souqstudio/types'
import { toPriceMark } from '@souqstudio/engine'

/**
 * Turning the rows of an offer book into what the engine and a renderer need.
 *
 * **Pure, and separate from `lib/offer-book.ts` for the reason that module is
 * `server-only`.** The same split `lib/catalog.ts` and `lib/catalog-display.ts`
 * already make, and for the same reason: an artboard component is a client
 * component, and importing the query layer to reach a display helper pulls
 * Prisma and the R2 client into the browser bundle. `pnpm typecheck` and
 * `pnpm lint` both pass on that; `next build` is what fails. It has now cost
 * three separate changes — see STATUS §5.
 *
 * Nothing here reads the database, and nothing here draws.
 */

export type Edition = 'en' | 'ar'

/**
 * A quality flag, in E6-01's sense: something the owner must see before this
 * book prints.
 *
 * Only the two that are decidable from the rows live here. `fit-escalated`
 * comes from the fit ladder and is therefore a property of a *rendered* card at
 * a particular size, not of the offer — it is added by the renderer.
 */
export type OfferFlag = 'missing-name-ar' | 'fallback-image' | 'no-image'

/** One offer, as an artboard draws it. */
export interface ComposedOffer {
  id: string
  /** Reading order in the book. The engine paginates from this. */
  position: number
  name: string
  spec: string | null
  brand: string | null
  imageUrl: string | null
  priceMark: PriceMark
  tierLabel: string
  /**
   * The tier's colour, as a `--sq-tpl-*` custom property name.
   *
   * **Not a `TokenRef`, and the difference is not cosmetic.** A block's elements
   * name binding slots — `primary`, `accent`, `ink` — which the shop's brand kit
   * resolves, because a seeded block has to name a colour before it has met the
   * shop. A promo tier names a *template* token instead: `--sq-tpl-offer-red`,
   * `--sq-tpl-save-yellow`. Those are fixed system colours and deliberately not
   * the shop's, because a "Half price" flash that comes out sand-coloured on one
   * account and navy on another stops reading as a discount.
   *
   * The two vocabularies do not overlap and nothing maps between them. Casting
   * one to the other typechecks and produces a colour no palette contains — see
   * `docs/E6-pending.md` §5.
   */
  tierToken: string
  flags: OfferFlag[]
}

// ─── The rows this module is given ────────────────────────────────────────────

/** The subset of `catalog_products` an offer renders from. */
export interface ProductRow {
  nameEn: string
  nameAr: string | null
  specEn: string | null
  specAr: string | null
  brandEn: string | null
  brandAr: string | null
  imageUrl: string | null
  /** True when the image is an ORIGINAL standing in for a missing CUTOUT. */
  imageIsFallback: boolean
}

/** The subset of `offer_items`, in `position` order. */
export interface ItemRow {
  position: number
  connector: Connector | null
  nameOverrideEn: string | null
  nameOverrideAr: string | null
  specOverrideEn: string | null
  specOverrideAr: string | null
  product: ProductRow
}

/** The subset of `offers`. Decimals arrive from Prisma as strings. */
export interface OfferRow {
  id: string
  position: number
  price: string
  comparePrice: string | null
  currency: string
  promoTierId: string
  items: ItemRow[]
}

export interface TierRow {
  id: string
  labelEn: string
  labelAr: string | null
  tokenRef: string
}

// ─── Language ─────────────────────────────────────────────────────────────────

/**
 * The edition's string, falling back to the other language.
 *
 * **Falling back is right, and the fallback is also a publish blocker.** An
 * Arabic edition showing an English product name is legible; showing a blank
 * card is not. But E5 §2 makes a missing `nameAr` block publishing an AR
 * edition, so the fallback is what the *editor* draws while the flag is what
 * stops it reaching a customer. Rendering a placeholder instead would hide the
 * problem behind a second one.
 *
 * This matters more than it sounds: the Open Food Facts seed has no Arabic
 * column at all, so every universal catalog row falls back today.
 */
function pick(ar: string | null, en: string | null, edition: Edition): string | null {
  return edition === 'ar' ? (ar ?? en) : (en ?? ar)
}

// ─── Offers ───────────────────────────────────────────────────────────────────

/**
 * The localised connector between items of a multi-item offer.
 *
 * "Pesto Rosso *or* Pasta Sauce Basilico" — E6-02 calls this a first-class
 * action rather than an edge case, so the connector is a word the book renders
 * and not punctuation.
 */
const CONNECTOR_LABEL: Record<Connector, Record<Edition, string>> = {
  OR: { en: 'or', ar: 'أو' },
  AND: { en: 'and', ar: 'و' },
}

/**
 * One offer, composed.
 *
 * **Item 0 supplies the brand and the image**, per the schema's note on
 * `OfferItem.position`: a multi-item offer is one card with one packshot and one
 * brand lockup, not two cards sharing a price. Later items contribute their name
 * and spec, joined by the connector.
 */
export function composeOffer(
  offer: OfferRow,
  tier: TierRow,
  edition: Edition
): ComposedOffer {
  const items = [...offer.items].sort((a, b) => a.position - b.position)
  const lead = items[0]

  if (lead === undefined) {
    throw new Error(`composeOffer: offer "${offer.id}" has no items`)
  }

  const name = items
    .map((item, index) => {
      const own = nameFor(item, edition)
      if (index === 0) return own
      // The connector belongs to the item it precedes — that is what the null
      // on item 0 means — so a missing one joins with a space rather than
      // inventing an "or" the owner did not choose.
      const joiner = item.connector ? `${CONNECTOR_LABEL[item.connector][edition]} ` : ''
      return `${joiner}${own}`
    })
    .join(' ')

  const spec = pick(
    lead.specOverrideAr ?? lead.product.specAr,
    lead.specOverrideEn ?? lead.product.specEn,
    edition
  )

  return {
    id: offer.id,
    position: offer.position,
    name,
    spec,
    brand: pick(lead.product.brandAr, lead.product.brandEn, edition),
    imageUrl: lead.product.imageUrl,
    priceMark: toPriceMark(offer.price, offer.currency as Currency, tier.id, {
      ...(offer.comparePrice === null ? {} : { comparePrice: offer.comparePrice }),
    }),
    tierLabel: pick(tier.labelAr, tier.labelEn, edition) ?? tier.labelEn,
    tierToken: tier.tokenRef,
    flags: flagsFor(items, edition),
  }
}

function nameFor(item: ItemRow, edition: Edition): string {
  return (
    pick(
      item.nameOverrideAr ?? item.product.nameAr,
      item.nameOverrideEn ?? item.product.nameEn,
      edition
    ) ?? item.product.nameEn
  )
}

/**
 * **Every item is checked, not just the lead.** A two-product offer whose second
 * product has no Arabic name still cannot publish to an AR edition, and flagging
 * only the one that supplies the image would pass it.
 */
function flagsFor(items: ItemRow[], edition: Edition): OfferFlag[] {
  const flags: OfferFlag[] = []
  const lead = items[0]

  if (edition === 'ar') {
    const missing = items.some(
      (item) => (item.nameOverrideAr ?? item.product.nameAr) === null
    )
    if (missing) flags.push('missing-name-ar')
  }

  if (lead !== undefined) {
    if (lead.product.imageUrl === null) flags.push('no-image')
    else if (lead.product.imageIsFallback) flags.push('fallback-image')
  }

  return flags
}

// ─── The master grid ──────────────────────────────────────────────────────────

/**
 * A `page_grids` row as the engine's `PageGrid`.
 *
 * `regions` is a Json column, so it arrives as `unknown` and has to be checked
 * rather than asserted. **A malformed grid must throw here rather than reach
 * `flowBook`**: the engine's own `validateGrid` reports overlaps and bad spans,
 * which are authoring mistakes an editor can show, but a `regions` value that is
 * not an array at all is a corrupt row and there is nothing an owner can do
 * about it.
 */
export function toMasterGrid(row: {
  cols: number[]
  rows: number[]
  gap: number
  margin: number
  regions: unknown
}): PageGrid {
  if (!Array.isArray(row.regions)) {
    throw new Error('toMasterGrid: `regions` is not an array')
  }

  return {
    cols: row.cols,
    rows: row.rows,
    gap: row.gap,
    margin: row.margin,
    regions: row.regions as Region[],
  }
}
