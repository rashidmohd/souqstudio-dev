import { PrismaClient } from '@prisma/client'
import type { GridConfig, TemplateConfig } from '@souqstudio/types'

/**
 * Reference data every environment needs: the five grids of E4-03 and the five
 * templates of E4-04.
 *
 * These are rows rather than constants in the web app because three features
 * read them — the E1-04 setup wizard, the E6 editor, and E7's admin template
 * management. A hardcoded copy in one of them becomes a second source of truth
 * the moment an admin edits a template.
 *
 * Idempotent: every record is upserted against a stable id, so running it twice
 * changes nothing and running it after an edit restores the shipped defaults.
 * Ids are hand-written, not cuid(), for exactly that reason — a generated id
 * would insert a duplicate on every run.
 */

const prisma = new PrismaClient()

// ─── Grids — E4-03 ────────────────────────────────────────────────────────────

/**
 * Cell rectangles are fractions of the artboard, not pixels, so one grid serves
 * a 1080×1080 Instagram post and an A4 page without a second definition.
 */
const GRIDS: Array<{
  id: string
  name: string
  config: GridConfig
  compatibleFormats: string[]
  minProducts: number
  maxProducts: number
}> = [
  {
    id: 'grid_2x2',
    name: '2×2',
    config: {
      columns: 2,
      rows: 2,
      gap: 0.03,
      cells: [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      ],
    },
    compatibleFormats: ['instagram_post', 'whatsapp', 'leaflet', 'catalog', 'a3', 'print'],
    minProducts: 4,
    maxProducts: 4,
  },
  {
    id: 'grid_hero',
    name: 'Hero + grid',
    config: {
      columns: 2,
      rows: 3,
      gap: 0.03,
      cells: [
        // The hero takes the full width of the top two thirds.
        { x: 0, y: 0, w: 1, h: 0.55 },
        { x: 0, y: 0.55, w: 0.3333, h: 0.45 },
        { x: 0.3333, y: 0.55, w: 0.3333, h: 0.45 },
        { x: 0.6666, y: 0.55, w: 0.3334, h: 0.45 },
      ],
    },
    compatibleFormats: ['instagram_post', 'whatsapp', 'leaflet', 'catalog', 'a3', 'print'],
    minProducts: 4,
    maxProducts: 4,
  },
  {
    id: 'grid_3x2',
    name: '3×2',
    config: {
      columns: 3,
      rows: 2,
      gap: 0.025,
      cells: [
        { x: 0, y: 0, w: 0.3333, h: 0.5 },
        { x: 0.3333, y: 0, w: 0.3333, h: 0.5 },
        { x: 0.6666, y: 0, w: 0.3334, h: 0.5 },
        { x: 0, y: 0.5, w: 0.3333, h: 0.5 },
        { x: 0.3333, y: 0.5, w: 0.3333, h: 0.5 },
        { x: 0.6666, y: 0.5, w: 0.3334, h: 0.5 },
      ],
    },
    compatibleFormats: ['instagram_post', 'whatsapp', 'leaflet', 'catalog', 'a3', 'print'],
    minProducts: 6,
    maxProducts: 6,
  },
  {
    id: 'grid_story_strip',
    name: 'Story strip',
    config: {
      columns: 1,
      rows: 4,
      gap: 0.02,
      cells: [
        { x: 0, y: 0, w: 1, h: 0.25 },
        { x: 0, y: 0.25, w: 1, h: 0.25 },
        { x: 0, y: 0.5, w: 1, h: 0.25 },
        { x: 0, y: 0.75, w: 1, h: 0.25 },
      ],
    },
    // Story only, per E7-04. A tall strip on a square post wastes half the page.
    compatibleFormats: ['story'],
    minProducts: 4,
    maxProducts: 4,
  },
  {
    id: 'grid_sidebar',
    name: 'Sidebar',
    config: {
      columns: 2,
      rows: 2,
      gap: 0.03,
      cells: [
        // Anchored by fraction, not by "left" — the artboard never mirrors, so
        // this stays put in Arabic exactly as designed.
        { x: 0, y: 0, w: 0.55, h: 1 },
        { x: 0.55, y: 0, w: 0.45, h: 0.5 },
        { x: 0.55, y: 0.5, w: 0.45, h: 0.5 },
      ],
    },
    compatibleFormats: ['instagram_post', 'whatsapp', 'leaflet', 'catalog', 'a3', 'print'],
    minProducts: 3,
    maxProducts: 3,
  },
]

// ─── Templates — E4-04 ────────────────────────────────────────────────────────

