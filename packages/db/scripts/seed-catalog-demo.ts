import { PrismaClient } from '@prisma/client'
import { hasValidCheckDigit } from '@souqstudio/types'
import { CATEGORY } from '../src/catalog-categories'

/**
 * Demo rows for the catalog. Not a fixture, not the Open Food Facts seed.
 *
 * `catalog_products` holds zero rows, and everything downstream of it — the
 * search ranking, the category tiles, the subcategory derivation, the layout
 * engine, the price mark, the fit ladder — is built and has only ever been
 * exercised against dummy products constructed in a test. This fills the table
 * with enough realistic rows to *look at* the screens, and nothing more.
 *
 * **It is not the Open Food Facts import and does not replace it.** That script
 * seeds the real universal catalog from a public export, is licence-bound, and
 * takes hours. This one writes ~90 hand-written rows in a second so a developer
 * can see `/catalog` with something in it. The two are told apart by `source`:
 * `open_food_facts` there, `demo` here.
 *
 * **`source: 'demo'` is the removal handle, and that is the whole reason it is
 * set.** Dummy data in a shared dev database is only safe if it can be taken out
 * again exactly, so `--clear` deletes on that column rather than on a name
 * pattern or a date range. Nothing else in the schema writes that value.
 *
 * Three things it does deliberately that a naive fixture would not:
 *
 * - **Every barcode carries a real check digit**, computed here and asserted
 *   with the shipped validator before anything is written. The search box routes
 *   a barcode-shaped query to `lookupBarcode`, which rejects a bad check digit
 *   *before* asking the database — so a fixture with invented barcodes produces
 *   rows that can never be found by the one path most likely to be demoed.
 * - **Every row has a real `nameAr`.** This is the gap the Open Food Facts
 *   export cannot fill — its 211 columns carry no language variants at all — and
 *   consistency check #9 asks for screens rendered in Arabic with real strings.
 *   Latin placeholder text in an RTL pass proves nothing; it was a box sized for
 *   "Basmati rice" rather than for a real Arabic name that the render harness
 *   caught last time.
 * - **A few organization rows shadow a universal barcode.** E5 §1's correction
 *   mechanic — a shop's own row *replaces* the universal one carrying the same
 *   barcode rather than merely outranking it — is the piece of the two-collection
 *   precedence most likely to be subtly wrong and least likely to be noticed,
 *   because getting it wrong shows a duplicate rather than an error. It cannot be
 *   checked at all without rows on both sides of it, so this seeds both.
 *
 * **Images are opt-in and are one placeholder repeated.** Without `--images` the
 * rows carry none and `ProductCard` renders its `ImageOff` placeholder, which is
 * honest rather than broken. With it, every product points at the single object
 * described on `DEMO_IMAGE` — read the note there before drawing any conclusion
 * from a populated grid. The cutout branch of the `bg` worker still has to be
 * exercised against a real upload either way.
 *
 * Usage:
 *
 *   pnpm --filter @souqstudio/db catalog:seed-demo
 *   pnpm --filter @souqstudio/db catalog:seed-demo --images
 *   pnpm --filter @souqstudio/db catalog:seed-demo --org <organizationId>
 *   pnpm --filter @souqstudio/db catalog:seed-demo --clear
 *   pnpm --filter @souqstudio/db catalog:seed-demo --dry-run
 */

const prisma = new PrismaClient()

/** The marker `--clear` deletes on. Nothing else in the schema writes it. */
const DEMO_SOURCE = 'demo'

/**
 * One placeholder image, already in R2, attached to every demo product by
 * `--images`.
 *
 * **It is the same picture on all of them, and that is a limitation to hold on
 * to rather than forget.** It exists so the grid, the card and the export path
 * can be looked at with an image present instead of `ProductCard`'s `ImageOff`
 * placeholder. What it cannot be used to judge:
 *
 * - **Whether a page of real products reads well.** A dairy carton on
 *   "USB-C Fast Charging Cable" is wrong on its face, and a grid of ninety
 *   identical tiles says nothing about rhythm or variety.
 * - **Anything about optical weight.** The layout engine scales cards by
 *   `bboxTight`, and one image means one bbox everywhere — so the scaling looks
 *   consistent whether or not it is correct. That is a false positive, and it is
 *   why the rows are written as ORIGINAL with a null `bboxTight` rather than as
 *   a CUTOUT with an invented one.
 *
 * The object is uploaded by hand, once, and not checked into the repo: it is
 * third-party artwork of unclear licence, and E5's "Catalog Sources" rule is
 * that catalog imagery comes from a licensed source or brand permission. Fine
 * in a dev bucket; it must never become a shipped catalog image.
 */
const DEMO_IMAGE = {
  key: 'demo/catalog/dairy-products.png',
  width: 512,
  height: 512,
} as const

type PackUnit = 'G' | 'KG' | 'ML' | 'L' | 'PIECE'

type DemoProduct = {
  /** The first 12 digits. The 13th is computed, never written by hand. */
  body: string
  nameEn: string
  nameAr: string
  brandEn?: string
  brandAr?: string
  specEn?: string
  specAr?: string
  originEn?: string
  originAr?: string
  /** Must equal a `catalog_categories.name` — `listCategories` joins on the name. */
  category: string
  subcategory: string
  packSize?: number
  packUnit?: PackUnit
  packCount?: number
  tags: string[]
}

/**
 * The GTIN check digit, computed rather than typed.
 *
 * Weights alternate 3 and 1 **from the right**, which is the same rule
 * `hasValidCheckDigit` applies in reverse. Ninety hand-computed check digits
 * would contain at least one mistake, and the failure is invisible: the row
 * writes fine and is simply unreachable by barcode lookup forever.
 */
function withCheckDigit(body: string): string {
  const sum = [...body]
    .map(Number)
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)

  return body + String((10 - (sum % 10)) % 10)
}

/**
 * Categories come from `src/catalog-categories.ts`, not from strings typed here.
 *
 * `listCategories` counts with `p.category = c.name`, so the string is the join
 * key: a typo does not fail, it produces a tile reading "nothing here yet" next
 * to products that plainly exist. One source, so the seed, this and the Open
 * Food Facts mapping cannot drift apart.
 */
const {
  GROCERY,
  BEVERAGES,
  SNACKS,
  DAIRY,
  BAKERY,
  CLEANING,
  PERSONAL_CARE,
  ELECTRONICS,
  FRESH_PRODUCE,
  FROZEN_FOODS,
} = CATEGORY

const INDIA = { originEn: 'India', originAr: 'الهند' }
const KSA = { originEn: 'Saudi Arabia', originAr: 'السعودية' }
const UAE = { originEn: 'United Arab Emirates', originAr: 'الإمارات' }
const EGYPT = { originEn: 'Egypt', originAr: 'مصر' }
const TURKEY = { originEn: 'Turkey', originAr: 'تركيا' }

