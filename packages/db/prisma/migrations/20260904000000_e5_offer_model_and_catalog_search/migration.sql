-- E5 Product catalog (Delta v2) and the offer model E6 composes from.
--
-- Four departures from what `prisma migrate diff` generated, all deliberate:
--
--   1. `catalog_products.nameEn` is added NULLABLE, backfilled from
--      `canonicalName`, then set NOT NULL — and `canonicalName` is dropped
--      after, not in the same statement. Prisma generates a bare
--      `ADD COLUMN "nameEn" TEXT NOT NULL` alongside the drop, which aborts on
--      any database holding catalog rows. This one is empty today because
--      nothing has ever seeded it, but the migration also has to apply cleanly
--      to a database that was pushed to later. Same reasoning as the backfills
--      in the E2 and E3 migrations.
--
--   2. `offer_book_products` is DROPPED rather than migrated into `offers` +
--      `offer_items`. The delta's §8 backfill (one item row per existing
--      offer, position 0) is not written because the table is empty and the
--      editor that would have filled it does not exist. If this migration ever
--      meets a database with rows in it, write the backfill first — the shape
--      is one `offers` row per `offer_book_products` row and one `offer_items`
--      row under it.
--
--   3. Raw SQL Prisma cannot express is appended at the bottom: the partial
--      unique index on universal barcodes, the tsvector column with its GIN
--      index and trigger, and `pg_trgm`. The tsvector work was tracked as a
--      separate blocker on E5; it lands here because the bilingual columns
--      change what the vector is built from, and writing it twice would mean
--      writing it wrong once.
--
--   4. Two promo tiers are seeded per existing organization. `offers.promoTierId`
--      is NOT NULL, so an organization with no tier cannot hold an offer at all.
--      Organization *creation* must seed the same two rows — that is application
--      code, in the signup path, and it is not written yet. See docs/E5 §9.
--
-- This is also the first migration to introduce Postgres enums. Nothing above
-- it uses one; the rest of the schema spells closed sets as `String // a | b`.
-- The departure is scoped to the offer model on purpose — the layout engine
-- branches on every one of these values, and a bad string reaching it renders a
-- card wrong on a printed page rather than throwing. Do not convert the older
-- columns to match. See the comment above `enum PackUnit` in schema.prisma.
--
-- The columns are camelCase and quoted, because no Prisma field in this schema
-- carries an @map. Only the tables are snake_case, via @@map.

-- CreateEnum
CREATE TYPE "PackUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'PIECE');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('ORIGINAL', 'CUTOUT', 'THUMB');

-- CreateEnum
CREATE TYPE "ReviewState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'MATCHING', 'REVIEW', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'CREATED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('FIXED', 'FROM', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "UnitPriceMode" AS ENUM ('AUTO', 'MANUAL', 'HIDDEN');

-- CreateEnum
CREATE TYPE "Connector" AS ENUM ('OR', 'AND');

