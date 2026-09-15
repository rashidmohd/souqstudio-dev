-- An offer book somebody has started and not finished.
--
-- Choosing between two products that both look like the row on a spreadsheet is
-- slow work, and a sheet of fifty is an afternoon. An owner walks away in the
-- middle of it, comes back, and today everything is gone — the wizard holds the
-- sheet, the matches and every choice in browser memory and nothing else.
--
-- **A draft of the journey, not of the book.** Creating a book writes offers,
-- and since 15 September it also writes the shop's own products for rows the
-- catalog has never seen. A book created from an unreviewed sheet is real rows
-- an owner never agreed to, and abandoning it leaves them behind. Nothing here
-- is a product, an offer or a book.
--
-- **One JSONB column rather than a modelled import.** `catalog_imports` already
-- models a sheet properly and belongs to E5-06, whose commit writes to the
-- catalog — which `docs/E6-create-flow.md` §2.3 kept out of this flow on
-- purpose. This is the wizard's own state, restored into the same wizard and
-- read by nothing else. The routes bound it at the same 200 rows every other
-- part of this flow uses.
--
-- **Per person, not per shop**: two staff starting different books must not
-- overwrite each other.
CREATE TABLE "offer_book_drafts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_book_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offer_book_drafts_shopId_userId_key" ON "offer_book_drafts"("shopId", "userId");
CREATE INDEX "offer_book_drafts_organizationId_idx" ON "offer_book_drafts"("organizationId");

-- Cascades, all three: a draft is worthless without the shop it is for, the
-- person who started it, or the organization that owns both.
ALTER TABLE "offer_book_drafts" ADD CONSTRAINT "offer_book_drafts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_book_drafts" ADD CONSTRAINT "offer_book_drafts_shopId_fkey"
    FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_book_drafts" ADD CONSTRAINT "offer_book_drafts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
