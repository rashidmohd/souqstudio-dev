-- The shop's own item code, its supplier, and how it is sold. E5.
--
-- Three columns `docs/product-data-collection.md` §4 argues are cheap now and
-- expensive once a library exists. Nothing has been collected against them yet,
-- which is the whole reason they are landing today rather than after the run.
--
-- ── sku ──────────────────────────────────────────────────────────────────────
-- A barcode is the world's identity for a product; a SKU is the shop's, and the
-- import matched on neither until now — `catalog_import_rows` resolved by
-- barcode and name only, so a sheet keyed by item code fell through to a fuzzy
-- name match every time. Worse, `catalog-import.ts` listed `sku` as a *barcode*
-- header spelling, so an owner's SKU column was read as a barcode, failed its
-- check digit and matched nothing.
--
-- Unique per collection rather than globally, exactly as `barcode` is: two
-- shops may use the same item code for different things, and NULLs are distinct
-- in Postgres so every universal row and every blank coexists under one index.
--
-- ── supplier ─────────────────────────────────────────────────────────────────
-- Free text on purpose. `product_brands` earned a table because a string cannot
-- carry a logo and a brand lockup renders on the card; a supplier renders
-- nowhere and is not shared between organizations. A string backfills into a
-- table later; a table cannot be un-built as cheaply.
--
-- ── sellBy ───────────────────────────────────────────────────────────────────
-- `packUnit` says what the number means. This says what the number *is*. Loose
-- tomatoes at 4.50 a kilo could previously only be described as a pack of
-- something, which made `deriveUnitPrice` divide a rate by a quantity that was
-- never there and `packLabel` print a pack line for a product with no pack.
--
-- NOT NULL DEFAULT 'PACK' rather than nullable: every row that predates this
-- column is a pack, so absence has one correct answer and encoding it as a null
-- would make every reader re-decide it.

CREATE TYPE "SellBy" AS ENUM ('PACK', 'LOOSE');

ALTER TABLE "catalog_products" ADD COLUMN "sku" TEXT;
ALTER TABLE "catalog_products" ADD COLUMN "supplier" TEXT;
ALTER TABLE "catalog_products" ADD COLUMN "sellBy" "SellBy" NOT NULL DEFAULT 'PACK';

CREATE UNIQUE INDEX "catalog_products_organizationId_sku_key"
  ON "catalog_products"("organizationId", "sku");
