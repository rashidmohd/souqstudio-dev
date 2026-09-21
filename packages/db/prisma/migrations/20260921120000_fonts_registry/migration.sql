-- The font registry. `docs/fonts-from-google.md` §2.
--
-- Until now the set of typefaces a shop could choose from was a literal array in
-- `apps/web/lib/brand-fonts.ts` — ten families, hand-picked, each one verified by
-- hand to cover Arabic. `scripts/mirror-fonts.mjs` recovered that array by
-- reading the TypeScript file as *text* and regexing the literals out of it,
-- because there was nowhere else to ask. This table is that nowhere else.
--
-- **No `organizationId`, on purpose.** Fonts are platform-wide. The first shop
-- anywhere to choose Cairo pays for the fetch and every shop after it gets a
-- hit; four hundred shops on Cairo is one row here and four hundred brand kits
-- holding the string 'Cairo'. Adding a tenant column later would not be a
-- widening, it would be a different design.
--
-- **A row means the files are in R2.** Nothing writes here before the upload
-- completes, which is what lets every downstream surface — the specimen, the
-- Fabric artboard, the HarfBuzz measurer and the PDF — read one set of bytes
-- without testing for presence. E14 Phase 0.1 measured 0.000% parity between
-- word-segmented HarfBuzz and Chromium's canvas; that number is a statement
-- about two programs reading the same file, and this table is what makes them
-- the same file.
--
-- `version` is Google's, not ours, and is never refreshed on a schedule. See the
-- column comment in schema.prisma and §2a of the doc.

CREATE TABLE "fonts" (
    "id"            TEXT NOT NULL,
    "family"        TEXT NOT NULL,
    "slug"          TEXT NOT NULL,
    "version"       TEXT NOT NULL,
    "subsets"       TEXT[],
    "category"      TEXT NOT NULL,
    "weights"       INTEGER[],
    "italicWeights" INTEGER[],
    "license"       TEXT NOT NULL,
    "css"           TEXT NOT NULL,
    "mirroredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fonts_pkey" PRIMARY KEY ("id")
);

-- Both are natural keys and both are looked up. `family` is what a brand kit
-- stores and what CSS names; `slug` is what an R2 key is built from. Unique on
-- each, so neither can come to mean two families.
CREATE UNIQUE INDEX "fonts_family_key" ON "fonts"("family");
CREATE UNIQUE INDEX "fonts_slug_key" ON "fonts"("slug");

-- The picker's only filter: which families cover the scripts this shop sells in.
-- GIN because the query is array containment — `subsets @> ARRAY['arabic']` —
-- and a bilingual shop asks it on every open of the typography panel.
CREATE INDEX "fonts_subsets_idx" ON "fonts" USING GIN ("subsets");
