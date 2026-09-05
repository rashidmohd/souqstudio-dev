import { Prisma } from '@prisma/client'
import { SEED_BLOCKS } from '@souqstudio/engine'
import { DEFAULT_PROMO_TIERS } from '../src/promo-tiers'
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
// The five grids and five templates that lived here are gone with their tables:
// a brand kit carries no layout and a book picks its own grid, so a template
// that bundled look *and* arrangement had nothing left to be. What replaced
// them is the block library in `seed-blocks.ts`.

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

/**
 * Any organization missing its promo tiers gets them.
 *
 * The E5 migration seeded these for the organizations that existed then, and
 * nothing seeded them for the ones created since — so an account made after that
 * migration could not create its first offer. Signup now seeds them
 * (`apps/web/lib/promo-tiers.ts`); this backfills the accounts that fell in the
 * gap, and is a no-op on every run after the first.
 */
async function backfillPromoTiers() {
  const orgs = await prisma.organization.findMany({
    where: { promoTiers: { none: {} } },
    select: { id: true },
  })

  for (const org of orgs) {
    await prisma.promoTier.createMany({
      data: DEFAULT_PROMO_TIERS.map((tier) => ({ ...tier, organizationId: org.id })),
    })
  }

  console.log(`[seed] promo tiers backfilled for ${orgs.length} organizations`)
}

async function seedBlocks() {
  for (const block of SEED_BLOCKS) {
    const data = {
      name: block.name,
      description: block.description,
      repeats: block.repeats,
      // `Arrangement[]` is JSON-shaped but is an interface, and an interface has
      // no implicit index signature, so it is not assignable to Prisma's mapped
      // JSON input type. Same assertion as `lib/brand-kit.ts` in the web app.
      arrangements: block.arrangements as unknown as Prisma.InputJsonValue,
      status: 'published',
      // Null organizationId is what makes a block seeded rather than authored.
      organizationId: null,
    }

    await prisma.block.upsert({
      where: { id: block.id },
      update: data,
      create: { id: block.id, ...data },
    })
  }

  console.log(`[seed] ${SEED_BLOCKS.length} blocks`)
}

// ─── Catalog categories — E5-02 ───────────────────────────────────────────────

/**
 * The ten top-level categories E5-02 names, in the order it names them.
 *
 * **Rows, not a constant in the web app**, for the same reason as the blocks
 * above: the catalog browser reads them, the spreadsheet import of E5-06
 * resolves against them, and E5-08 lets an admin edit them. A hardcoded copy in
 * any one of those becomes a second source of truth the moment the first edit
 * lands.
 *
 * **`catalog_products.category` is a plain string that matches `name`**, not a
 * foreign key — that is the schema as written. So `name` is the join key and
 * must not be edited casually: renaming a category here orphans every product
 * carrying the old string. The Arabic label is free to change; nothing joins on
 * it.
 *
 * No subcategories are seeded. Nothing in E5 names them, and a seeded list
 * would immediately disagree with whatever the Open Food Facts import actually
 * produces — so the browser derives them from the rows on hand instead, and a
 * breadcrumb only ever offers a step with something behind it. `parentId` stays
 * for E5-08 to populate.
 *
 * Ids are hand-written so a re-run upserts rather than inserting duplicates.
 */
const CATALOG_CATEGORIES: Array<{
  id: string
  name: string
  nameAr: string
  displayOrder: number
}> = [
  { id: 'cat_grocery',       name: 'Grocery',       nameAr: 'بقالة',            displayOrder: 1 },
  { id: 'cat_beverages',     name: 'Beverages',     nameAr: 'مشروبات',          displayOrder: 2 },
  { id: 'cat_snacks',        name: 'Snacks',        nameAr: 'وجبات خفيفة',      displayOrder: 3 },
  { id: 'cat_dairy',         name: 'Dairy',         nameAr: 'ألبان',            displayOrder: 4 },
  { id: 'cat_bakery',        name: 'Bakery',        nameAr: 'مخبوزات',          displayOrder: 5 },
  { id: 'cat_cleaning',      name: 'Cleaning',      nameAr: 'منظفات',           displayOrder: 6 },
  { id: 'cat_personal_care', name: 'Personal Care', nameAr: 'العناية الشخصية',  displayOrder: 7 },
  { id: 'cat_electronics',   name: 'Electronics',   nameAr: 'إلكترونيات',       displayOrder: 8 },
  { id: 'cat_fresh_produce', name: 'Fresh Produce', nameAr: 'خضار وفواكه',      displayOrder: 9 },
  { id: 'cat_frozen_foods',  name: 'Frozen Foods',  nameAr: 'أطعمة مجمدة',      displayOrder: 10 },
]

async function seedCatalogCategories() {
  for (const category of CATALOG_CATEGORIES) {
    const data = {
      name: category.name,
      nameAr: category.nameAr,
      displayOrder: category.displayOrder,
      parentId: null,
    }

    await prisma.catalogCategory.upsert({
      where: { id: category.id },
      update: data,
      create: { id: category.id, ...data },
    })
  }

  console.log(`[seed] ${CATALOG_CATEGORIES.length} catalog categories`)
}

async function main() {
  await backfillPromoTiers()
  await seedBlocks()
  await seedCatalogCategories()

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
