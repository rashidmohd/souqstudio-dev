-- A design chosen per product: the offer's card is drawn with this block
-- instead of the book's. Null keeps the book's card, so every existing row
-- draws exactly as before.

-- AlterTable
ALTER TABLE "offers" ADD COLUMN "cardBlockId" TEXT;

-- CreateIndex
CREATE INDEX "offers_cardBlockId_idx" ON "offers"("cardBlockId");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_cardBlockId_fkey" FOREIGN KEY ("cardBlockId") REFERENCES "blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
