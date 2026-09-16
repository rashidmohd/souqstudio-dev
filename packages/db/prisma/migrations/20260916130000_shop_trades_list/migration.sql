-- One shop, several segments. E8-01.
--
-- `trade` was added earlier the same day as a single nullable column and is
-- replaced here by a list. **Nothing is lost**: the column shipped hours before
-- this, nothing has written to it, and every row is null — which is why this is
-- a drop and an add rather than a backfill. Were there data, this would have to
-- be `ADD COLUMN`, `UPDATE ... array[trade]`, `DROP COLUMN`, in that order.
--
-- A grocery with a bakery counter is the common case in this market, not an
-- edge one, and asking it to choose produced a character holding the wrong
-- thing. `MAX_TRADES` caps it at three in code rather than here: a shop
-- claiming eight segments has told a model nothing it can draw from, and that
-- is a product judgement that will move, not a database constraint.
--
-- `NOT NULL DEFAULT '{}'` so "no segments chosen" is an empty array rather than
-- a null that every reader has to remember to handle. `isShopProfileComplete()`
-- is what treats empty as incomplete.

ALTER TABLE "shops" DROP COLUMN "trade";
ALTER TABLE "shops" ADD COLUMN "trades" TEXT[] NOT NULL DEFAULT '{}';
