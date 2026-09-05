// Shared TypeScript types for SouqStudio
// Add types here that are used across multiple apps/packages

// The composition model — blocks, page grids, flow and pins. See
// `docs/composition-model.md`. It supersedes `GridConfig`, `TemplateConfig` and
// the E6 §2 grammar further down this file; those stay until the E4 brand flow
// is migrated off them.
export * from './composition'
import type { BrandColor, TextStyle, TypeScale } from './composition'

export type Role = 'owner' | 'manager' | 'editor' | 'viewer'
export type BillingStatus = 'active' | 'past_due' | 'suspended' | 'cancelled'
export type OfferBookStatus = 'draft' | 'published' | 'archived'
export type OfferBookFormat =
  | 'instagram_post'
  | 'story'
  | 'whatsapp'
  | 'leaflet'
  | 'catalog'
  | 'a3'
  | 'print'

export type JobStatus = 'queued' | 'processing' | 'complete' | 'failed'

export type AiJobType =
  | 'character_gen'
  | 'pose_gen'
  | 'cover_gen'
  | 'background_removal'
  | 'prompt_gen'

export type EmailTemplate =
  | 'email-verification'
  | 'welcome'
  | 'password-reset'
  | 'user-invite'
  | 'payment-succeeded'
  | 'payment-failed'
  | 'payment-final-warning'
  | 'plan-upgraded'
  | 'plan-downgraded'
  | 'subscription-cancelled'
  | 'weekly-report'
  | 'low-credits-warning'
  | 'offer-book-expiring'
  | 'new-template-available'

// ─── Brand kit — E1-04 and E4 ─────────────────────────────────────────────────

/**
 * Where the shop's logo is in the background-removal pipeline.
 *
 * `original` is not a failure state. Removal runs on a separate Python service
 * that can be down or slow, and a shop owner setting up at 11pm must not be
 * blocked by it — they keep the logo they uploaded and can retry later.
 */
export type LogoStatus = 'none' | 'processing' | 'ready' | 'original'

/**
 * Who the shop is: logo, colours, typography. Stored as JSONB on
 * `shops.brandKit`; the logo itself lives in `shops.logoUrl`.
 *
 * **Identity only — the kit holds no layout.** It carried `gridId` and
 * `templateId` until the composition model landed; both are gone. A brand kit
 * *has* many blocks, it does not contain a choice of one, and which grid a book
 * uses is a decision about that book rather than about the shop. See
 * `docs/composition-model.md` §2.
 *
 * Every field is optional because setup saves as it goes — a half-finished kit
 * is the normal state of a shop mid-onboarding, not a defect. `onboardingStep`
 * is what lets a refresh resume where it left off.
 */
export interface BrandKit {
  /**
   * The shop's colours, in their own order and under their own names — the
   * palette half of a brand guideline.
   *
   * Open-ended on purpose. It was three fixed slots called primary, secondary
   * and accent, which both capped a brand at three colours and implied where
   * each one goes. A guideline defines colours; blocks decide placement.
   *
   * `primaryColor`, `secondaryColor` and `accentColor` below are the first three
   * entries, kept in sync on every save so that everything reading them keeps
   * working. `palette` is authoritative when present.
   */
  palette?: BrandColor[] | undefined
  primaryColor?: string | undefined
  secondaryColor?: string | undefined
  accentColor?: string | undefined
  /** Colours pulled from the logo, offered as swatches. Not choices yet. */
  suggestedColors?: string[] | undefined
  /** The four face slots. `fontHeadline` is what a hero band, a cover masthead
   *  or a campaign headline is set in — deliberately separate from the face
   *  product names use, because they are not the same voice. */
  fontHeadline?: string | undefined
  fontDisplay?: string | undefined
  fontPrice?: string | undefined
  fontBody?: string | undefined
  /**
   * The shop's text styles, named by the shop — the typography half of a brand
   * guideline, and the counterpart of `palette`.
   *
   * Open-ended for the same reason: a fixed h1–h6 ladder capped a brand at eight
   * styles and named them after nothing an owner recognises. Each style carries
   * its own family, size, weight, italic and colour.
   */
  textStyles?: TextStyle[] | undefined
  /** The derived h1–h6 view, for blocks that bind to a slot. */
  typeScale?: TypeScale | undefined
  logoStatus?: LogoStatus | undefined
  /** The logo exactly as uploaded, kept so removal can be retried or undone. */
  logoOriginalUrl?: string | undefined
  /** Highest wizard step reached, 1–5. Absent means setup has not started. */
  onboardingStep?: number | undefined
  onboardingCompletedAt?: string | undefined
}

