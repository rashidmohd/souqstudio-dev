-- Prices to three decimals, because three GCC currencies need them.
--
-- `offers.price` and `offers.comparePrice` shipped as `Decimal(10,2)` while
-- `splitAmount` branched correctly to three digits for KWD, OMR and BHD. The
-- two have disagreed since E6: the engine would render three fils and the
-- column could only ever store a zero in the third place, so a Kuwaiti price
-- was silently rounded to the nearest ten fils on the way in.
--
-- Nothing could select those currencies until now, which is why it never bit.
-- Opening the picker to the full ISO 4217 register is what makes it reachable,
-- and seven currencies carry three minor units: BHD, IQD, JOD, KWD, LYD, OMR,
-- TND. Sixteen others carry none at all, which the column already handled —
-- a whole number fits a decimal column fine.
--
-- **Widening is lossless and needs no backfill.** Every existing row has at most
-- two decimal places and keeps exactly the value it had; Postgres rewrites the
-- column in place. The reverse is not true, which is why this is worth getting
-- right once rather than twice.
--
-- Twelve total rather than eleven: the integer side keeps nine digits, and a
-- price in dong or rupiah runs to millions. `Decimal(10,3)` would have left
-- seven and quietly capped a shop at 9,999,999.
--
-- How many of the three decimals a given offer may actually use is its own
-- currency's business, checked at the route by `amountFitsCurrency` so a price
-- that does not fit is refused rather than rounded.

ALTER TABLE "offers" ALTER COLUMN "price" TYPE DECIMAL(12,3);
ALTER TABLE "offers" ALTER COLUMN "comparePrice" TYPE DECIMAL(12,3);
