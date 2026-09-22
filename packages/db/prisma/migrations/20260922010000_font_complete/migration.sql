-- Is every face of this family in R2, or only the ones somebody needed at once?
-- `docs/fonts-from-google.md` §8.
--
-- Mirroring a cold family costs 1.6s to 7.2s, dominated by per-object round
-- trips to R2 rather than bandwidth — raising concurrency from 6 to 32 moved
-- Rubik from 7.2s to 7.3s. Blocking a font change on all 99 of Rubik's files is
-- an eight-second spinner on a routine act, so a save now waits only for the
-- weights the brand kit binds and the subsets the shop's languages need, and a
-- background job finishes the family.
--
-- **Only the export gate reads this column.** Every rendering surface draws with
-- whatever is mirrored and never tests completeness; that is what keeps the
-- per-weight presence checks this design set out to avoid from reappearing in
-- eight call sites. One row, one boolean, one caller.
--
-- Defaults to true, and that is right for every row that exists today: the ten
-- families were mirrored whole by `fonts:mirror` before this column existed, so
-- describing them as complete is a statement of fact rather than an assumption.

ALTER TABLE "fonts" ADD COLUMN "complete" BOOLEAN NOT NULL DEFAULT true;

-- The background job's worklist. Not partial (`WHERE NOT complete`), although
-- that would be smaller: Prisma cannot express a partial index, and an index the
-- schema cannot describe reads as drift on every `migrate diff` until somebody
-- reconciles it away. That is precisely how `shops.trades` lost its default and
-- broke every signup on 21 September.
CREATE INDEX "fonts_complete_idx" ON "fonts" ("complete");