const TEMPLATES: Array<{
  id: string
  name: string
  description: string
  config: TemplateConfig
  planTier: string
  isSeasonal: boolean
}> = [
  {
    id: 'tpl_clean',
    name: 'Clean & minimal',
    description: 'White ground, quiet type. Pharmacy and premium grocery.',
    config: {
      surface: 'light',
      priceStyle: 'plain',
      badge: 'none',
      cardRadius: 3,
      cardBorder: true,
      density: 'airy',
    },
    planTier: 'starter',
    isSeasonal: false,
  },
  {
    id: 'tpl_bold',
    name: 'Bold & sale',
    description: 'Brand colour everywhere, big badges. Electronics and promotions.',
    config: {
      surface: 'brand',
      priceStyle: 'burst',
      badge: 'circle',
      cardRadius: 3,
      cardBorder: false,
      density: 'balanced',
    },
    planTier: 'starter',
    isSeasonal: false,
  },
  {
    id: 'tpl_premium',
    name: 'Premium',
    description: 'Dark ground with accent detailing. Luxury and lifestyle retail.',
    config: {
      surface: 'dark',
      priceStyle: 'tag',
      badge: 'corner',
      cardRadius: 3,
      cardBorder: false,
      density: 'airy',
    },
    planTier: 'pro',
    isSeasonal: false,
  },
  {
    id: 'tpl_festive',
    name: 'Festive',
    description: 'Seasonal borders and motifs. Eid, Diwali and National Day.',
    config: {
      surface: 'brand',
      priceStyle: 'band',
      badge: 'ribbon',
      cardRadius: 3,
      cardBorder: true,
      density: 'balanced',
      // E7 fills this with a real asset; the frame is the template's own.
      overlay: 'seasonal-frame',
    },
    planTier: 'pro',
    isSeasonal: true,
  },
  {
    id: 'tpl_supermarket',
    name: 'Supermarket',
    description: 'Dense and price-forward. Hypermarkets and bulk retail.',
    config: {
      surface: 'light',
      priceStyle: 'band',
      badge: 'corner',
      cardRadius: 3,
      cardBorder: true,
      density: 'dense',
    },
    planTier: 'starter',
    isSeasonal: false,
  },
]

// ─── Plans — E3 ───────────────────────────────────────────────────────────────

/**
 * The four tiers from docs/project.md → Business Model.
 *
 * **The ids are the tier names, not `plan_starter`.** `templates.planTier`
 * already carries `starter` and `pro` as plain strings, so equal ids make the
 * template gate `template.planTier === organization.planId` with no mapping
 * table between two spellings of the same four words.
 *
 * **`stripePriceId` is deliberately null here.** A price id is specific to one
 * Stripe account and mode, so a seeded one would be wrong in every environment
 * but the one it was copied from. The web app provisions and caches them on
 * first use — see `ensurePlanPrices()` in apps/web/lib/plans.ts.
 *
 * **`maxUsers` is an assumption.** No document in the repo states a seat limit
 * per plan; docs/E3 only says the plan screen shows "included users". These are
 * placeholders chosen to sit sensibly against the shop counts. Confirm before
 * launch pricing goes out — changing them later is a customer-visible downgrade.
 */
const PLANS: Array<{
  id: string
  name: string
  tier: number
  maxShops: number | null
  maxUsers: number | null
  aiCreditsMonth: number
  basePrice: number
  pricePerShop: number
  creditsRollover: boolean
  isPublic: boolean
  features: Record<string, boolean>
}> = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 1,
    maxShops: 1,
    maxUsers: 2,
    aiCreditsMonth: 50,
    basePrice: 15,
    // Zero, not a price: project.md gives Starter one shop and no "+$x each
    // extra". A second shop on Starter is an upgrade, not an add-on, and
    // lib/billing.ts refuses it rather than billing for it.
    pricePerShop: 0,
    creditsRollover: false,
    isPublic: true,
    features: {},
  },
  {
    id: 'pro',
    name: 'Pro',
    tier: 2,
    maxShops: 3,
    maxUsers: 5,
    aiCreditsMonth: 200,
    basePrice: 35,
    pricePerShop: 10,
    creditsRollover: true,
    isPublic: true,
    features: { customTemplates: true },
  },
  {
    id: 'business',
    name: 'Business',
    tier: 3,
    maxShops: 10,
    maxUsers: 20,
    aiCreditsMonth: 500,
    basePrice: 89,
    pricePerShop: 7,
    creditsRollover: true,
    isPublic: true,
    features: { customTemplates: true, allocatedCredits: true, prioritySupport: true },
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 4,
    // Unlimited, per the schema comment on Plan.maxShops.
    maxShops: null,
    maxUsers: null,
    // "Custom" in project.md. A non-null number is required by the column, so
    // this is a floor an Enterprise agreement raises per organization — not a
    // published figure.
    aiCreditsMonth: 2000,
    basePrice: 0,
    pricePerShop: 0,
    creditsRollover: true,
    // Unlisted: Enterprise is a conversation, so it must not appear in the
    // comparison table with a $0 price and a checkout button.
    isPublic: false,
    features: {
      customTemplates: true,
      allocatedCredits: true,
      prioritySupport: true,
      whiteLabel: true,
      apiAccess: true,
    },
  },
]

async function main() {
  for (const grid of GRIDS) {
    await prisma.grid.upsert({
      where: { id: grid.id },
      // Published on seed: these are the shipped defaults, and a draft grid
      // would leave the setup wizard with nothing to offer.
      update: { ...grid, status: 'published' },
      create: { ...grid, status: 'published' },
    })
  }
  console.log(`[seed] ${GRIDS.length} grids`)

  for (const template of TEMPLATES) {
    await prisma.template.upsert({
      where: { id: template.id },
      update: { ...template, status: 'published' },
      create: { ...template, status: 'published' },
    })
  }
  console.log(`[seed] ${TEMPLATES.length} templates`)

  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      // `stripePriceId` and `stripeShopPriceId` are absent from the payload on
      // purpose, so a re-run restores the shipped limits and prices without
      // discarding the Stripe ids the web app cached against them.
      update: plan,
      create: plan,
    })
  }
  console.log(`[seed] ${PLANS.length} plans`)
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
