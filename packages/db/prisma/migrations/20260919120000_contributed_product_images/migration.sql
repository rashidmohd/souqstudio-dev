-- A photo one shop supplied for a product it does not own.
--
-- Nullable with no backfill: every existing row is seeded, imported or
-- generated, and null is the honest answer for all of them. The column is what
-- lets an unreviewed contribution be visible to its contributor and to nobody
-- else — see the schema comment and `imageVisibility` in `lib/catalog.ts`.
ALTER TABLE "image_assets" ADD COLUMN "contributedBy" TEXT;

-- Paired on every read that hides unreviewed contributions from other tenants.
CREATE INDEX "image_assets_contributedBy_reviewState_idx"
  ON "image_assets" ("contributedBy", "reviewState");
