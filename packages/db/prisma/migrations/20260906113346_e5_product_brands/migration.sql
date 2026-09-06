-- AlterTable
ALTER TABLE "catalog_products" ADD COLUMN     "brandId" TEXT;

-- CreateTable
CREATE TABLE "product_brands" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "logoKey" TEXT,
    "logoSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unreviewed',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_brands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_brands_slug_key" ON "product_brands"("slug");

-- CreateIndex
CREATE INDEX "product_brands_status_idx" ON "product_brands"("status");

-- CreateIndex
CREATE INDEX "catalog_products_brandId_idx" ON "catalog_products"("brandId");

-- AddForeignKey
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "product_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Brand suggestions match with ILIKE '%typed%', which no btree index can serve.
-- pg_trgm is already installed by the E5 migration. Added here rather than left
-- for later because the Open Food Facts seed lands thousands of brands in one
-- run, and the query is a sequential scan until this exists.
CREATE INDEX "idx_product_brands_trgm" ON "product_brands" USING GIN ("nameEn" gin_trgm_ops);