/**
 * The universal collection — `organizationId` null, visible to every account.
 *
 * Roughly nine per category, which is enough for the tiles to carry believable
 * counts, for the derived subcategory list to have more than one entry behind
 * every category, and for a cursor page to actually page.
 */
const UNIVERSAL: DemoProduct[] = [
  // ── Grocery ────────────────────────────────────────────────────────────────
  { body: '628100000011', nameEn: 'Sella Basmati Rice', nameAr: 'أرز بسمتي سيلا', brandEn: 'Abu Kass', brandAr: 'أبو كاس', specEn: 'Aged 2 years', specAr: 'معتق سنتين', category: GROCERY, subcategory: 'Rice & Grains', packSize: 5, packUnit: 'KG', ...INDIA, tags: ['rice', 'أرز', 'basmati', 'بسمتي'] },
  { body: '628100000028', nameEn: 'Sunflower Oil', nameAr: 'زيت دوار الشمس', brandEn: 'Afia', brandAr: 'عافية', category: GROCERY, subcategory: 'Cooking Oil', packSize: 1.5, packUnit: 'L', ...KSA, tags: ['oil', 'زيت', 'cooking'] },
  { body: '628100000035', nameEn: 'Fine White Sugar', nameAr: 'سكر أبيض ناعم', brandEn: 'Al Osra', brandAr: 'الأسرة', category: GROCERY, subcategory: 'Sugar & Sweeteners', packSize: 2, packUnit: 'KG', ...KSA, tags: ['sugar', 'سكر'] },
  { body: '628100000042', nameEn: 'All Purpose Flour', nameAr: 'دقيق متعدد الاستعمالات', brandEn: 'Al Osra', brandAr: 'الأسرة', category: GROCERY, subcategory: 'Flour & Baking', packSize: 2, packUnit: 'KG', ...KSA, tags: ['flour', 'دقيق', 'baking'] },
  { body: '629100000019', nameEn: 'Penne Pasta', nameAr: 'معكرونة بيني', brandEn: 'Al Alali', brandAr: 'العلالي', specEn: 'Durum wheat', specAr: 'قمح صلب', category: GROCERY, subcategory: 'Pasta & Noodles', packSize: 500, packUnit: 'G', ...UAE, tags: ['pasta', 'معكرونة'] },
  { body: '629100000026', nameEn: 'Red Lentils', nameAr: 'عدس أحمر', brandEn: 'Goody', brandAr: 'جودي', category: GROCERY, subcategory: 'Pulses & Beans', packSize: 900, packUnit: 'G', ...TURKEY, tags: ['lentils', 'عدس', 'pulses'] },
  { body: '629100000033', nameEn: 'Pure Ceylon Tea', nameAr: 'شاي سيلاني نقي', brandEn: 'Rabea', brandAr: 'ربيع', specEn: '100 tea bags', specAr: '١٠٠ كيس شاي', category: GROCERY, subcategory: 'Tea & Coffee', packSize: 2, packUnit: 'G', packCount: 100, ...KSA, tags: ['tea', 'شاي', 'ceylon'] },
  { body: '629100000040', nameEn: 'Arabic Coffee Blend', nameAr: 'قهوة عربية مطحونة', brandEn: 'Al Ameed', brandAr: 'العميد', specEn: 'With cardamom', specAr: 'مع الهيل', category: GROCERY, subcategory: 'Tea & Coffee', packSize: 250, packUnit: 'G', ...KSA, tags: ['coffee', 'قهوة', 'cardamom', 'هيل'] },
  { body: '629100000057', nameEn: 'Mixed Spices Seven', nameAr: 'بهارات سبع مشكلة', brandEn: 'Bayara', brandAr: 'بيارة', category: GROCERY, subcategory: 'Spices & Seasoning', packSize: 200, packUnit: 'G', ...UAE, tags: ['spices', 'بهارات'] },

  // ── Beverages ──────────────────────────────────────────────────────────────
  { body: '628200000010', nameEn: 'Natural Drinking Water', nameAr: 'مياه شرب طبيعية', brandEn: 'Nova', brandAr: 'نوفا', specEn: 'Pack of 12', specAr: 'عبوة ١٢ حبة', category: BEVERAGES, subcategory: 'Water', packSize: 600, packUnit: 'ML', packCount: 12, ...KSA, tags: ['water', 'ماء', 'مياه'] },
  { body: '628200000027', nameEn: 'Orange Juice No Sugar Added', nameAr: 'عصير برتقال بدون سكر مضاف', brandEn: 'Almarai', brandAr: 'المراعي', category: BEVERAGES, subcategory: 'Juice', packSize: 1.5, packUnit: 'L', ...KSA, tags: ['juice', 'عصير', 'orange', 'برتقال'] },
  { body: '628200000034', nameEn: 'Mango Nectar', nameAr: 'رحيق المانجو', brandEn: 'Rani', brandAr: 'راني', specEn: 'With fruit pieces', specAr: 'مع قطع الفاكهة', category: BEVERAGES, subcategory: 'Juice', packSize: 240, packUnit: 'ML', packCount: 6, ...UAE, tags: ['juice', 'عصير', 'mango', 'مانجو'] },
  { body: '628200000041', nameEn: 'Cola Soft Drink', nameAr: 'مشروب غازي كولا', brandEn: 'Pepsi', brandAr: 'بيبسي', specEn: 'Cans, pack of 6', specAr: 'علب، عبوة ٦ حبات', category: BEVERAGES, subcategory: 'Soft Drinks', packSize: 355, packUnit: 'ML', packCount: 6, ...KSA, tags: ['cola', 'كولا', 'soda', 'غازي'] },
  { body: '629200000018', nameEn: 'Lemon Mint Sparkling Drink', nameAr: 'مشروب غازي ليمون بالنعناع', brandEn: 'Barbican', brandAr: 'بربيكان', category: BEVERAGES, subcategory: 'Soft Drinks', packSize: 330, packUnit: 'ML', ...UAE, tags: ['malt', 'ليمون', 'نعناع'] },
  { body: '629200000025', nameEn: 'Energy Drink', nameAr: 'مشروب الطاقة', brandEn: 'Code Red', brandAr: 'كود ريد', category: BEVERAGES, subcategory: 'Energy Drinks', packSize: 250, packUnit: 'ML', ...UAE, tags: ['energy', 'طاقة'] },
  { body: '629200000032', nameEn: 'Fresh Laban Up', nameAr: 'لبن طازج', brandEn: 'Almarai', brandAr: 'المراعي', category: BEVERAGES, subcategory: 'Laban & Yoghurt Drinks', packSize: 1, packUnit: 'L', ...KSA, tags: ['laban', 'لبن'] },
  { body: '629200000049', nameEn: 'Instant Milk Powder Drink', nameAr: 'مشروب حليب بودرة سريع الذوبان', brandEn: 'Nido', brandAr: 'نيدو', category: BEVERAGES, subcategory: 'Powdered Drinks', packSize: 900, packUnit: 'G', ...UAE, tags: ['milk', 'حليب', 'powder'] },
  { body: '629200000056', nameEn: 'Sparkling Water Lime', nameAr: 'مياه فوارة بالليمون', brandEn: 'Perrier', brandAr: 'بيرييه', category: BEVERAGES, subcategory: 'Water', packSize: 330, packUnit: 'ML', packCount: 4, ...UAE, tags: ['sparkling', 'فوارة', 'ماء'] },

  // ── Snacks ─────────────────────────────────────────────────────────────────
  { body: '628300000019', nameEn: 'Salted Potato Chips', nameAr: 'رقائق بطاطس بالملح', brandEn: 'Lays', brandAr: 'ليز', specEn: 'Sharing bag', specAr: 'كيس عائلي', category: SNACKS, subcategory: 'Chips & Crisps', packSize: 165, packUnit: 'G', ...KSA, tags: ['chips', 'شيبس', 'بطاطس'] },
  { body: '628300000026', nameEn: 'Cheese Puffs', nameAr: 'مقرمشات بنكهة الجبن', brandEn: 'Cheetos', brandAr: 'تشيتوس', category: SNACKS, subcategory: 'Chips & Crisps', packSize: 27, packUnit: 'G', packCount: 21, ...KSA, tags: ['snack', 'جبن', 'مقرمشات'] },
  { body: '628300000033', nameEn: 'Digestive Biscuits', nameAr: 'بسكويت دايجستف', brandEn: 'McVities', brandAr: 'مكفيتيز', category: SNACKS, subcategory: 'Biscuits & Cookies', packSize: 400, packUnit: 'G', ...UAE, tags: ['biscuit', 'بسكويت'] },
  { body: '628300000040', nameEn: 'Wafer Fingers Chocolate', nameAr: 'أصابع ويفر بالشوكولاتة', brandEn: 'Loacker', brandAr: 'لواكر', category: SNACKS, subcategory: 'Biscuits & Cookies', packSize: 45, packUnit: 'G', packCount: 8, ...TURKEY, tags: ['wafer', 'ويفر', 'شوكولاتة'] },
  { body: '629300000017', nameEn: 'Milk Chocolate Bar', nameAr: 'لوح شوكولاتة بالحليب', brandEn: 'Galaxy', brandAr: 'جالاكسي', category: SNACKS, subcategory: 'Chocolate', packSize: 90, packUnit: 'G', ...UAE, tags: ['chocolate', 'شوكولاتة'] },
  { body: '629300000024', nameEn: 'Mixed Salted Nuts', nameAr: 'مكسرات مشكلة مملحة', brandEn: 'Bayara', brandAr: 'بيارة', category: SNACKS, subcategory: 'Nuts & Dried Fruit', packSize: 300, packUnit: 'G', ...UAE, tags: ['nuts', 'مكسرات'] },
  { body: '629300000031', nameEn: 'Premium Khalas Dates', nameAr: 'تمر خلاص فاخر', brandEn: 'Al Foah', brandAr: 'الفوعة', category: SNACKS, subcategory: 'Dates', packSize: 500, packUnit: 'G', ...UAE, tags: ['dates', 'تمر', 'خلاص'] },
  { body: '629300000048', nameEn: 'Roasted Salted Pistachios', nameAr: 'فستق محمص مملح', brandEn: 'Bayara', brandAr: 'بيارة', category: SNACKS, subcategory: 'Nuts & Dried Fruit', packSize: 200, packUnit: 'G', ...TURKEY, tags: ['pistachio', 'فستق'] },
  { body: '629300000055', nameEn: 'Corn Tortilla Chips', nameAr: 'رقائق الذرة', brandEn: 'Doritos', brandAr: 'دوريتوس', specEn: 'Nacho cheese', specAr: 'ناتشو بالجبن', category: SNACKS, subcategory: 'Chips & Crisps', packSize: 180, packUnit: 'G', ...KSA, tags: ['chips', 'ذرة', 'ناتشو'] },

  // ── Dairy ──────────────────────────────────────────────────────────────────
  { body: '628400000018', nameEn: 'Full Fat Fresh Milk', nameAr: 'حليب طازج كامل الدسم', brandEn: 'Almarai', brandAr: 'المراعي', category: DAIRY, subcategory: 'Milk', packSize: 2, packUnit: 'L', ...KSA, tags: ['milk', 'حليب'] },
  { body: '628400000025', nameEn: 'Low Fat Fresh Milk', nameAr: 'حليب طازج قليل الدسم', brandEn: 'Nadec', brandAr: 'نادك', category: DAIRY, subcategory: 'Milk', packSize: 1, packUnit: 'L', ...KSA, tags: ['milk', 'حليب', 'قليل الدسم'] },
  { body: '628400000032', nameEn: 'Greek Yoghurt Plain', nameAr: 'زبادي يوناني سادة', brandEn: 'Activia', brandAr: 'أكتيفيا', category: DAIRY, subcategory: 'Yoghurt', packSize: 150, packUnit: 'G', packCount: 4, ...KSA, tags: ['yoghurt', 'زبادي'] },
  { body: '628400000049', nameEn: 'Processed Cheese Squares', nameAr: 'جبن مثلثات', brandEn: 'Puck', brandAr: 'بوك', specEn: '24 portions', specAr: '٢٤ قطعة', category: DAIRY, subcategory: 'Cheese', packSize: 432, packUnit: 'G', ...UAE, tags: ['cheese', 'جبن'] },
  { body: '629400000016', nameEn: 'Halloumi Cheese', nameAr: 'جبن حلومي', brandEn: 'Nabil', brandAr: 'نبيل', category: DAIRY, subcategory: 'Cheese', packSize: 250, packUnit: 'G', ...TURKEY, tags: ['cheese', 'حلومي', 'جبن'] },
  { body: '629400000023', nameEn: 'Unsalted Butter', nameAr: 'زبدة غير مملحة', brandEn: 'Lurpak', brandAr: 'لورباك', category: DAIRY, subcategory: 'Butter & Margarine', packSize: 200, packUnit: 'G', ...UAE, tags: ['butter', 'زبدة'] },
  { body: '629400000030', nameEn: 'Whipping Cream', nameAr: 'كريمة للخفق', brandEn: 'Puck', brandAr: 'بوك', category: DAIRY, subcategory: 'Cream', packSize: 500, packUnit: 'ML', ...UAE, tags: ['cream', 'كريمة'] },
  { body: '629400000047', nameEn: 'Labneh Spread', nameAr: 'لبنة قابلة للدهن', brandEn: 'Almarai', brandAr: 'المراعي', category: DAIRY, subcategory: 'Labneh', packSize: 500, packUnit: 'G', ...KSA, tags: ['labneh', 'لبنة'] },
  { body: '629400000054', nameEn: 'Fresh Eggs Large', nameAr: 'بيض طازج كبير الحجم', brandEn: 'Alwadi', brandAr: 'الوادي', specEn: 'Tray of 30', specAr: 'طبق ٣٠ بيضة', category: DAIRY, subcategory: 'Eggs', packSize: 30, packUnit: 'PIECE', ...KSA, tags: ['eggs', 'بيض'] },

  // ── Bakery ─────────────────────────────────────────────────────────────────
  { body: '628500000017', nameEn: 'Arabic Flat Bread', nameAr: 'خبز عربي', brandEn: 'Lusine', brandAr: 'لوزين', specEn: 'Large, 6 loaves', specAr: 'كبير، ٦ أرغفة', category: BAKERY, subcategory: 'Bread', packSize: 6, packUnit: 'PIECE', ...KSA, tags: ['bread', 'خبز', 'عربي'] },
  { body: '628500000024', nameEn: 'Wholemeal Toast Bread', nameAr: 'خبز توست أسمر', brandEn: 'Lusine', brandAr: 'لوزين', category: BAKERY, subcategory: 'Bread', packSize: 600, packUnit: 'G', ...KSA, tags: ['bread', 'خبز', 'توست'] },
  { body: '628500000031', nameEn: 'Butter Croissant', nameAr: 'كرواسون بالزبدة', brandEn: 'Sunbulah', brandAr: 'سنبلة', category: BAKERY, subcategory: 'Pastries', packSize: 60, packUnit: 'G', packCount: 4, ...KSA, tags: ['croissant', 'كرواسون'] },
  { body: '628500000048', nameEn: 'Chocolate Chip Muffins', nameAr: 'مافن برقائق الشوكولاتة', brandEn: 'Modern Bakery', brandAr: 'المخبز الحديث', category: BAKERY, subcategory: 'Cakes & Muffins', packSize: 55, packUnit: 'G', packCount: 6, ...UAE, tags: ['muffin', 'مافن', 'كيك'] },
  { body: '629500000015', nameEn: 'Plain Rusk Toast', nameAr: 'قرشلة سادة', brandEn: 'Nabil', brandAr: 'نبيل', category: BAKERY, subcategory: 'Rusk & Crackers', packSize: 275, packUnit: 'G', ...EGYPT, tags: ['rusk', 'قرشلة'] },
  { body: '629500000022', nameEn: 'Sesame Bread Rings', nameAr: 'كعك بالسمسم', brandEn: 'Modern Bakery', brandAr: 'المخبز الحديث', category: BAKERY, subcategory: 'Bread', packSize: 400, packUnit: 'G', ...EGYPT, tags: ['kaak', 'كعك', 'سمسم'] },
  { body: '629500000039', nameEn: 'Burger Buns Sesame', nameAr: 'خبز برجر بالسمسم', brandEn: 'Lusine', brandAr: 'لوزين', category: BAKERY, subcategory: 'Bread', packSize: 6, packUnit: 'PIECE', ...KSA, tags: ['buns', 'برجر', 'خبز'] },
  { body: '629500000046', nameEn: 'Date Maamoul Biscuits', nameAr: 'معمول بالتمر', brandEn: 'Ghraoui', brandAr: 'غراوي', category: BAKERY, subcategory: 'Pastries', packSize: 500, packUnit: 'G', ...TURKEY, tags: ['maamoul', 'معمول', 'تمر'] },
  { body: '629500000053', nameEn: 'Vanilla Sponge Cake', nameAr: 'كيكة إسفنجية بالفانيلا', brandEn: 'Sunbulah', brandAr: 'سنبلة', category: BAKERY, subcategory: 'Cakes & Muffins', packSize: 350, packUnit: 'G', ...KSA, tags: ['cake', 'كيك', 'فانيلا'] },

  // ── Cleaning ───────────────────────────────────────────────────────────────
  { body: '628600000016', nameEn: 'Automatic Washing Powder Lemon', nameAr: 'مسحوق غسيل أوتوماتيك بالليمون للغسالات', brandEn: 'Tide', brandAr: 'تايد', specEn: 'Front load', specAr: 'تحميل أمامي', category: CLEANING, subcategory: 'Laundry', packSize: 5, packUnit: 'KG', ...KSA, tags: ['detergent', 'مسحوق', 'غسيل'] },
  { body: '628600000023', nameEn: 'Fabric Softener Lavender', nameAr: 'منعم أقمشة باللافندر', brandEn: 'Comfort', brandAr: 'كمفورت', category: CLEANING, subcategory: 'Laundry', packSize: 3, packUnit: 'L', ...UAE, tags: ['softener', 'منعم', 'أقمشة'] },
  { body: '628600000030', nameEn: 'Dishwashing Liquid Lemon', nameAr: 'سائل غسيل الصحون بالليمون', brandEn: 'Fairy', brandAr: 'فيري', category: CLEANING, subcategory: 'Dishwashing', packSize: 1, packUnit: 'L', ...KSA, tags: ['dish', 'صحون', 'سائل'] },
  { body: '628600000047', nameEn: 'Thick Bleach Original', nameAr: 'مبيض مركز أصلي', brandEn: 'Clorox', brandAr: 'كلوروكس', category: CLEANING, subcategory: 'Bleach & Disinfectant', packSize: 3.78, packUnit: 'L', ...KSA, tags: ['bleach', 'مبيض'] },
  { body: '629600000014', nameEn: 'Multi Purpose Surface Cleaner', nameAr: 'منظف أسطح متعدد الاستعمالات', brandEn: 'Dettol', brandAr: 'ديتول', category: CLEANING, subcategory: 'Surface Cleaners', packSize: 1.8, packUnit: 'L', ...UAE, tags: ['cleaner', 'منظف', 'أسطح'] },
  { body: '629600000021', nameEn: 'Antibacterial Wipes', nameAr: 'مناديل مطهرة مضادة للبكتيريا', brandEn: 'Dettol', brandAr: 'ديتول', specEn: '80 wipes', specAr: '٨٠ منديل', category: CLEANING, subcategory: 'Wipes', packSize: 80, packUnit: 'PIECE', ...UAE, tags: ['wipes', 'مناديل', 'مطهر'] },
  { body: '629600000038', nameEn: 'Glass Cleaner Spray', nameAr: 'بخاخ منظف زجاج', brandEn: 'Windex', brandAr: 'ويندكس', category: CLEANING, subcategory: 'Surface Cleaners', packSize: 750, packUnit: 'ML', ...UAE, tags: ['glass', 'زجاج', 'منظف'] },
  { body: '629600000045', nameEn: 'Garbage Bags Large', nameAr: 'أكياس قمامة كبيرة', brandEn: 'Sanita', brandAr: 'سانيتا', specEn: '30 bags on roll', specAr: '٣٠ كيس في اللفة', category: CLEANING, subcategory: 'Bags & Foil', packSize: 30, packUnit: 'PIECE', ...UAE, tags: ['garbage', 'قمامة', 'أكياس'] },
  { body: '629600000052', nameEn: 'Aluminium Foil Roll', nameAr: 'ورق ألمنيوم', brandEn: 'Sanita', brandAr: 'سانيتا', category: CLEANING, subcategory: 'Bags & Foil', packSize: 30, packUnit: 'PIECE', ...UAE, tags: ['foil', 'ألمنيوم'] },

  // ── Personal Care ──────────────────────────────────────────────────────────
  { body: '628700000015', nameEn: 'Anti Dandruff Shampoo', nameAr: 'شامبو ضد القشرة', brandEn: 'Head & Shoulders', brandAr: 'هيد آند شولدرز', specEn: 'Menthol', specAr: 'بالمنثول', category: PERSONAL_CARE, subcategory: 'Hair Care', packSize: 600, packUnit: 'ML', ...KSA, tags: ['shampoo', 'شامبو', 'قشرة'] },
  { body: '628700000022', nameEn: 'Moisturising Body Wash', nameAr: 'غسول الجسم المرطب', brandEn: 'Dove', brandAr: 'دوف', category: PERSONAL_CARE, subcategory: 'Bath & Body', packSize: 500, packUnit: 'ML', ...UAE, tags: ['body wash', 'غسول', 'ترطيب'] },
  { body: '628700000039', nameEn: 'Beauty Soap Bar', nameAr: 'صابون تجميل', brandEn: 'Lux', brandAr: 'لوكس', specEn: 'Pack of 6', specAr: 'عبوة ٦ حبات', category: PERSONAL_CARE, subcategory: 'Bath & Body', packSize: 120, packUnit: 'G', packCount: 6, ...EGYPT, tags: ['soap', 'صابون'] },
  { body: '628700000046', nameEn: 'Cavity Protection Toothpaste', nameAr: 'معجون أسنان للوقاية من التسوس', brandEn: 'Signal', brandAr: 'سيجنال', category: PERSONAL_CARE, subcategory: 'Oral Care', packSize: 120, packUnit: 'ML', packCount: 2, ...KSA, tags: ['toothpaste', 'معجون', 'أسنان'] },
  { body: '629700000013', nameEn: 'Roll On Deodorant', nameAr: 'مزيل عرق كروي', brandEn: 'Rexona', brandAr: 'ريكسونا', category: PERSONAL_CARE, subcategory: 'Deodorant', packSize: 50, packUnit: 'ML', ...UAE, tags: ['deodorant', 'مزيل عرق'] },
  { body: '629700000020', nameEn: 'Facial Tissues Box', nameAr: 'مناديل ورقية', brandEn: 'Fine', brandAr: 'فاين', specEn: '150 sheets, 5 boxes', specAr: '١٥٠ منديل، ٥ علب', category: PERSONAL_CARE, subcategory: 'Paper & Tissues', packSize: 150, packUnit: 'PIECE', packCount: 5, ...UAE, tags: ['tissues', 'مناديل'] },
  { body: '629700000037', nameEn: 'Baby Diapers Size 4', nameAr: 'حفاضات أطفال مقاس ٤', brandEn: 'Pampers', brandAr: 'بامبرز', specEn: 'Mega pack, 68 pieces', specAr: 'عبوة كبيرة، ٦٨ حبة', category: PERSONAL_CARE, subcategory: 'Baby Care', packSize: 68, packUnit: 'PIECE', ...KSA, tags: ['diapers', 'حفاضات', 'أطفال'] },
  { body: '629700000044', nameEn: 'Hand Sanitiser Gel', nameAr: 'جل معقم لليدين', brandEn: 'Dettol', brandAr: 'ديتول', category: PERSONAL_CARE, subcategory: 'Bath & Body', packSize: 200, packUnit: 'ML', ...UAE, tags: ['sanitiser', 'معقم', 'يدين'] },
  { body: '629700000051', nameEn: 'Shaving Razor Triple Blade', nameAr: 'شفرة حلاقة ثلاثية', brandEn: 'Gillette', brandAr: 'جيليت', category: PERSONAL_CARE, subcategory: 'Shaving', packSize: 4, packUnit: 'PIECE', ...UAE, tags: ['razor', 'حلاقة', 'شفرة'] },

  // ── Electronics ────────────────────────────────────────────────────────────
  { body: '628800000014', nameEn: 'USB-C Fast Charging Cable', nameAr: 'كابل شحن سريع يو إس بي سي', brandEn: 'Anker', brandAr: 'أنكر', specEn: '1.8 m braided', specAr: '١٫٨ متر مجدول', category: ELECTRONICS, subcategory: 'Cables & Chargers', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['cable', 'كابل', 'شحن'] },
  { body: '628800000021', nameEn: 'Power Bank 20000 mAh', nameAr: 'بطارية متنقلة ٢٠٠٠٠ مللي أمبير', brandEn: 'Anker', brandAr: 'أنكر', category: ELECTRONICS, subcategory: 'Power Banks', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['power bank', 'بطارية', 'شحن'] },
  { body: '628800000038', nameEn: 'LED Bulb Warm White', nameAr: 'لمبة ليد أبيض دافئ', brandEn: 'Philips', brandAr: 'فيليبس', specEn: '9 W, E27', specAr: '٩ واط، E27', category: ELECTRONICS, subcategory: 'Lighting', packSize: 2, packUnit: 'PIECE', ...UAE, tags: ['bulb', 'لمبة', 'ليد'] },
  { body: '628800000045', nameEn: 'AA Alkaline Batteries', nameAr: 'بطاريات قلوية AA', brandEn: 'Duracell', brandAr: 'دوراسيل', specEn: 'Pack of 8', specAr: 'عبوة ٨ حبات', category: ELECTRONICS, subcategory: 'Batteries', packSize: 8, packUnit: 'PIECE', ...UAE, tags: ['battery', 'بطاريات'] },
  { body: '629800000012', nameEn: 'Wireless Earbuds', nameAr: 'سماعات لاسلكية', brandEn: 'JBL', brandAr: 'جي بي إل', category: ELECTRONICS, subcategory: 'Audio', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['earbuds', 'سماعات', 'لاسلكي'] },
  { body: '629800000029', nameEn: 'Bluetooth Speaker Portable', nameAr: 'مكبر صوت بلوتوث محمول', brandEn: 'JBL', brandAr: 'جي بي إل', category: ELECTRONICS, subcategory: 'Audio', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['speaker', 'مكبر صوت', 'بلوتوث'] },
  { body: '629800000036', nameEn: 'Wall Charger Dual Port', nameAr: 'شاحن جداري بمنفذين', brandEn: 'Samsung', brandAr: 'سامسونج', specEn: '35 W', specAr: '٣٥ واط', category: ELECTRONICS, subcategory: 'Cables & Chargers', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['charger', 'شاحن'] },
  { body: '629800000043', nameEn: 'HDMI Cable 2 m', nameAr: 'كابل إتش دي إم آي ٢ متر', brandEn: 'Belkin', brandAr: 'بيلكن', category: ELECTRONICS, subcategory: 'Cables & Chargers', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['hdmi', 'كابل'] },
  { body: '629800000050', nameEn: 'Memory Card 128 GB', nameAr: 'بطاقة ذاكرة ١٢٨ جيجابايت', brandEn: 'SanDisk', brandAr: 'سانديسك', category: ELECTRONICS, subcategory: 'Storage', packSize: 1, packUnit: 'PIECE', ...UAE, tags: ['memory', 'ذاكرة', 'بطاقة'] },

  // ── Fresh Produce ──────────────────────────────────────────────────────────
  { body: '628900000013', nameEn: 'Fresh Tomatoes', nameAr: 'طماطم طازجة', specEn: 'Loose, per kilo', specAr: 'سائب، للكيلو', category: FRESH_PRODUCE, subcategory: 'Vegetables', packSize: 1, packUnit: 'KG', ...KSA, tags: ['tomato', 'طماطم', 'خضار'] },
  { body: '628900000020', nameEn: 'Cucumber', nameAr: 'خيار', category: FRESH_PRODUCE, subcategory: 'Vegetables', packSize: 1, packUnit: 'KG', ...KSA, tags: ['cucumber', 'خيار', 'خضار'] },
  { body: '628900000037', nameEn: 'Yellow Onion', nameAr: 'بصل أصفر', category: FRESH_PRODUCE, subcategory: 'Vegetables', packSize: 2, packUnit: 'KG', ...EGYPT, tags: ['onion', 'بصل'] },
  { body: '628900000044', nameEn: 'Potatoes', nameAr: 'بطاطس', category: FRESH_PRODUCE, subcategory: 'Vegetables', packSize: 2, packUnit: 'KG', ...EGYPT, tags: ['potato', 'بطاطس'] },
  { body: '629900000011', nameEn: 'Cavendish Bananas', nameAr: 'موز كافنديش', category: FRESH_PRODUCE, subcategory: 'Fruit', packSize: 1, packUnit: 'KG', ...INDIA, tags: ['banana', 'موز', 'فواكه'] },
  { body: '629900000028', nameEn: 'Royal Gala Apples', nameAr: 'تفاح رويال جالا', category: FRESH_PRODUCE, subcategory: 'Fruit', packSize: 1, packUnit: 'KG', ...TURKEY, tags: ['apple', 'تفاح', 'فواكه'] },
  { body: '629900000035', nameEn: 'Valencia Oranges', nameAr: 'برتقال فالنسيا', category: FRESH_PRODUCE, subcategory: 'Fruit', packSize: 3, packUnit: 'KG', ...EGYPT, tags: ['orange', 'برتقال'] },
  { body: '629900000042', nameEn: 'Fresh Mint Bunch', nameAr: 'نعناع طازج', category: FRESH_PRODUCE, subcategory: 'Herbs', packSize: 1, packUnit: 'PIECE', ...KSA, tags: ['mint', 'نعناع', 'أعشاب'] },
  { body: '629900000059', nameEn: 'Iceberg Lettuce', nameAr: 'خس أيسبرغ', category: FRESH_PRODUCE, subcategory: 'Vegetables', packSize: 1, packUnit: 'PIECE', ...KSA, tags: ['lettuce', 'خس'] },

  // ── Frozen Foods ───────────────────────────────────────────────────────────
  { body: '622100000018', nameEn: 'Frozen French Fries', nameAr: 'بطاطس مقلية مجمدة', brandEn: 'McCain', brandAr: 'مكين', specEn: 'Straight cut', specAr: 'قطع مستقيمة', category: FROZEN_FOODS, subcategory: 'Frozen Potatoes', packSize: 1.5, packUnit: 'KG', ...UAE, tags: ['fries', 'بطاطس', 'مجمد'] },
  { body: '622100000025', nameEn: 'Frozen Green Peas', nameAr: 'بازلاء خضراء مجمدة', brandEn: 'Sunbulah', brandAr: 'سنبلة', category: FROZEN_FOODS, subcategory: 'Frozen Vegetables', packSize: 900, packUnit: 'G', ...KSA, tags: ['peas', 'بازلاء', 'مجمد'] },
  { body: '622100000032', nameEn: 'Frozen Mixed Vegetables', nameAr: 'خضار مشكلة مجمدة', brandEn: 'Sunbulah', brandAr: 'سنبلة', category: FROZEN_FOODS, subcategory: 'Frozen Vegetables', packSize: 900, packUnit: 'G', ...KSA, tags: ['vegetables', 'خضار', 'مجمد'] },
  { body: '622100000049', nameEn: 'Vegetable Samosa', nameAr: 'سمبوسة بالخضار', brandEn: 'Sunbulah', brandAr: 'سنبلة', specEn: '20 pieces', specAr: '٢٠ قطعة', category: FROZEN_FOODS, subcategory: 'Frozen Snacks', packSize: 20, packUnit: 'PIECE', ...KSA, tags: ['samosa', 'سمبوسة'] },
  { body: '622200000017', nameEn: 'Breaded Chicken Nuggets', nameAr: 'قطع دجاج مقرمشة', brandEn: 'Americana', brandAr: 'أمريكانا', category: FROZEN_FOODS, subcategory: 'Frozen Poultry', packSize: 750, packUnit: 'G', ...EGYPT, tags: ['chicken', 'دجاج', 'مجمد'] },
  { body: '622200000024', nameEn: 'Beef Burger Patties', nameAr: 'برجر لحم بقري', brandEn: 'Americana', brandAr: 'أمريكانا', specEn: '10 patties', specAr: '١٠ أقراص', category: FROZEN_FOODS, subcategory: 'Frozen Meat', packSize: 100, packUnit: 'G', packCount: 10, ...EGYPT, tags: ['burger', 'برجر', 'لحم'] },
  { body: '622200000031', nameEn: 'Vanilla Ice Cream Tub', nameAr: 'آيس كريم فانيلا', brandEn: 'Baskin Robbins', brandAr: 'باسكن روبنز', category: FROZEN_FOODS, subcategory: 'Ice Cream', packSize: 1, packUnit: 'L', ...UAE, tags: ['ice cream', 'آيس كريم', 'فانيلا'] },
  { body: '622200000048', nameEn: 'Frozen Puff Pastry Sheets', nameAr: 'عجينة باف بيستري مجمدة', brandEn: 'Sunbulah', brandAr: 'سنبلة', category: FROZEN_FOODS, subcategory: 'Frozen Dough', packSize: 400, packUnit: 'G', ...KSA, tags: ['pastry', 'عجينة', 'مجمد'] },
  { body: '622200000055', nameEn: 'Frozen Shrimp Peeled', nameAr: 'روبيان مقشر مجمد', brandEn: 'Siblou', brandAr: 'سيبلو', category: FROZEN_FOODS, subcategory: 'Frozen Seafood', packSize: 400, packUnit: 'G', ...INDIA, tags: ['shrimp', 'روبيان', 'مجمد'] },
]

