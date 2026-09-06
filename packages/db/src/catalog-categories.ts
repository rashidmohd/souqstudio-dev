/**
 * The ten top-level catalog categories, in one place. E5-02.
 *
 * **They were written out in three files** — `prisma/seed.ts` publishes them,
 * `scripts/seed-catalog-demo.ts` assigns them, and the Open Food Facts mapping
 * now resolves onto them. Nothing joins on an id: `listCategories` counts with
 * `p.category = c.name`, so the *string* is the key, and a fourth copy would be
 * a fourth chance to disagree with the other three.
 *
 * The failure that makes this worth a module is silent. A category written
 * `Personal care` rather than `Personal Care` throws nothing, matches nothing,
 * and shows a tile reading "nothing here yet" beside products that plainly
 * exist — which reads as a broken count rather than as a broken string.
 *
 * Ids are hand-written so `pnpm db:seed` upserts rather than inserting
 * duplicates; they are not `cuid()` for exactly that reason.
 */
export const CATALOG_CATEGORIES = [
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
] as const

/** The name column's vocabulary, so a mapping cannot invent an eleventh. */
export type CategoryName = (typeof CATALOG_CATEGORIES)[number]['name']

export const CATEGORY_NAMES: readonly CategoryName[] = CATALOG_CATEGORIES.map((c) => c.name)

/**
 * `satisfies` rather than a `Record<string, CategoryName>` annotation: the
 * annotation widens every member to the union and, under
 * `noUncheckedIndexedAccess`, makes each lookup `CategoryName | undefined`.
 * This checks the values against the union while keeping them literal.
 */
export const CATEGORY = {
  GROCERY: 'Grocery',
  BEVERAGES: 'Beverages',
  SNACKS: 'Snacks',
  DAIRY: 'Dairy',
  BAKERY: 'Bakery',
  CLEANING: 'Cleaning',
  PERSONAL_CARE: 'Personal Care',
  ELECTRONICS: 'Electronics',
  FRESH_PRODUCE: 'Fresh Produce',
  FROZEN_FOODS: 'Frozen Foods',
} as const satisfies Record<string, CategoryName>
