import { PrismaClient } from '@prisma/client'

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

// ─── Blocks ───────────────────────────────────────────────────────────────────
//
// **Nothing is seeded here yet, and that is a gap rather than a decision.**
//
// The five grids and five templates that lived here are gone with their tables.
// A brand kit carries no layout and a book picks its own grid, so a template
// that bundled look *and* arrangement had nothing left to be —
// `docs/composition-model.md` §4.1.
//
// What replaces them is a seeded `blocks` library: an offer card with its four
// arrangements, a header, a footer, a hero band. `packages/engine/harness` has
// working versions of all four and they render correctly; porting them here is
// the next step, and until it happens a new organization has no block to compose
// with. See the build order in `docs/composition-model.md` §12.

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