/**
 * The organization's own collection — `organizationId` set.
 *
 * **The first three carry a barcode the universal set also carries**, which is
 * the point of them. E5 §1 says a private row *shadows* the universal one rather
 * than outranking it, so a search for "basmati" from this organization must
 * return the shop's own row and **not** both; two rows for one barcode is the
 * bug, and it is invisible without exactly this data.
 *
 * The rest are shop-only lines with no universal equivalent — a bakery counter
 * and a butchery, the things a shop adds through E5-04 that no public catalog
 * would ever carry.
 */
const ORG_OWNED: DemoProduct[] = [
  // Shadows 628100000011 — corrected name and pack, as an owner would fix it.
  { body: '628100000011', nameEn: 'Sella Basmati Rice XXL', nameAr: 'أرز بسمتي سيلا حبة طويلة', brandEn: 'Abu Kass', brandAr: 'أبو كاس', specEn: 'Aged 2 years, extra long grain', specAr: 'معتق سنتين، حبة طويلة جداً', category: GROCERY, subcategory: 'Rice & Grains', packSize: 5, packUnit: 'KG', ...INDIA, tags: ['rice', 'أرز', 'basmati', 'بسمتي'] },
  // Shadows 628400000018.
  { body: '628400000018', nameEn: 'Fresh Milk Full Fat 2L', nameAr: 'حليب طازج كامل الدسم ٢ لتر', brandEn: 'Almarai', brandAr: 'المراعي', specEn: 'Chilled, daily delivery', specAr: 'مبرد، توصيل يومي', category: DAIRY, subcategory: 'Milk', packSize: 2, packUnit: 'L', ...KSA, tags: ['milk', 'حليب'] },
  // Shadows 628600000016.
  { body: '628600000016', nameEn: 'Automatic Washing Powder Lemon 5kg', nameAr: 'مسحوق غسيل أوتوماتيك بالليمون ٥ كجم', brandEn: 'Tide', brandAr: 'تايد', category: CLEANING, subcategory: 'Laundry', packSize: 5, packUnit: 'KG', ...KSA, tags: ['detergent', 'مسحوق', 'غسيل', 'تايد'] },

  // Shop-only lines.
  { body: '200000000015', nameEn: 'In-Store Bakery Croissant', nameAr: 'كرواسون مخبوز في المتجر', specEn: 'Baked fresh daily', specAr: 'يخبز طازجاً يومياً', category: BAKERY, subcategory: 'In-Store Bakery', packSize: 1, packUnit: 'PIECE', tags: ['bakery', 'مخبز', 'كرواسون'] },
  { body: '200000000022', nameEn: 'In-Store Arabic Sweets Box', nameAr: 'علبة حلويات عربية', specEn: 'Assorted, 1 kg box', specAr: 'تشكيلة، علبة كيلو', category: BAKERY, subcategory: 'In-Store Bakery', packSize: 1, packUnit: 'KG', tags: ['sweets', 'حلويات'] },
  { body: '200000000039', nameEn: 'Fresh Lamb Cuts', nameAr: 'لحم غنم طازج', specEn: 'Butchery counter, per kilo', specAr: 'قسم اللحوم، للكيلو', category: FRESH_PRODUCE, subcategory: 'Butchery', packSize: 1, packUnit: 'KG', tags: ['lamb', 'لحم', 'غنم'] },
  { body: '200000000046', nameEn: 'Fresh Chicken Whole', nameAr: 'دجاج كامل طازج', specEn: 'Butchery counter', specAr: 'قسم اللحوم', category: FRESH_PRODUCE, subcategory: 'Butchery', packSize: 1.2, packUnit: 'KG', tags: ['chicken', 'دجاج'] },
  { body: '200000000053', nameEn: 'Store Brand Bottled Water', nameAr: 'مياه معبأة العلامة الخاصة', specEn: 'Pack of 24', specAr: 'عبوة ٢٤ حبة', category: BEVERAGES, subcategory: 'Water', packSize: 330, packUnit: 'ML', packCount: 24, tags: ['water', 'ماء', 'مياه'] },
  { body: '200000000060', nameEn: 'Store Brand Long Life Milk', nameAr: 'حليب طويل الأمد العلامة الخاصة', category: DAIRY, subcategory: 'Milk', packSize: 1, packUnit: 'L', packCount: 4, tags: ['milk', 'حليب'] },
]

