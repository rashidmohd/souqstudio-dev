-- Composition model: blocks, page grids and pins.
--
-- See docs/composition-model.md. A brand kit holds no layout and a book picks
-- its own grid, so `templates` — which bundled look and arrangement together —
-- had nothing left to be, and `grids` became a `perRow` integer on a region.
--
-- Safe to drop with data in them: both tables were seeded presets, and nothing
-- referenced either. `offer_books` held 0 rows at the time of writing, so no
-- book pointed at a template and no page pointed at a grid.
--
-- The `user_shop_access.updatedAt` default is pre-existing drift from a past
-- `db push` — Prisma's @updatedAt writes the value on every update, so dropping
-- the database-side default brings the column back in line with the migration
-- history and changes no behaviour.

-- DropForeignKey
ALTER TABLE "offer_books" DROP CONSTRAINT "offer_books_templateId_fkey";

-- DropForeignKey
ALTER TABLE "template_versions" DROP CONSTRAINT "template_versions_templateId_fkey";

-- AlterTable
ALTER TABLE "offer_book_pages" DROP COLUMN "densityProfile",
DROP COLUMN "pageType";

-- AlterTable
ALTER TABLE "offer_books" DROP COLUMN "densityProfile",
DROP COLUMN "templateId";

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "maxProductsPerBook" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "user_shop_access" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "grids";

-- DropTable
DROP TABLE "template_versions";

-- DropTable
DROP TABLE "templates";

-- CreateTable
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repeats" BOOLEAN NOT NULL DEFAULT true,
    "arrangements" JSONB NOT NULL,
    "thumbnailUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "planTier" TEXT NOT NULL DEFAULT 'starter',
    "isSeasonal" BOOLEAN NOT NULL DEFAULT false,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_versions" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "arrangements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_grids" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'master',
    "cols" DOUBLE PRECISION[],
    "rows" DOUBLE PRECISION[],
    "gap" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "margin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regions" JSONB NOT NULL,

    CONSTRAINT "page_grids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_pins" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "blockId" TEXT NOT NULL,
    "colStart" INTEGER NOT NULL,
    "colEnd" INTEGER NOT NULL,
    "rowStart" INTEGER NOT NULL,
    "rowEnd" INTEGER NOT NULL,
    "content" JSONB,

    CONSTRAINT "book_pins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocks_organizationId_status_idx" ON "blocks"("organizationId", "status");

-- CreateIndex
CREATE INDEX "block_versions_blockId_idx" ON "block_versions"("blockId");

-- CreateIndex
CREATE INDEX "page_grids_bookId_idx" ON "page_grids"("bookId");

-- CreateIndex
CREATE INDEX "book_pins_bookId_pageIndex_idx" ON "book_pins"("bookId", "pageIndex");

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_versions" ADD CONSTRAINT "block_versions_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_grids" ADD CONSTRAINT "page_grids_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "offer_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_pins" ADD CONSTRAINT "book_pins_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "offer_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_pins" ADD CONSTRAINT "book_pins_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

