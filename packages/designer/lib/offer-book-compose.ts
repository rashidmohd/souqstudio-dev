import type {
  Block,
  ChipAnchor,
  Connector,
  Currency,
  FootnoteScope,
  PackUnit,
  PageBackground,
  PageGrid,
  PriceMark,
  Region,
  SellBy,
  ShadowPreset,
} from '@souqstudio/types'
import { currencyLabelFor, deriveUnitPrice, packLabel, unitPriceLabel } from '@souqstudio/types'
import type { CurrencyDisplay } from '@souqstudio/types'
import { minorDigits, toPriceMark } from '@souqstudio/engine'
import type { FlowPage } from '@souqstudio/engine'
import { OFFER_TYPE_CHIP_KIND } from './offer-types'

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
 * Three of the four are decidable from the rows and are raised here.
 * **`fit-escalated` is not**: it comes from the fit ladder and is therefore a
 * property of a *rendered* card at a particular size rather than of the offer,
 * so `BookPage` reports it and the store merges it in. It is in this union
 * because it is the same kind of thing to the owner — something to fix before
 * printing — and splitting the vocabulary would mean two flag lists on one
 * card.
 */
export type OfferFlag =
  | 'missing-name-ar'
  | 'fallback-image'
  | 'no-image'
  | 'no-price'
  | 'fit-escalated'

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
   * `docs/E6-pending.md` §6.
   */
  tierToken: string
  /**
   * The country of origin — "Product of Spain" — and the pack line, "8 × 25 g".
   *
   * **Both bindings existed and drew nothing**, in `draw.tsx` and in
   * `harness/svg.ts` alike, for as long as `TextSource` had carried them. They
   * are not on E14's Phase 1 task list either; the test that walks the
   * vocabulary found them. §3.5.
   */
  origin: string | null
  packSize: string | null
  /**
   * What the shop saved, as words — "4.50" and "20%". Null when there is no
   * was-price.
   *
   * **Computed here rather than decided in the engine, and that is the whole
   * mechanism behind conditional content.** "SAVE 20%" is not a predicate a
   * block evaluates; it is a field the composer resolves, empty when it does
   * not apply, and collapsed by the frame that holds it — E14 §3.3 and §3.7.
   * The engine gains no arithmetic and no notion of a discount.
   */
  saveAmount: string | null
  savePercent: string | null
  /**
   * `(1 kg = 1.760)`, already formatted, or null when the offer hides it or the
   * pack cannot answer. E5 §4 — a null reads as *no line*, never as zero.
   */
  unitPrice: string | null
  /**
   * How that line was decided, and what was typed if it was typed.
   *
   * **Authoring state on a shape called "as an artboard draws it"**, and the
   * same exception `items` already makes: the card draws one string, the panel
   * has to be able to change the decision behind it, and a second composer for
   * the panel is how the two start disagreeing. The card ignores these.
   */
  unitPriceMode: 'AUTO' | 'MANUAL' | 'HIDDEN'
  unitPriceValue: string | null
  unitPriceUnit: PackUnit | null
  /** Deposits and service fees. Under the card, not footnotes: part of the
   *  price rather than a caveat about it. */
  legalLines: string[]
  /** The flashes a card carries beside its price. E6 §7. */
  chips: ComposedChip[]
  /** Notes, without marker numbers — those are assigned at render time in
   *  reading order so an AR edition numbers correctly. E6 §8. */
  footnotes: ComposedFootnote[]
  flags: OfferFlag[]
  /**
   * The products behind the card, in reading order.
   *
   * The artboard draws `name` — one string, connectors folded in — because a
   * multi-item offer is *one card*. The properties panel needs them apart, to
   * remove one or change its connector. Two shapes of the same fact, and the
   * card's is the derived one.
   */
  items: ComposedItem[]
  /**
   * The lead item's product, when its photo still has its background.
   *
   * **Only set alongside the `fallback-image` flag**, and null otherwise. The
   * panel offers "remove the background" against it — E8-05's manual action —
   * and a card with a good cutout has nothing to offer. Carrying the id
   * unconditionally would invite the button to be rendered unconditionally,
   * which is a paid action on a photo that does not need it.
   */
  fallbackImageProductId: string | null
  /**
   * Whether that photo is the shared catalog's rather than this shop's.
   *
   * **A flag beside the id rather than a fact on every card.** `AddPhoto` made
   * the case against carrying catalog ownership on every composed offer to
   * caption one button, and that case holds — this is set only where
   * `fallbackImageProductId` is, so it costs nothing on the cards that have no
   * button to caption. False whenever there is no id.
   */
  fallbackImageIsShared: boolean
  /**
   * Shadowed renditions of the card's picture that **already exist**, by preset.
   *
   * **Only the ones that are rendered.** A block asking for a preset that has
   * not been produced yet draws the plain cutout and the page queues the render;
   * pointing at a key before the object lands is a broken image on a flyer.
   *
   * The pixels are `shadowKey(r2Key, preset)` beside the source, and the list of
   * which exist is `image_assets.shadowPresets` — read with the image rather
   * than probed per card. E14 §2.4.
   */
  imageShadowUrls: Partial<Record<ShadowPreset, string>>
  /**
   * The lead item's product, when it has no photo at all.
   *
   * **A second field rather than one that means two things.** The two flags
   * lead to different actions on different routes — one asks for a matte on a
   * photo that exists, the other supplies a photo that does not — and they are
   * mutually exclusive by construction in `flagsFor`. One id serving both
   * would be an id whose meaning depends on a flag list read somewhere else.
   */
  missingImageProductId: string | null
}