type Options = {
  organizationId: string | null
  clear: boolean
  dryRun: boolean
  images: boolean
}

function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | null => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  return {
    organizationId: value('--org'),
    clear: argv.includes('--clear'),
    dryRun: argv.includes('--dry-run'),
    images: argv.includes('--images'),
  }
}

/**
 * Give every demo product the placeholder image.
 *
 * Written as **ORIGINAL**, not CUTOUT. `IMAGE_PICK` prefers an approved CUTOUT
 * and falls back to whatever else is there, so an ORIGINAL is enough to make the
 * card draw — and calling it a CUTOUT would make the `bg` worker's matte path
 * and E5-05's review queue look exercised when neither has run. `bboxTight` and
 * `quality` stay null for the same reason: they are measurements, and there is
 * nothing here that measured them.
 *
 * `reviewState` is APPROVED so the row never surfaces in a review queue that has
 * nothing to review.
 *
 * Idempotent by (product, key): a re-run adds nothing, so the flag can be passed
 * every time.
 */
async function attachImages(): Promise<{ added: number; already: number }> {
  const products = await prisma.catalogProduct.findMany({
    where: { source: DEMO_SOURCE },
    select: { id: true, images: { where: { r2Key: DEMO_IMAGE.key }, select: { id: true } } },
  })

  const missing = products.filter((product) => product.images.length === 0)
  if (missing.length > 0) {
    await prisma.imageAsset.createMany({
      data: missing.map((product) => ({
        productId: product.id,
        kind: 'ORIGINAL' as const,
        r2Key: DEMO_IMAGE.key,
        width: DEMO_IMAGE.width,
        height: DEMO_IMAGE.height,
        reviewState: 'APPROVED' as const,
      })),
    })
  }

  return { added: missing.length, already: products.length - missing.length }
}

