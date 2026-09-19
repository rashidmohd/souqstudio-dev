/**
 * The sixteen top-level catalog categories, in one place. E5-02.
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
  /**
   * **The six non-grocery aisles, added 19 September 2026.**
   *
   * The ten above were specified for a grocery. The first real regional
   * assortment imported into the universal catalog is a hypermarket, and 4,691
   * of its 18,428 rows — a quarter — had no category among the ten: Men Wear,
   * Cat Food, Stationery Supplies, Baby Diaper, Toys, Kitchen Ware. They were
   * fully searchable and completely absent from the category browser, which to
   * a shop owner reads as a catalog that is missing a quarter of the shop.
   *
   * **Each one is here because a measured count justified it**, not because a
   * taxonomy ought to have it: Stationery 835 rows, Household 765, Apparel 762,
   * Baby 550, Pet 469, Toys 308. Nothing smaller got a tile — an aisle with
   * nine products in it is a tile that reads as empty.
   *
   * **There is deliberately no Outdoor category**, which the subcategory names
   * argue for and the products refuse: `Camping & Hiking` is charcoal tablets,
   * `BBQ Accessories` is charcoal and fuel cans, `Picnic Accessories` is more
   * charcoal, and `Outdoor Equipment` is gas lighters and matches. All of it is
   * the household aisle. Reading the product names rather than the category
   * names is the only thing that catches that.
   */
  { id: 'cat_baby',          name: 'Baby',          nameAr: 'مستلزمات الأطفال', displayOrder: 11 },
  { id: 'cat_household',     name: 'Household',     nameAr: 'أدوات منزلية',     displayOrder: 12 },
  { id: 'cat_pet',           name: 'Pet',           nameAr: 'مستلزمات الحيوانات الأليفة', displayOrder: 13 },
  { id: 'cat_stationery',    name: 'Stationery',    nameAr: 'قرطاسية',          displayOrder: 14 },
  { id: 'cat_apparel',       name: 'Apparel',       nameAr: 'ملابس',            displayOrder: 15 },
  { id: 'cat_toys',          name: 'Toys',          nameAr: 'ألعاب',            displayOrder: 16 },
] as const

/** The name column's vocabulary, so a mapping cannot invent a seventeenth. */
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
  BABY: 'Baby',
  HOUSEHOLD: 'Household',
  PET: 'Pet',
  STATIONERY: 'Stationery',
  APPAREL: 'Apparel',
  TOYS: 'Toys',
} as const satisfies Record<string, CategoryName>
