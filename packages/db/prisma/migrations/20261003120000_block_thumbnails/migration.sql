-- PNGs of a block, one per brand kit and direction it has been drawn in. Rows
-- are added by the worker's render.blockThumbnail job; nothing else writes here.

-- CreateTable
CREATE TABLE "block_thumbnails" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "renderKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "block_thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "block_thumbnails_blockId_renderKey_key" ON "block_thumbnails"("blockId", "renderKey");

-- AddForeignKey
ALTER TABLE "block_thumbnails" ADD CONSTRAINT "block_thumbnails_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