/** Grid layout preset. `grids.config` — E4-03. */
export interface GridConfig {
  /** How cells are laid out on a unit canvas. Cells are fractions, not pixels. */
  cells: Array<{ x: number; y: number; w: number; h: number }>
  columns: number
  rows: number
  /** Gap between cells as a fraction of the shorter canvas edge. */
  gap: number
}

/** Visual template preset. `templates.config` — E4-04. */
export interface TemplateConfig {
  /** Which brand colour drives the page ground. */
  surface: 'light' | 'dark' | 'brand'
  /** Price treatment on the card. */
  priceStyle: 'plain' | 'burst' | 'band' | 'tag'
  /** Discount badge shape, or none. */
  badge: 'none' | 'circle' | 'ribbon' | 'corner'
  /** Card corner radius on the artboard, in artboard px. */
  cardRadius: number
  /** Whether cards carry a hairline border. */
  cardBorder: boolean
  density: 'airy' | 'balanced' | 'dense'
  /** Seasonal overlay slot, filled by E7. */
  overlay?: string | undefined
}

// ─── Organization, shops and team — E2 ────────────────────────────────────────

/**
 * How much of the organization's brand a shop replaces with its own. E2-05.
 *
 * The levels are facet-shaped, not field-shaped: `colors` swaps the three brand
 * colours and nothing else, `logo` swaps the logo and nothing else. Grid,
 * template and fonts move only at `full` — the spec names no level for them.
 * See apps/web/lib/brand-inheritance.ts, which is where the table lives.
 */
export const BRAND_OVERRIDES = ['inherit', 'logo', 'colors', 'full'] as const
export type BrandOverride = (typeof BRAND_OVERRIDES)[number]

/**
 * What a row in the team list is. Not a database status — an invite has no
 * `status` column, because every one of these is derived from a timestamp and
 * storing it too would give two answers that can disagree.
 */
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

/** One shop an invite or a member is granted, with an optional role override. */
export interface ShopGrant {
  shopId: string
  /** Absent means "use the org-level role". Never 'owner'. */
  role?: Exclude<Role, 'owner'> | undefined
}

/** A shop as the shop list and the switcher need it. */
export interface ShopSummary {
  id: string
  name: string
  location: string | null
  phone: string | null
  logoUrl: string | null
  isActive: boolean
  archivedAt: string | null
  brandOverride: BrandOverride
  memberCount: number
  /** When this shop last produced an offer book. Null if it never has. */
  lastOfferBookAt: string | null
}

/** A person in the team list — an accepted member or a pending invite. */
export interface TeamMemberSummary {
  /** User id for a member, invite id for a pending invite. */
  id: string
  kind: 'member' | 'invite'
  email: string
  name: string | null
  role: Role
  status: InviteStatus
  lastLoginAt: string | null
  twoFactorEnabled: boolean
  shops: Array<{ shopId: string; name: string; role: Role }>
}

/** Cursor-paginated list envelope. Every list endpoint returns this shape. */
export interface Page<T> {
  items: T[]
  /** Pass back as `?cursor=`. Null means this was the last page. */
  nextCursor: string | null
}

export interface ApiResponse<T> {
  data: T
  error: null
}