/**
 * Which organization gets the private rows, when `--org` is not given.
 *
 * The newest one, because on a dev database that is the account someone most
 * recently signed up with and therefore the one they are logged into. Wrong
 * guess costs nothing — the rows are removable and `--org` overrides — but it
 * saves looking an id up for the common case.
 */
async function resolveOrganization(explicit: string | null): Promise<string> {
  if (explicit) {
    const found = await prisma.organization.findUnique({
      where: { id: explicit },
      select: { id: true, name: true },
    })
    if (!found) throw new Error(`[demo] no organization ${explicit}`)
    console.log(`[demo] organization ${found.name} (${found.id})`)
    return found.id
  }

  const newest = await prisma.organization.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true },
  })
  if (!newest) throw new Error('[demo] no organizations exist — sign up first')

  console.log(`[demo] organization ${newest.name} (${newest.id}) — newest, override with --org`)
  return newest.id
}

/**
 * Every barcode, checked before a single row is written.
 *
 * Against the shipped validator rather than against the generator above, so
 * this catches a body of the wrong length or a stray non-digit as well as a
 * miscomputed digit — the generator is not the thing being trusted.
 */
function buildBarcodes(products: DemoProduct[]): Map<string, string> {
  const barcodes = new Map<string, string>()

  for (const product of products) {
    if (!/^\d{12}$/.test(product.body)) {
      throw new Error(`[demo] ${product.nameEn}: body is not 12 digits (${product.body})`)
    }

    const barcode = withCheckDigit(product.body)
    if (!hasValidCheckDigit(barcode)) {
      throw new Error(`[demo] ${product.nameEn}: computed a barcode that fails validation`)
    }
    barcodes.set(product.body, barcode)
  }

  return barcodes
}

