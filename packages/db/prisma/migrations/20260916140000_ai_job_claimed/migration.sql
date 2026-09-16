-- Work that finished and nobody collected. E8.
--
-- **A job can be `complete` and still owe somebody something.** Character
-- generation returns four options for ten credits and logo generation four for
-- ten; the artefact only exists once a person has picked one. Until this column
-- the only thing that could reach a finished job was the browser tab that
-- started it — every one of those flows held its `jobId` in memory and nothing
-- else in the product listed them. Close the tab mid-generation and the credits
-- were spent, the images were sitting in R2, and there was no route back to
-- them. That is the leak this closes, and the notification it makes possible is
-- the smaller half of it.
--
-- Null means unclaimed *or* nothing to claim. The two are told apart by `type`
-- rather than by a second column: magic block writes a draft block directly and
-- has nothing left to collect, so it is excluded by the query rather than by
-- being marked claimed on completion, which would be a lie about what happened.
--
-- The index is the unfinished-work query — one organization, by status, newest
-- first. It is the only query that reads this table for more than one row.

ALTER TABLE "ai_jobs" ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE INDEX "ai_jobs_organizationId_status_createdAt_idx"
  ON "ai_jobs"("organizationId", "status", "createdAt");