-- CreateEnum
CREATE TYPE "ChipKind" AS ENUM ('COUNTER', 'ORIGIN', 'CERT', 'SCALE', 'LOYALTY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ChipAnchor" AS ENUM ('TOP_START', 'TOP_END', 'INLINE');

-- CreateEnum
CREATE TYPE "FootnoteScope" AS ENUM ('PAGE', 'BOOK');

-- DropForeignKey
ALTER TABLE "offer_book_products" DROP CONSTRAINT "offer_book_products_offerBookId_fkey";

-- DropIndex
DROP INDEX "catalog_products_barcode_key";

-- ─── catalog_products: bilingual columns and the two collections (§1, §2) ─────
-- Departure 1. `nameEn` arrives nullable so the backfill has somewhere to land.
-- AlterTable
ALTER TABLE "catalog_products" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "brandAr" TEXT,
ADD COLUMN     "brandEn" TEXT,
ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "originAr" TEXT,
ADD COLUMN     "originEn" TEXT,
ADD COLUMN     "packCount" INTEGER,
ADD COLUMN     "packSize" DECIMAL(10,3),
ADD COLUMN     "packUnit" "PackUnit",
ADD COLUMN     "specAr" TEXT,
ADD COLUMN     "specEn" TEXT;

-- The old single-language columns fold into the new ones. `brand` was untyped
-- as to language and is treated as English, which is what every seeded source
-- would have written into it. `unit` is dropped rather than parsed into
-- packSize/packUnit — a free-text "500g" cannot be split reliably, and the
-- unit price it feeds is suppressible, so a null reads as HIDDEN rather than
-- as a wrong number on a printed page.
UPDATE "catalog_products" SET "nameEn" = "canonicalName" WHERE "nameEn" IS NULL;
UPDATE "catalog_products" SET "brandEn" = "brand" WHERE "brandEn" IS NULL AND "brand" IS NOT NULL;

ALTER TABLE "catalog_products" ALTER COLUMN "nameEn" SET NOT NULL;

ALTER TABLE "catalog_products" DROP COLUMN "brand",
DROP COLUMN "canonicalName",
DROP COLUMN "imageUrl",
DROP COLUMN "thumbnailUrl",
DROP COLUMN "unit";

-- AlterTable
ALTER TABLE "catalog_categories" ADD COLUMN     "nameAr" TEXT;

-- AlterTable
ALTER TABLE "offer_books" DROP COLUMN "canvasState",
ADD COLUMN     "densityProfile" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "product_clicks" ADD COLUMN     "offerId" TEXT,
ALTER COLUMN "catalogId" DROP NOT NULL;

-- Departure 2. Empty table, no backfill written. See the header.
-- DropTable
DROP TABLE "offer_book_products";

-- CreateTable
CREATE TABLE "image_assets" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL,
    "derivedFrom" TEXT,
    "r2Key" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bboxTight" JSONB,
    "quality" DOUBLE PRECISION,
    "reviewState" "ReviewState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_imports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "columnMap" JSONB,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_import_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "catalogProductId" TEXT,
    "candidates" JSONB,
    "price" DECIMAL(10,2),

    CONSTRAINT "catalog_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capture_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "importId" TEXT,
    "code" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "capturedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capture_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_book_pages" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "pageType" TEXT NOT NULL,
    "densityProfile" TEXT,
    "slotOverrides" JSONB,

    CONSTRAINT "offer_book_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "priceMode" "PriceMode" NOT NULL DEFAULT 'FIXED',
    "comparePrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "promoTierId" TEXT NOT NULL,
    "unitPriceMode" "UnitPriceMode" NOT NULL DEFAULT 'AUTO',
    "unitPriceValue" DECIMAL(10,3),
    "unitPriceUnit" "PackUnit",
    "legalLines" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_items" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "catalogProductId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "connector" "Connector",
    "nameOverrideEn" TEXT,
    "nameOverrideAr" TEXT,
    "specOverrideEn" TEXT,
    "specOverrideAr" TEXT,
    "imageAssetId" TEXT,

    CONSTRAINT "offer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_tiers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "tokenRef" TEXT NOT NULL,
    "emphasis" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_chips" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "kind" "ChipKind" NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "value" JSONB,
    "anchor" "ChipAnchor" NOT NULL DEFAULT 'TOP_START',

    CONSTRAINT "offer_chips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_footnotes" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "textAr" TEXT,
    "scope" "FootnoteScope" NOT NULL DEFAULT 'PAGE',

    CONSTRAINT "offer_footnotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_shop_overrides" (
    "offerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "offer_shop_overrides_pkey" PRIMARY KEY ("offerId","shopId")
);

-- CreateIndex
CREATE INDEX "image_assets_productId_kind_idx" ON "image_assets"("productId", "kind");

-- CreateIndex
CREATE INDEX "image_assets_reviewState_idx" ON "image_assets"("reviewState");

-- CreateIndex
CREATE INDEX "catalog_imports_organizationId_createdAt_idx" ON "catalog_imports"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "catalog_import_rows_importId_status_idx" ON "catalog_import_rows"("importId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_import_rows_importId_rowIndex_key" ON "catalog_import_rows"("importId", "rowIndex");

-- CreateIndex
CREATE UNIQUE INDEX "capture_sessions_code_key" ON "capture_sessions"("code");

-- CreateIndex
CREATE INDEX "capture_sessions_organizationId_expiresAt_idx" ON "capture_sessions"("organizationId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "offer_book_pages_bookId_index_key" ON "offer_book_pages"("bookId", "index");

-- CreateIndex
CREATE INDEX "offers_bookId_idx" ON "offers"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_bookId_position_key" ON "offers"("bookId", "position");

-- CreateIndex
CREATE INDEX "offer_items_catalogProductId_idx" ON "offer_items"("catalogProductId");

-- CreateIndex
CREATE UNIQUE INDEX "offer_items_offerId_position_key" ON "offer_items"("offerId", "position");

-- CreateIndex
CREATE INDEX "promo_tiers_organizationId_idx" ON "promo_tiers"("organizationId");

-- CreateIndex
CREATE INDEX "offer_chips_offerId_idx" ON "offer_chips"("offerId");

-- CreateIndex
CREATE INDEX "offer_footnotes_offerId_idx" ON "offer_footnotes"("offerId");

-- CreateIndex
CREATE INDEX "offer_shop_overrides_shopId_idx" ON "offer_shop_overrides"("shopId");

-- CreateIndex
CREATE INDEX "catalog_products_organizationId_idx" ON "catalog_products"("organizationId");

-- CreateIndex
CREATE INDEX "catalog_products_organizationId_archivedAt_idx" ON "catalog_products"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_products_organizationId_barcode_key" ON "catalog_products"("organizationId", "barcode");

-- CreateIndex
CREATE INDEX "product_synonyms_catalogId_idx" ON "product_synonyms"("catalogId");

-- CreateIndex
CREATE INDEX "offer_books_shopId_status_idx" ON "offer_books"("shopId", "status");

-- CreateIndex
CREATE INDEX "product_clicks_offerBookId_createdAt_idx" ON "product_clicks"("offerBookId", "createdAt");

-- AddForeignKey
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "catalog_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_import_rows" ADD CONSTRAINT "catalog_import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "catalog_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_import_rows" ADD CONSTRAINT "catalog_import_rows_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "catalog_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_books" ADD CONSTRAINT "offer_books_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_book_pages" ADD CONSTRAINT "offer_book_pages_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "offer_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "offer_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_promoTierId_fkey" FOREIGN KEY ("promoTierId") REFERENCES "promo_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_catalogProductId_fkey" FOREIGN KEY ("catalogProductId") REFERENCES "catalog_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_tiers" ADD CONSTRAINT "promo_tiers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_chips" ADD CONSTRAINT "offer_chips_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_footnotes" ADD CONSTRAINT "offer_footnotes_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_shop_overrides" ADD CONSTRAINT "offer_shop_overrides_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_shop_overrides" ADD CONSTRAINT "offer_shop_overrides_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_clicks" ADD CONSTRAINT "product_clicks_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══ Raw SQL Prisma cannot express ═══════════════════════════════════════════
-- Departure 3. Everything below is hand-written and must survive a regenerate.

-- ─── Barcode uniqueness, per collection ──────────────────────────────────────
-- `@@unique([organizationId, barcode])` above covers the organizations' own
-- rows. It does NOT cover the universal catalog, because Postgres treats NULLs
-- as distinct and every universal row has a NULL organizationId — so that
-- constraint would happily accept the same barcode a thousand times. A partial
-- index is what actually enforces it.
CREATE UNIQUE INDEX "catalog_products_universal_barcode_key"
  ON "catalog_products" ("barcode")
  WHERE "organizationId" IS NULL AND "barcode" IS NOT NULL;

-- ─── Full-text search (E5-01) ────────────────────────────────────────────────
-- Prisma does not manage tsvector columns. The weighting is name (A), brand and
-- category (B), spec and tags (C).
--
-- `simple`, never `english`. The catalog is multilingual and English stemming
-- applied to Arabic, Hindi and Urdu transliterations produces wrong matches.
-- Language-specific handling happens through product_synonyms instead.
--
-- Both name columns feed weight A. An Arabic query has to hit the same row an
-- English one does, and the Arabic string is indexed exactly as stored —
-- nothing here normalises or strips diacritics, because the ImportAlias
-- resolver has to round-trip it unchanged.
ALTER TABLE "catalog_products" ADD COLUMN "search_vector" tsvector;

CREATE INDEX "idx_catalog_fts" ON "catalog_products" USING GIN("search_vector");

CREATE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('simple', COALESCE(NEW."nameEn", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW."nameAr", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW."brandEn", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."brandAr", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."category", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."specEn", '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW."specAr", '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW."tags", ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER catalog_search_vector_update
  BEFORE INSERT OR UPDATE ON "catalog_products"
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- Populate whatever is already there. No-op on an empty table; correct on one
-- that was pushed to.
UPDATE "catalog_products" SET "nameEn" = "nameEn";

-- ─── Fuzzy matching (E5-01, and import name matching) ────────────────────────
-- pg_trgm carries typos and near-misses. Import resolves rows by name as well
-- as by barcode, so this is on the import path too, not only on search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "idx_catalog_trgm_en"
  ON "catalog_products" USING GIN ("nameEn" gin_trgm_ops);

CREATE INDEX "idx_catalog_trgm_ar"
  ON "catalog_products" USING GIN ("nameAr" gin_trgm_ops);

-- ─── Promo tier seed (§4) ────────────────────────────────────────────────────
-- Departure 4. `offers.promoTierId` is NOT NULL, so an organization with no
-- tiers cannot hold an offer. Two per organization, so nothing renders
-- unbadged. `tokenRef` is a design-system token name, never a hex — the same
-- rule the rest of the system is linted against.
--
-- This covers organizations that already exist. New ones are seeded by the
-- signup path, which is not written yet; docs/E5 §9 carries it.
INSERT INTO "promo_tiers" ("id", "organizationId", "labelEn", "labelAr", "tokenRef", "emphasis", "isDefault", "createdAt", "updatedAt")
SELECT
  'ptr_' || substr(md5(o."id" || ':deal'), 1, 21),
  o."id", 'Deal', 'صفقة', '--sq-tpl-offer-red', 2, true, NOW(), NOW()
FROM "organizations" o
ON CONFLICT DO NOTHING;

INSERT INTO "promo_tiers" ("id", "organizationId", "labelEn", "labelAr", "tokenRef", "emphasis", "isDefault", "createdAt", "updatedAt")
SELECT
  'ptr_' || substr(md5(o."id" || ':offer'), 1, 21),
  o."id", 'Offer', 'عرض', '--sq-tpl-save-yellow', 1, false, NOW(), NOW()
FROM "organizations" o
ON CONFLICT DO NOTHING;