export interface ApiError {
  data: null
  error: {
    code: string
    message: string
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError

// ─── Template grammar — E6 §2 ─────────────────────────────────────────────────
//
// A template is data, not code. Themes ship as JSON validated against this
// shape, which is why none of it is a class and none of it carries behaviour.
//
// `GridConfig` and `TemplateConfig` above are the E4 brand-kit presets — five
// seeded grids and five seeded templates that the setup wizard offers. They are
// not this. They stay until E7 migrates the seeded presets onto this grammar;
// do not extend them.

/** Which card layout a slot renders. The engine picks nothing here — the
 *  template does, per slot, so a page reads the same way every week. */
export type CardVariant =
  | 'STANDARD'
  | 'HERO'
  | 'COMPACT'
  | 'STACKED'
  | 'TEXT_ONLY'

export type PageTypeKind = 'OFFER_GRID' | 'CAMPAIGN' | 'CROSS_SELL' | 'COVER'

export interface Slot {
  id: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
  variant: CardVariant
  /** Reserve this slot for a promo tier of at least this emphasis. Offers
   *  carrying the requirement bid for spanning slots first; ties break on
   *  offer position. */
  minEmphasis?: 1 | 2 | 3 | undefined
}

/**
 * A bordered, tinted container wrapping several cells, with its own header —
 * a loyalty section, an own-brand block. A flat grid cannot express it, and a
 * real flyer uses one on most pages.
 */
export interface SlotGroup {
  id: string
  slotIds: string[]
  /** Design-system token name for the panel behind the group. Never a hex. */
  surfaceToken: string
  borderToken?: string | undefined
  labelEn?: string | undefined
  labelAr?: string | undefined
}

export interface TemplateGrid {
  cols: number
  rows: number
  gap: number
  slots: Slot[]
  groups?: SlotGroup[] | undefined
}

export interface HeroBand {
  /** Slot the hero image or masthead fills. */
  slotId: string
  imageAssetId?: string | undefined
  headlineEn?: string | undefined
  headlineAr?: string | undefined
  /** Hero photography that a model produced carries the disclosure chip. E6 §9. */
  aiGenerated?: boolean | undefined
}

export interface FooterBand {
  /** Where per-page footnotes collect, and where the variant code is stamped. */
  slotId: string
  showVariantCode: boolean
}

export type PageType =
  | { kind: 'OFFER_GRID'; hero?: HeroBand | undefined; grid: TemplateGrid; footer?: FooterBand | undefined }
  /** Campaign pages carry loyalty values and a "prices in store" footer and no
   *  price marks at all. A page type, not a styling flag — a page with prices
   *  suppressed still reserves the space for them. */
  | { kind: 'CAMPAIGN'; hero: HeroBand; slots: Slot[]; priceless: true }
  | { kind: 'CROSS_SELL'; hero: HeroBand; cta: Slot; grid?: TemplateGrid | undefined }
  | { kind: 'COVER'; hero: HeroBand; grid?: TemplateGrid | undefined; masthead: Slot }

/**
 * How many offers a page carries and what gives way to fit them.
 *
 * The reference flyer runs about eight offers a page — a premium European
 * density. GCC books commonly run 20–30 SKUs. The same template must survive
 * both, which is why the card is designed at DENSE and bilingual, the worst
 * case, and then allowed to breathe. The other direction produces a card that
 * only works at showcase density and collapses the first time a chain loads a
 * full week.
 */
export interface DensityProfile {
  id: 'SHOWCASE' | 'STANDARD' | 'DENSE'
  /** Inclusive range of cards per page. */
  cardsPerPage: [number, number]
  /** Index into the design system's type scale. Never an arbitrary size. */
  typeScaleStep: number
  /** Image share of card height, 0..1. */
  imageRatio: number
  showUnitPrice: boolean
  showOrigin: boolean
  maxSpecLines: number
}

export interface OfferTemplate {
  id: string
  pageTypes: PageType[]
  densityProfiles: DensityProfile[]
  /** Design-system token set reference. */
  tokens: string
}

// ─── Price mark — E6 §3 ───────────────────────────────────────────────────────
//
// The single element that decides whether output reads as a real offer book. It
// is a component, never assembled from text layers: owners given text boxes
// produce hundreds of inconsistent variants inside a month.
//
// Exactly one authoring control is exposed — tier. Everything else derives from
// the offer and the template.

export const CURRENCIES = ['AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD'] as const
export type Currency = (typeof CURRENCIES)[number]

/** KWD, OMR and BHD are three-decimal. The minor treatment differs and the
 *  branch is one line now and a forgotten bug later. */
export const THREE_DECIMAL_CURRENCIES: readonly Currency[] = ['KWD', 'OMR', 'BHD']

export interface PriceMark {
  /** PromoTier id — supplies label, colour token and emphasis. */
  tierId: string
  /** Integer part, oversized. */
  major: string
  /** Raised minor digits. Raised to the major's cap height, never baseline
   *  aligned. Three digits on a three-decimal currency. */
  minor?: string | undefined
  currency: Currency
  currencyPlacement: 'PREFIX' | 'SUFFIX' | 'SUPERSCRIPT'
  prefixLabel?: 'FROM' | 'EACH' | 'PER_KG' | undefined
  /** Strikethrough was-price, already formatted. */
  comparePrice?: string | undefined
  /** Template-set, ±6°. Not an owner control. */
  rotation?: number | undefined
  shape: 'TAG' | 'BURST' | 'RECT'
}

// ─── Editor overrides — E6 §1 ─────────────────────────────────────────────────

/**
 * A bounded delta against the engine's output for one slot. Stored as an array
 * on `offer_book_pages.slotOverrides`.
 *
 * Every field is clamped, and that is the point: re-running the engine — an
 * offer added, a shop variant switched, a language toggled — preserves entries
 * by `slotId` and discards orphans. Unbounded free positioning cannot survive a
 * re-run, which is what makes a weekly reissue cheap rather than a rebuild.
 */
export interface SlotOverride {
  slotId: string
  /** Clamped to ±8% of slot width. */
  offsetX?: number | undefined
  offsetY?: number | undefined
  /** Clamped to 0.8..1.25. */
  imageScale?: number | undefined
  imageAssetId?: string | undefined
  textOverrides?: Record<string, string> | undefined
}

export const SLOT_OVERRIDE_LIMITS = {
  /** Fraction of slot width and height. */
  offset: 0.08,
  imageScaleMin: 0.8,
  imageScaleMax: 1.25,
} as const

/**
 * Why a card is flagged in the editor. Every one of these is visible before
 * publish, because discovering them after a customer has seen the flyer is the
 * failure this exists to prevent.
 *
 * `missing-name-ar` blocks publish on an AR edition only. The rest warn.
 */
export type QualityFlag =
  | 'fallback-image'
  | 'low-matte-confidence'
  | 'missing-name-ar'
  | 'fit-escalated'

// ─── Catalog — E5 ─────────────────────────────────────────────────────────────

export type PackUnit = 'G' | 'KG' | 'ML' | 'L' | 'PIECE'
export type PriceMode = 'FIXED' | 'FROM' | 'PER_UNIT'
export type UnitPriceMode = 'AUTO' | 'MANUAL' | 'HIDDEN'
export type Connector = 'OR' | 'AND'
export type ChipKind = 'COUNTER' | 'ORIGIN' | 'CERT' | 'SCALE' | 'LOYALTY' | 'CUSTOM'
export type ChipAnchor = 'TOP_START' | 'TOP_END' | 'INLINE'
export type FootnoteScope = 'PAGE' | 'BOOK'
export type ImageKind = 'ORIGINAL' | 'CUTOUT' | 'THUMB'
export type ImportRowStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'UNMATCHED'
  | 'CREATED'
  | 'SKIPPED'

/** Which collection a catalog row belongs to. Derived from `organizationId`,
 *  never stored — two columns that can disagree is one too many. */
export type CatalogCollection = 'universal' | 'organization'

/** A catalog row as the search panel and the import review screen need it. */
export interface CatalogProductSummary {
  id: string
  collection: CatalogCollection
  nameEn: string
  nameAr: string | null
  brandEn: string | null
  brandAr: string | null
  specEn: string | null
  specAr: string | null
  category: string | null
  subcategory: string | null
  packSize: string | null
  packUnit: PackUnit | null
  packCount: number | null
  barcode: string | null
  /** The CUTOUT if one exists, else the ORIGINAL. `imageIsFallback` says which,
   *  because a fallback renders with a quality flag in the editor. */
  imageUrl: string | null
  imageIsFallback: boolean
}

/**
 * A top-level catalog category as the browser renders it — E5-02.
 *
 * `nameAr` falls back to `name` at render time rather than at read time, so a
 * category with no Arabic label shows its English one instead of a blank tile.
 * The fallback lives in the component because the API is language-neutral.
 *
 * `productCount` is the organization's view: its own rows plus the universal
 * ones it can see, archived excluded. Two organizations reading the same
 * universal category can legitimately see different numbers.
 */
export interface CatalogCategoryTile {
  id: string
  name: string
  nameAr: string | null
  iconUrl: string | null
  productCount: number
}

/** Which of the four ways a row was found. Ordering and the "own record"
 *  marker both need it, and the import review screen will want it too.
 *  `barcode` is not one of the ranked three: it is an equality test on a
 *  column the search vector does not even carry, so it arrives by its own
 *  route and never competes with a text hit. */
export type CatalogMatchKind = 'text' | 'synonym' | 'fuzzy' | 'barcode'

export interface CatalogSearchHit extends CatalogProductSummary {
  matchedBy: CatalogMatchKind
}