/**
 * Upserted, and **the universal collection cannot use the compound unique key.**
 *
 * `where: { organizationId_barcode: { organizationId: null, ... } }` is rejected
 * by the client at runtime — "Argument `organizationId` must not be null" —
 * because SQL treats NULLs as distinct, so `(NULL, '628…')` is not a key that
 * can identify a row. That is the same fact the schema comment on `barcode`
 * describes, and it is why the migration carries a *partial* unique index
 * (`catalog_products_universal_barcode_key`, on `barcode` where
 * `organizationId IS NULL`) alongside the compound one.
 *
 * So there are two write paths, not one:
 *
 * - **Organization rows** have a non-null `organizationId` and upsert on the
 *   compound key normally.
 * - **Universal rows** are matched by barcode in a single read, then updated by
 *   id or created. Not `upsert`, because there is no Prisma key expression that
 *   reaches the partial index.
 *
 * `createMany` is used for the new rows because they are known not to exist by
 * the time it runs; the corrections a re-run applies go through `update`, so
 * nothing is silently skipped.
 */
async function write(
  products: DemoProduct[],
  organizationId: string | null,
  barcodes: Map<string, string>
): Promise<number> {
  const rows = products.map((product) => {
    const barcode = barcodes.get(product.body)
    if (!barcode) throw new Error(`[demo] ${product.nameEn}: no barcode built`)

    return {
      barcode,
      nameEn: product.nameEn,
      nameAr: product.nameAr,
      brandEn: product.brandEn ?? null,
      brandAr: product.brandAr ?? null,
      specEn: product.specEn ?? null,
      specAr: product.specAr ?? null,
      originEn: product.originEn ?? null,
      originAr: product.originAr ?? null,
      category: product.category,
      subcategory: product.subcategory,
      packSize: product.packSize ?? null,
      packUnit: product.packUnit ?? null,
      packCount: product.packCount ?? null,
      tags: product.tags,
    }
  })

  if (organizationId !== null) {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.catalogProduct.upsert({
          where: { organizationId_barcode: { organizationId, barcode: row.barcode } },
          update: row,
          create: { ...row, organizationId, source: DEMO_SOURCE },
        })
      )
    )

    return rows.length
  }

  const existing = await prisma.catalogProduct.findMany({
    where: { organizationId: null, barcode: { in: rows.map((row) => row.barcode) } },
    select: { id: true, barcode: true },
  })
  const idByBarcode = new Map(existing.map((row) => [row.barcode, row.id]))

  await prisma.$transaction([
    ...rows
      .filter((row) => idByBarcode.has(row.barcode))
      .map((row) =>
        prisma.catalogProduct.update({
          where: { id: idByBarcode.get(row.barcode) },
          data: row,
        })
      ),
    prisma.catalogProduct.createMany({
      data: rows
        .filter((row) => !idByBarcode.has(row.barcode))
        .map((row) => ({ ...row, organizationId: null, source: DEMO_SOURCE })),
    }),
  ])

  return rows.length
}