export interface ComposedChip {
  id: string
  /** The edition's label, falling back to the other language. */
  label: string
  anchor: ChipAnchor
  /**
   * True for the chip that carries the offer's *mechanic* — buy one get one,
   * and so on — rather than a note beside it.
   *
   * **A card draws it like any other chip; only the panel cares.** The offer
   * type has one control, one value and a replace-rather-than-append write, so
   * the panel has to know which of an offer's chips it is editing. Derived
   * from the kind rather than carried as a second field on the row — see
   * `lib/offer-types.ts` for why `SCALE` is the marker.
   */
  isOfferType: boolean
}

export interface ComposedFootnote {
  id: string
  text: string
  scope: FootnoteScope
}

export interface ComposedItem {
  id: string
  /** The item's own name in the edition, overrides applied. */
  name: string
  /**
   * What this book calls the product, where it calls it something.
   *
   * Both languages, unresolved — the panel edits them as two fields, and the
   * edition's fallback has already been applied to `name` above. Null is the
   * catalog's own name, which is what an empty box restores.
   */
  nameOverrideEn: string | null
  nameOverrideAr: string | null
  specOverrideEn: string | null
  specOverrideAr: string | null
  /**
   * What the catalog says, per language and with no override applied.
   *
   * **Each override box needs its own "otherwise", and `name` cannot be it.**
   * `name` is resolved for the *edition*, so in an Arabic book it holds the
   * Arabic name — and the panel was using it as the placeholder under "Name in
   * this book", which is the English field. An owner editing an Arabic edition
   * saw the Arabic name offered as what the English box would fall back to.
   *
   * It also already has the override folded in, so a box showing its own
   * current value as the thing it would revert to says nothing at all.
   */
  catalog: {
    nameEn: string
    nameAr: string | null
    specEn: string | null
    specAr: string | null
  }
  /** Rendered before this item's name. Null on item 0 — there is nothing to
   *  join it to, which is what the schema's null means. */
  connector: Connector | null
}

// ─── The rows this module is given ────────────────────────────────────────────

/** The subset of `catalog_products` an offer renders from. */
export interface ProductRow {
  /** The catalog row this came from — what E8-05's manual cutout acts on. */
  id: string
  nameEn: string
  nameAr: string | null
  specEn: string | null
  specAr: string | null
  brandEn: string | null
  brandAr: string | null
  /** The country of origin — `product.origin` in the vocabulary. E14 §3.3. */
  originEn: string | null
  originAr: string | null
  imageUrl: string | null
  /** True when the image is an ORIGINAL standing in for a missing CUTOUT. */
  imageIsFallback: boolean
  /** Shadowed renditions that already exist, by preset. Absent is none. */
  imageShadowUrls?: Partial<Record<ShadowPreset, string>> | undefined
  /**
   * True when the photo on the card belongs to the shared catalog rather than
   * to this shop — the product is universal *and* this shop did not contribute
   * the picture.
   *
   * **Only read alongside `imageIsFallback`.** It exists to caption one button:
   * a cutout of a shared photo goes to other shops once a reviewer accepts it,
   * and an owner about to spend a credit is owed that sentence before the press
   * rather than after.
   */
  imageIsShared: boolean
  /** The three pack columns, for the derived unit price. E5 §4. */
  packSize: string | null
  packUnit: PackUnit | null
  packCount: number | null
  /** `packLabel` reads it: a loose product has no pack line. */
  sellBy: SellBy | null
}

