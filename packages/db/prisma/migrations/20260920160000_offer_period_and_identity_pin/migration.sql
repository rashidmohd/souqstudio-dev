-- E14 §3.2 and §3.4 — the data map.
--
-- Two columns the binding vocabulary needs and that nothing could answer
-- without. Both are additive and both carry a safe default or a null, so this
-- deploys ahead of the code that reads them.

-- The offer period a flyer header prints: "Offers valid 1–7 October".
--
-- Deliberately not `expires_at`. That column is when the share *link* stops
-- working — a fact about a URL, set for different reasons and to different days
-- — and a header that borrowed it would print a date the shop never chose.
--
-- `date` rather than `timestamptz`: an offer period has no time of day, and a
-- timestamp would put one shop's Friday in another's Thursday.
ALTER TABLE "offer_books" ADD COLUMN "validFrom" date;
ALTER TABLE "offer_books" ADD COLUMN "validTo" date;

-- Whose mark a block carries. `inherit` follows `brandOverride`, which is what
-- every existing block already did; `organization` forces the parent mark, for
-- the group footer that must always show the group.
--
-- Defaulted rather than nullable, because every block has an answer and a null
-- would be a third state nothing means.
ALTER TABLE "blocks" ADD COLUMN "identityPin" text NOT NULL DEFAULT 'inherit';