/**
 * Remove exactly what this script wrote.
 *
 * `source = 'demo'` and nothing else. Not a name pattern, not a date window, and
 * not a truncate — the Open Food Facts rows and anything an owner added through
 * E5-04 sit in the same table, and a broad delete here is unrecoverable on a
 * shared dev database.
 *
 * Products are archived rather than deleted everywhere else in the product,
 * because a published offer book references them. That rule does not apply to a
 * row that exists to be thrown away, and leaving archived demo rows behind would
 * mean `--clear` never actually clears. If a demo row is referenced by an offer
 * this refuses rather than cascading.
 */
async function clear(): Promise<number> {
  const doomed = await prisma.catalogProduct.findMany({
    where: { source: DEMO_SOURCE },
    select: { id: true },
  })
  if (doomed.length === 0) return 0

  const ids = doomed.map((row) => row.id)
  const referenced = await prisma.offerItem.count({ where: { catalogProductId: { in: ids } } })
  if (referenced > 0) {
    throw new Error(
      `[demo] ${referenced} offer items reference demo products — refusing to delete. ` +
        `Remove those offers first.`
    )
  }

  // Images and synonyms belong to the product and go with it. Import rows and
  // contributions do not — they are the owner's own history of a spreadsheet
  // they uploaded or a photo they sent, and that history should survive the demo
  // rows it happened to match. Both foreign keys are nullable for exactly this
  // reason, so they are detached rather than deleted.
  await prisma.$transaction([
    prisma.imageAsset.deleteMany({ where: { productId: { in: ids } } }),
    prisma.productSynonym.deleteMany({ where: { catalogId: { in: ids } } }),
    prisma.catalogImportRow.updateMany({
      where: { catalogProductId: { in: ids } },
      data: { catalogProductId: null },
    }),
    prisma.productContribution.updateMany({
      where: { catalogId: { in: ids } },
      data: { catalogId: null },
    }),
    prisma.catalogProduct.deleteMany({ where: { id: { in: ids } } }),
  ])

  return ids.length
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.clear) {
    const removed = await clear()
    console.log(`[demo] removed ${removed} demo products`)
    return
  }

  const organizationId = await resolveOrganization(options.organizationId)
  const barcodes = buildBarcodes([...UNIVERSAL, ...ORG_OWNED])
  console.log(`[demo] ${barcodes.size} barcodes built, all check digits valid`)

  if (options.dryRun) {
    console.log(
      `[demo] dry run — would write ${UNIVERSAL.length} universal and ${ORG_OWNED.length} organization rows`
    )
    return
  }

  const universal = await write(UNIVERSAL, null, barcodes)
  console.log(`[demo] ${universal} universal products`)

  const universalBodies = new Set(UNIVERSAL.map((product) => product.body))
  const shadows = ORG_OWNED.filter((product) => universalBodies.has(product.body)).length

  const owned = await write(ORG_OWNED, organizationId, barcodes)
  console.log(`[demo] ${owned} organization products, ${shadows} of them shadowing a universal barcode`)

  if (options.images) {
    const { added, already } = await attachImages()
    console.log(
      `[demo] images: ${added} attached, ${already} already had one — ${DEMO_IMAGE.key}`
    )
  }

  console.log(`[demo] done — remove with: pnpm --filter @souqstudio/db catalog:seed-demo --clear`)
}

main()
  .catch((error) => {
    console.error('[demo] failed:', error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
