/**
 * The brands a UAE shelf actually carries, bilingual, seeded as canonical.
 *
 * E5's "Catalog Sources" budgets for the **top 200 UAE brands under direct
 * permission**. This is the names half of that, which is the half that can be
 * seeded: a brand name is factual data, the same basis on which product names,
 * barcodes and categories are taken from public sources.
 *
 * **No logos, and that is a licence position rather than a gap in the data.**
 * E5: *"Images come from licensed sources or direct brand permission only."* A
 * logo is both an image and a trademark, so `logoKey` stays null until a
 * permissioned asset exists and the card falls back to the brand name — which
 * is what it renders today. `logoSource` on the row is there so that when logos
 * do arrive, where each came from is recorded rather than assumed.
 *
 * **Seeded `canonical`, unlike everything ingest creates.** These are curated:
 * the Arabic is written, the spelling is the one the brand uses. A brand the
 * Open Food Facts import invents, or one a shop owner types, arrives
 * `unreviewed` and an admin promotes it. Review decides promotion, not
 * availability — the same rule `product_contributions` follows for products.
 *
 * **The slug is computed, never written here.** `brandSlug()` owns it, so this
 * list cannot disagree with what the importer and the add-a-product route
 * resolve against. Two rows for one brand is the failure the table exists to
 * prevent, and a hand-typed slug is how it would happen.
 */
