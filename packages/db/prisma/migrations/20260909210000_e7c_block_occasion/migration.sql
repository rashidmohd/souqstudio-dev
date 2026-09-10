-- E7-C: which occasion a seasonal block is for.
--
-- The seeded library maps block id → occasion in code, and that works until an
-- owner imports one: `importBlocks` copies the document into a new row with a
-- new cuid, and the map has never heard of it. So the copy loses the one fact
-- that made it seasonal, and the composer cannot promote it.
--
-- A column rather than a date pair, because the *window* still has to be
-- computed: Ramadan and both Eids move about eleven days a year against the
-- Gregorian calendar, so freezing this year's dates onto the row is wrong from
-- its second year — which is why `activeFrom`/`activeTo` stayed null on every
-- seeded block in the first place.
--
-- Backfilled from the seeded ids below. `pnpm db:seed` writes it on every deploy
-- thereafter, so this only matters for databases seeded before today.

-- AlterTable
ALTER TABLE "blocks" ADD COLUMN     "occasion" TEXT;

-- Backfill the seeded library. Owner copies made before today keep a null
-- occasion: the row they were copied from is known, but the copy does not
-- record it, and guessing from a name an owner may have changed would put the
-- wrong band in front of a shop.
UPDATE "blocks" SET "occasion" = 'ramadan'        WHERE "id" IN ('blk_season_ramadan', 'blk_season_ramadan_cover');
UPDATE "blocks" SET "occasion" = 'eid-al-fitr'    WHERE "id" = 'blk_season_eid_fitr';
UPDATE "blocks" SET "occasion" = 'eid-al-adha'    WHERE "id" = 'blk_season_eid_adha';
UPDATE "blocks" SET "occasion" = 'national-day'   WHERE "id" = 'blk_season_national_day';
UPDATE "blocks" SET "occasion" = 'back-to-school' WHERE "id" = 'blk_season_back_to_school';
UPDATE "blocks" SET "occasion" = 'summer'         WHERE "id" = 'blk_season_summer';
UPDATE "blocks" SET "occasion" = 'shopping-festival' WHERE "id" = 'blk_season_shopping_festival';
UPDATE "blocks" SET "occasion" = 'new-year'       WHERE "id" = 'blk_season_new_year';
UPDATE "blocks" SET "occasion" = 'mothers-day'    WHERE "id" = 'blk_season_mothers_day';
UPDATE "blocks" SET "occasion" = 'anniversary'    WHERE "id" = 'blk_season_anniversary';
