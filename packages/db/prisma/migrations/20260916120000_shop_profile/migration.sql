-- What a shop is, beyond its name. E8-01.
--
-- Three columns the character and cover features are gated on. Until now the
-- product knew a shop's name, its location, its phone number and its logo —
-- nothing about what it actually sells. A generated character for a butcher is
-- not a character for an electronics shop, and without this the only thing that
-- could be produced was four generic people the owner had already paid for.
--
-- **`trade` is a closed set held in code rather than a Postgres enum.** It is
-- spelled `String // grocery | electronics | ...` like every other closed set
-- older than E5 — the reasoning above `enum PackUnit` in the schema, and the
-- packages/db note that says not to convert the older columns. It is also a
-- vocabulary that will gain rows as this product meets more kinds of shop, and a
-- Postgres enum makes that a migration every time.
--
-- **`bio` is free text and `trade` is not, and that split is the point.** The
-- trade is interpolated into a model prompt as an instruction, so it must come
-- from a list nothing outside the code can widen. The bio is quoted into the
-- same prompt as data. One is an instruction, the other is a string.
--
-- **`storePhotoKeys` is R2 object keys, not URLs.** A key survives the bucket
-- moving behind a different public origin, which is the same choice every other
-- stored asset reference in this schema makes.
--
-- All three are nullable with no default and nothing backfills them: a shop that
-- existed before this is a shop with an incomplete profile, which is exactly
-- what `isShopProfileComplete()` should say about it. A default would make every
-- existing shop claim to be a grocery.

ALTER TABLE "shops" ADD COLUMN "trade" TEXT;
ALTER TABLE "shops" ADD COLUMN "bio" TEXT;
ALTER TABLE "shops" ADD COLUMN "storePhotoKeys" JSONB;
