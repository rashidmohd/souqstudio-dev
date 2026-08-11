// Shared TypeScript types for SouqStudio
// Add types here that are used across multiple apps/packages

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
 * The per-shop configuration that drives every offer book. Stored as JSONB on
 * `shops.brandKit`; the logo itself lives in `shops.logoUrl`.
 *
 * Every field is optional because the setup wizard saves after each step — a
 * half-finished kit is the normal state of a shop mid-onboarding, not a defect.
 * `onboardingStep` is what lets a refresh resume where it left off.
 */
export interface BrandKit {
  primaryColor?: string | undefined
  secondaryColor?: string | undefined
  accentColor?: string | undefined
  /** Colours pulled from the logo, offered as swatches. Not choices yet. */
  suggestedColors?: string[] | undefined
  gridId?: string | undefined
  templateId?: string | undefined
  fontDisplay?: string | undefined
  fontPrice?: string | undefined
  fontBody?: string | undefined
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