export const SEED_BRANDS: Array<{ nameEn: string; nameAr: string }> = [
  // Dairy and chilled
  { nameEn: 'Almarai', nameAr: 'المراعي' },
  { nameEn: 'Al Ain', nameAr: 'العين' },
  { nameEn: 'Nadec', nameAr: 'نادك' },
  { nameEn: 'Puck', nameAr: 'بوك' },
  { nameEn: 'Lurpak', nameAr: 'لورباك' },
  { nameEn: 'Kraft', nameAr: 'كرافت' },
  { nameEn: 'Activia', nameAr: 'أكتيفيا' },
  { nameEn: 'Anchor', nameAr: 'أنكور' },
  { nameEn: 'Emborg', nameAr: 'إمبورج' },
  { nameEn: 'KDD', nameAr: 'كي دي دي' },

  // Beverages
  { nameEn: 'Masafi', nameAr: 'مسافي' },
  { nameEn: 'Mai Dubai', nameAr: 'مي دبي' },
  { nameEn: 'Rani', nameAr: 'راني' },
  { nameEn: 'Barbican', nameAr: 'بربيكان' },
  { nameEn: 'Vimto', nameAr: 'فيمتو' },
  { nameEn: 'Pepsi', nameAr: 'بيبسي' },
  { nameEn: 'Coca-Cola', nameAr: 'كوكا كولا' },
  { nameEn: 'Lipton', nameAr: 'ليبتون' },
  { nameEn: 'Nescafé', nameAr: 'نسكافيه' },
  { nameEn: 'Sunquick', nameAr: 'صن كويك' },
  { nameEn: 'Milo', nameAr: 'مايلو' },
  { nameEn: 'Nido', nameAr: 'نيدو' },

  // Grocery and pantry
  { nameEn: 'Al Alali', nameAr: 'العلالي' },
  { nameEn: 'Goody', nameAr: 'جودي' },
  { nameEn: 'Bayara', nameAr: 'بيارة' },
  { nameEn: 'Afia', nameAr: 'عافية' },
  { nameEn: 'Al Osra', nameAr: 'الأسرة' },
  { nameEn: 'Rabea', nameAr: 'ربيع' },
  { nameEn: 'Al Ameed', nameAr: 'العميد' },
  { nameEn: 'Abu Kass', nameAr: 'أبو كاس' },
  { nameEn: 'Tilda', nameAr: 'تيلدا' },
  { nameEn: 'American Garden', nameAr: 'أمريكان جاردن' },
  { nameEn: 'California Garden', nameAr: 'كاليفورنيا جاردن' },
  { nameEn: 'Del Monte', nameAr: 'ديل مونتي' },
  { nameEn: 'Heinz', nameAr: 'هاينز' },
  { nameEn: 'Maggi', nameAr: 'ماجي' },
  { nameEn: 'Knorr', nameAr: 'كنور' },
  { nameEn: 'Indomie', nameAr: 'إندومي' },
  { nameEn: 'Quaker', nameAr: 'كويكر' },
  { nameEn: "Kellogg's", nameAr: 'كيلوجز' },
  { nameEn: 'Nestlé', nameAr: 'نستله' },
  { nameEn: 'Americana', nameAr: 'أمريكانا' },
  { nameEn: 'Sunbulah', nameAr: 'سنبلة' },
  { nameEn: 'Halwani', nameAr: 'حلواني' },
  { nameEn: 'Nabil', nameAr: 'نبيل' },
  { nameEn: 'Siniora', nameAr: 'سنيورة' },
  { nameEn: 'Freshly', nameAr: 'فريشلي' },

  // Snacks and confectionery
  { nameEn: 'Galaxy', nameAr: 'جالاكسي' },
  { nameEn: 'KitKat', nameAr: 'كت كات' },
  { nameEn: 'Oreo', nameAr: 'أوريو' },
  { nameEn: "Lay's", nameAr: 'ليز' },
  { nameEn: 'Pringles', nameAr: 'برينجلز' },
  { nameEn: 'Doritos', nameAr: 'دوريتوس' },
  { nameEn: 'Cheetos', nameAr: 'تشيتوس' },
  { nameEn: 'Loacker', nameAr: 'لواكر' },
  { nameEn: "McVitie's", nameAr: 'مكفيتيز' },
  { nameEn: 'Tiffany', nameAr: 'تيفاني' },
  { nameEn: 'Al Foah', nameAr: 'الفوعة' },
  { nameEn: 'Bateel', nameAr: 'بتيل' },

  // Bakery
  { nameEn: 'Lusine', nameAr: 'لوزين' },
  { nameEn: 'Modern Bakery', nameAr: 'المخبز الحديث' },

  // Cleaning and household
  { nameEn: 'Tide', nameAr: 'تايد' },
  { nameEn: 'Ariel', nameAr: 'أريال' },
  { nameEn: 'Persil', nameAr: 'برسيل' },
  { nameEn: 'Clorox', nameAr: 'كلوروكس' },
  { nameEn: 'Dettol', nameAr: 'ديتول' },
  { nameEn: 'Fairy', nameAr: 'فيري' },
  { nameEn: 'Comfort', nameAr: 'كمفورت' },
  { nameEn: 'Sanita', nameAr: 'سانيتا' },
  { nameEn: 'Harpic', nameAr: 'هاربيك' },

  // Personal care
  { nameEn: 'Dove', nameAr: 'دوف' },
  { nameEn: 'Lux', nameAr: 'لوكس' },
  { nameEn: 'Head & Shoulders', nameAr: 'هيد آند شولدرز' },
  { nameEn: 'Pantene', nameAr: 'بانتين' },
  { nameEn: 'Signal', nameAr: 'سيجنال' },
  { nameEn: 'Colgate', nameAr: 'كولجيت' },
  { nameEn: 'Sensodyne', nameAr: 'سنسوداين' },
  { nameEn: 'Rexona', nameAr: 'ريكسونا' },
  { nameEn: 'Nivea', nameAr: 'نيفيا' },
  { nameEn: 'Gillette', nameAr: 'جيليت' },
  { nameEn: 'Pampers', nameAr: 'بامبرز' },
  { nameEn: 'Fine', nameAr: 'فاين' },
  { nameEn: "Johnson's", nameAr: 'جونسون' },

  // Electronics
  { nameEn: 'Samsung', nameAr: 'سامسونج' },
  { nameEn: 'LG', nameAr: 'إل جي' },
  { nameEn: 'Sony', nameAr: 'سوني' },
  { nameEn: 'Anker', nameAr: 'أنكر' },
  { nameEn: 'JBL', nameAr: 'جي بي إل' },
  { nameEn: 'Philips', nameAr: 'فيليبس' },
  { nameEn: 'Duracell', nameAr: 'دوراسيل' },
  { nameEn: 'SanDisk', nameAr: 'سانديسك' },
  { nameEn: 'Belkin', nameAr: 'بيلكن' },
]
