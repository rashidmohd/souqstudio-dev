-- E7-C: a record of the artwork a block can use.
--
-- `ImageSource.assetId` holds the R2 object key and keeps holding it — a block
-- document has to resolve to a URL with no query, or Prisma lands inside the
-- render path. So `key` is unique and is the join; the row carries what a key
-- cannot answer, and above all *what artwork exists*.
--
-- Nothing to backfill. Uploads before this migration left objects in the bucket
-- with no row, and they stay that way: the keys are recoverable from the block
-- documents that reference them, but a filename and a size are not, and
-- inventing either would put a wrong name in front of an owner. They keep
-- working — a block document names the key directly — they simply do not appear
-- in the picker.
--
-- `organizationId` null is the seeded overlay library, matching `blocks`.

-- CreateTable
CREATE TABLE "block_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "block_assets_key_key" ON "block_assets"("key");

-- CreateIndex
CREATE INDEX "block_assets_organizationId_createdAt_idx" ON "block_assets"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "block_assets" ADD CONSTRAINT "block_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
