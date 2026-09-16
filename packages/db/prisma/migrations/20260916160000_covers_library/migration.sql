-- Covers an owner generated and kept. E8-04.
--
-- **A cover is a brand asset, not a property of one book.** It shipped as a page
-- background in the editor, which meant a cover was made inside one book and
-- could never be reused — the same shop paying five credits again next week for
-- the same Ramadan cover. It is made once on `/brand` now and picked from there.
--
-- Shop-scoped with no `organizationId`, matching `characters` exactly. That is
-- deliberate and it is noted on both: every query scopes by `shopId` from the
-- active shop, so the usual organization guard does not appear in them.
--
-- `campaign`, `style` and `shape` are TEXT rather than enums. They mirror
-- `CAMPAIGNS`, `COVER_STYLES` and `COVER_SHAPES` in the engine, which move with
-- product judgement — and a kept cover naming an occasion we have since dropped
-- should still render in the library rather than fail to read.

CREATE TABLE "covers" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "covers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "covers_shopId_createdAt_idx" ON "covers"("shopId", "createdAt");

ALTER TABLE "covers" ADD CONSTRAINT "covers_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
