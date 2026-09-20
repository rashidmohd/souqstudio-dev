-- The currency belongs to the shop, and how a card writes it is a separate
-- question from what a price is.
--
-- Before this, `offers.currency` was the only currency column in the schema and
-- every offer was created with the string `'AED'` written into an API route —
-- there was no control anywhere in the product to change it. The editor read the
-- currency back off the first offer in the book, under a comment stating that it
-- was the shop's and not the offer's. It is. This is where it now lives.
--
-- **`offers.currency` stays and keeps its meaning.** It is frozen with the book,
-- for the reason `unit_price_value` is frozen at publish: a reprint of week 33
-- must reproduce the currency week 33 was priced in, and a shop that changes
-- currency in week 40 must not silently restate forty old flyers. `shops.currency`
-- is the default a new offer is created with, and that is all it is.
--
-- **Three columns, and only the first is about money.** The ISO code decides
-- whether a price carries two fils or three — `THREE_DECIMAL_CURRENCIES` reads
-- it, and KWD, OMR and BHD carry three. The other two decide only what is
-- printed. Keeping them apart is what stops a shop choosing a nicer symbol and
-- dropping a digit off every Kuwaiti price.
--
-- `currency_symbol` is nullable rather than defaulted: null means "the usual one
-- for this currency", which lives in `CURRENCY_SYMBOLS` in @souqstudio/types, and
-- defaulting it here would freeze today's answer into every existing row.
--
-- Defaults match the behaviour being replaced — 'AED' and the ISO code — so
-- every existing shop renders exactly as it did before the migration ran.

ALTER TABLE "shops" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'AED';
ALTER TABLE "shops" ADD COLUMN "currencyDisplay" TEXT NOT NULL DEFAULT 'CODE';
ALTER TABLE "shops" ADD COLUMN "currencySymbol" TEXT;

-- What a newly created shop starts at. A group operating in one country sets it
-- once; a shop may still differ, which is why the real column is on `shops` and
-- this only seeds it — copied at creation, never inherited live. A group adding
-- a Riyadh branch changes that shop, and the change must not reach back.
ALTER TABLE "organizations" ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT 'AED';