/** The subset of `offer_items`, in `position` order. */
export interface ItemRow {
  id: string
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
  unitPriceMode: 'AUTO' | 'MANUAL' | 'HIDDEN'
  /** Frozen at publish, in `MANUAL`. Decimal(10,3), so a string. */
  unitPriceValue: string | null
  unitPriceUnit: PackUnit | null
  legalLines: string[]
  chips: ChipRow[]
  footnotes: FootnoteRow[]
  items: ItemRow[]
}

export interface ChipRow {
  id: string
  labelEn: string
  labelAr: string | null
  anchor: ChipAnchor
  /**
   * `offer_chips.kind`. Only one value is read here — the marker that says
   * this chip is the offer's mechanic — so the field is a plain string rather
   * than the Prisma enum, which would pull the client into a pure module.
   */
  kind: string
}

export interface FootnoteRow {
  id: string
  textEn: string
  textAr: string | null
  scope: FootnoteScope
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
/**
 * How this shop writes its currency.
 *
 * **The shop's, not the offer's, which is why it is a separate argument.** The
 * offer carries the *code* — frozen with the book, so a reprint reproduces the
 * currency it was priced in — and the shop decides whether a card prints that
 * code or a symbol. Merging the two onto `OfferRow` would put a shop setting on
 * a shape whose comment says "the subset of `offers`", and the next reader would
 * reasonably expect changing it to change one offer.
 *
 * Omitted means the code, which is what every card drew before a shop could
 * choose and what the column defaults to.
 */
export interface CurrencyPresentation {
  display: CurrencyDisplay
  /** The shop's own symbol, overriding the market default. */
  symbol: string | null
}

export function composeOffer(
  offer: OfferRow,
  tier: TierRow,
  edition: Edition,
  currency?: CurrencyPresentation
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

  const flags = flagsFor(offer, items, edition)

  return {
    id: offer.id,
    position: offer.position,
    name,
    spec,
    brand: pick(lead.product.brandAr, lead.product.brandEn, edition),
    imageUrl: lead.product.imageUrl,
    priceMark: toPriceMark(offer.price, offer.currency as Currency, tier.id, {
      ...(offer.comparePrice === null
        ? {}
        : { comparePrice: formatMoney(offer.comparePrice, offer.currency as Currency) }),
      /**
       * What the card prints where the currency goes.
       *
       * **Resolved here and not in the painter**, so the four surfaces that
       * share `draw.tsx` cannot answer it four ways — and so the engine, which
       * has no shop, never has to. `currencyLabelFor` is the one place the
       * precedence lives: the shop's own symbol, then the market default, then
       * the code.
       *
       * Set only when the shop asked for a symbol. Left absent, the mark draws
       * `offer.currency`, which is what it always drew — and that is what keeps
       * every existing book unchanged.
       */
      ...(currency === undefined || currency.display === 'CODE'
        ? {}
        : {
            currencyLabel: currencyLabelFor(
              offer.currency as Currency,
              currency.display,
              currency.symbol
            ),
          }),
    }),
    origin: pick(lead.product.originAr, lead.product.originEn, edition),
    packSize: packLabel(lead.product),
    ...savings(offer.price, offer.comparePrice, offer.currency as Currency),
    tierLabel: pick(tier.labelAr, tier.labelEn, edition) ?? tier.labelEn,
    tierToken: tier.tokenRef,
    unitPrice: unitPriceFor(offer, lead),
    unitPriceMode: offer.unitPriceMode,
    unitPriceValue: offer.unitPriceValue,
    unitPriceUnit: offer.unitPriceUnit,
    legalLines: offer.legalLines,
    chips: offer.chips.map((chip) => ({
      id: chip.id,
      label: pick(chip.labelAr, chip.labelEn, edition) ?? chip.labelEn,
      anchor: chip.anchor,
      isOfferType: chip.kind === OFFER_TYPE_CHIP_KIND,
    })),
    footnotes: offer.footnotes.map((note) => ({
      id: note.id,
      text: pick(note.textAr, note.textEn, edition) ?? note.textEn,
      scope: note.scope,
    })),
    flags,
    // Set only when the flag is, so the panel cannot offer a paid action
    // against a photo that does not need one. The lead item is the one whose
    // photo a card draws — `flagsFor` reads the same item.
    fallbackImageProductId: flags.includes('fallback-image')
      ? (items[0]?.product.id ?? null)
      : null,
    // Same gate, so it cannot describe a photo no button is offered against.
    fallbackImageIsShared:
      flags.includes('fallback-image') && (items[0]?.product.imageIsShared ?? false),
    // The lead item's, because the lead item's photo is what a card draws.
    imageShadowUrls: lead.product.imageShadowUrls ?? {},
    // Same rule, same reason: set only when the flag is. The lead item is the
    // one whose photo a card draws, and `flagsFor` reads the same item.
    missingImageProductId: flags.includes('no-image') ? (items[0]?.product.id ?? null) : null,
    items: items.map((item) => ({
      id: item.id,
      name: nameFor(item, edition),
      nameOverrideEn: item.nameOverrideEn,
      nameOverrideAr: item.nameOverrideAr,
      specOverrideEn: item.specOverrideEn,
      specOverrideAr: item.specOverrideAr,
      catalog: {
        nameEn: item.product.nameEn,
        nameAr: item.product.nameAr,
        specEn: item.product.specEn,
        specAr: item.product.specAr,
      },
      connector: item.connector,
    })),
  }
}

/**
 * A was-price, to the currency's own number of decimals.
 *
 * **`PriceMark.comparePrice` is documented as already formatted, and Prisma does
 * not format.** `Decimal.toString()` drops trailing zeros, so a `32.00` column
 * arrives as `32` and the struck-through price on the card reads `32` beside a
 * `24.50` — which looks like a typo on a printed flyer, and is the kind of thing
 * nobody notices until it is in a customer's hand. The offer price is unaffected
 * because `splitAmount` does its own `toFixed`; only this one passes through.
 *
 * `minorDigits` rather than a constant 2: KWD, OMR and BHD carry three.
 */
/**
 * What the shop saved, in money and in percent.
 *
 * **Both null together.** An offer with no was-price has saved nothing, and a
 * "SAVE 0%" flash is worse than no flash — so this returns nulls rather than
 * zeros, and §3.7 collapses the element that was bound to it along with the gap
 * beside it.
 *
 * **Null also when the was-price is not higher.** A comparison price at or below
 * the offer price is a data error, not a saving, and printing "SAVE -2.00" on a
 * flyer is the kind of thing a shop hears about from a customer.
 *
 * The amount carries the currency's own precision, because it is money. The
 * percent is rounded to a whole number, because nobody prints "SAVE 17.4%".
 */
function savings(
  price: string,
  comparePrice: string | null,
  currency: Currency
): { saveAmount: string | null; savePercent: string | null } {
  if (comparePrice === null) return { saveAmount: null, savePercent: null }
  const was = Number(comparePrice)
  const now = Number(price)
  if (!Number.isFinite(was) || !Number.isFinite(now) || was <= now) {
    return { saveAmount: null, savePercent: null }
  }
  return {
    saveAmount: (was - now).toFixed(minorDigits(currency)),
    savePercent: `${Math.round(((was - now) / was) * 100)}%`,
  }
}

function formatMoney(value: string, currency: Currency): string {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(minorDigits(currency)) : value
}

/**
 * The unit price line, or nothing.
 *
 * **Three modes and three different answers**, and the difference between the
 * first two is what a reprint depends on. `AUTO` derives from the lead item's
 * pack columns *now*; `MANUAL` reads the value frozen on the offer, which E5 §4
 * requires at publish so a reprint reproduces the number that was printed rather
 * than recomputing against pack data since corrected; `HIDDEN` draws no line.
 *
 * **The lead item's pack, not every item's.** E5 §4 says a multi-item offer with
 * divergent packs emits one line per item — that needs a place on the card for
 * a second line, which no block has. One line from the item that already
 * supplies the packshot and the brand lockup is the honest subset; the rest is
 * recorded rather than half-drawn.
 *
 * The currency is not in the string. The card knows its own, and a rate carrying
 * a code would print it twice beside the price mark.
 */
function unitPriceFor(offer: OfferRow, lead: ItemRow): string | null {
  if (offer.unitPriceMode === 'HIDDEN') return null

  if (offer.unitPriceMode === 'MANUAL') {
    if (offer.unitPriceValue === null || offer.unitPriceUnit === null) return null
    const unit = offer.unitPriceUnit
    // A manual rate may name any pack unit the owner chose; the label only
    // knows the three base units, so grams and millilitres pass through as
    // themselves rather than being silently converted to a number the owner
    // did not type.
    return unit === 'KG' || unit === 'L' || unit === 'PIECE'
      ? unitPriceLabel({ value: offer.unitPriceValue, unit })
      : `${offer.unitPriceValue} per ${unit.toLowerCase()}`
  }

  const derived = deriveUnitPrice(offer.price, lead.product)
  return derived === null ? null : unitPriceLabel(derived)
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
function flagsFor(offer: OfferRow, items: ItemRow[], edition: Edition): OfferFlag[] {
  const flags: OfferFlag[] = []
  const lead = items[0]

  // **A price of zero is unset, not free.** `offers.price` is NOT NULL, so a book
  // built from catalog products — which carry no price, because a price belongs
  // to an offer — has to write *something*, and zero is the only honest
  // placeholder. It must never reach a customer: a flyer printing `AED 0.00`
  // beside a real product is worse than one missing the product entirely.
  if (Number(offer.price) === 0) flags.push('no-price')

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

/**
 * Page sizes, in px at 150dpi.
 *
 * A book's format decides its artboard; the engine takes a rectangle rather
 * than a paper name. Here in the pure module because two callers need the same
 * four numbers — `loadBook` draws with them and the grid route counts pages
 * with them — and `lib/offer-book.ts` is `server-only`.
 */
const PAGE_SIZE: Record<string, { width: number; height: number }> = {
  leaflet: { width: 1240, height: 1754 },
  catalog: { width: 1240, height: 1754 },
  print: { width: 1240, height: 1754 },
  a3: { width: 1754, height: 2480 },
  instagram_post: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  whatsapp: { width: 1080, height: 1080 },
}

/** A4 portrait, which is what an unrecognised format would have been anyway. */
export function pageSizeFor(format: string): { width: number; height: number } {
  return PAGE_SIZE[format] ?? { width: 1240, height: 1754 }
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
  background?: unknown
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
    ...(readBackground(row.background) === null
      ? {}
      : { background: readBackground(row.background) as PageBackground }),
    regions: row.regions as Region[],
  }
}

/**
 * The `background` column, narrowed enough to be worth trusting.
 *
 * **Checked rather than asserted, and unlike `regions` a bad one does not
 * throw.** A malformed `regions` is a book that cannot be laid out at all, so
 * failing loudly is the only honest answer. A malformed background is a book
 * that lays out perfectly and is the wrong colour — and refusing to open it
 * would leave the owner no way to change the thing that is wrong. So it falls
 * back to paper, which is what every book drew before the column existed.
 *
 * The check is one level deep: `from` has to be one of the five sources the
 * union allows. Validating a gradient's stops per render would cost a parse on
 * every page, and the writer is the one route that can produce this value.
 */
function readBackground(value: unknown): PageBackground | null {
  if (value === null || typeof value !== 'object') return null

  const from = (value as { from?: unknown }).from
  const sources = ['role', 'palette', 'hex', 'gradient', 'asset']
  if (typeof from !== 'string' || !sources.includes(from)) return null

  // The shape below `from` is the write path's contract, the same way an
  // `Arrangement` is the block designer's — see `loadBlocks`.
  return value as PageBackground
}


/**
 * A book's first page, composed and ready to draw at thumbnail size.
 *
 * **Here rather than in the list component** because two callers produce it now
 * — the home screen for the six it shows, and `POST /api/v1/offer-books/covers`
 * for the ones inside the "earlier books" dialog — and a shape declared in the
 * component that consumes it is one the second producer copies.
 *
 * The real page at a small size, not a picture of it: the artboard is inline SVG
 * from engine geometry, so a cover is the same component the editor and the
 * preview render and cannot disagree with the book it stands for.
 */
export type BookCover = {
  page: FlowPage
  size: { width: number; height: number }
  offers: Record<string, ComposedOffer>
  blocks: Record<string, Block>
  direction: 'ltr' | 'rtl'
  background: PageBackground | null
}
