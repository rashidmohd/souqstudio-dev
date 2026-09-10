-- Which group of the shipped library a block belongs to.
--
-- The category was derived in code: `SEED_BLOCKS` carried it, and anything that
-- needed it built an id → category map from the library. That works only while
-- the library is a TypeScript constant every consumer can import, and it had
-- already cost something measurable — `BlockImportDialog` is a client
-- component, so the whole library was being downloaded by every browser that
-- opened the designer (72 KB) to answer which of five words describes an id.
--
-- The library is a loaded document now (`packages/engine/src/library-source.ts`),
-- read from a folder of JSON by the seed, and one day possibly from somewhere
-- that is not the repo at all. So the row is the only place the picker can learn
-- the answer.
--
-- Only the seed ever writes it. That was the objection that kept it out of the
-- schema — "a column only the seed writes and one screen reads" — and it is
-- exactly what a seed is for. Same argument that added `occasion` a day earlier,
-- and `occasion` is the precedent this follows in every respect.
--
-- Null for a block an owner authored, and it stays null: theirs are listed
-- first and separately, because that is the collection they can change.

-- AlterTable
ALTER TABLE "blocks" ADD COLUMN     "category" TEXT;

-- Backfill the library as it stood on 9 September 2026: fifty-nine blocks.
-- `pnpm db:seed` writes the column on every deploy thereafter, so this matters
-- only for databases seeded before today. Owner copies keep a null category by
-- design rather than by omission.

UPDATE "blocks" SET "category" = 'seasonal'
 WHERE "organizationId" IS NULL AND "id" LIKE 'blk_season_%';

UPDATE "blocks" SET "category" = 'header'
 WHERE "organizationId" IS NULL AND "id" IN (
   'blk_hero_band', 'blk_hero_center', 'blk_hero_split', 'blk_section_divider',
   'blk_validity_strip', 'blk_cover_page', 'blk_cover_square', 'blk_cover_story'
 );

UPDATE "blocks" SET "category" = 'footer'
 WHERE "organizationId" IS NULL AND "id" IN (
   'blk_footer', 'blk_footer_center', 'blk_footer_ink', 'blk_terms', 'blk_contact_strip'
 );

UPDATE "blocks" SET "category" = 'panel'
 WHERE "organizationId" IS NULL AND "id" IN (
   'blk_message', 'blk_message_quiet', 'blk_brand_panel', 'blk_brand_panel_page',
   'blk_order_panel', 'blk_hours_panel', 'blk_now_open', 'blk_statement',
   'blk_side_banner', 'blk_thanks'
 );

UPDATE "blocks" SET "category" = 'offer-card'
 WHERE "organizationId" IS NULL AND "id" IN (
   'blk_offer_card', 'blk_offer_card_tinted', 'blk_price_band', 'blk_compact',
   'blk_feature', 'blk_burst', 'blk_overlay', 'blk_ticket', 'blk_framed',
   'blk_price_first', 'blk_list_row', 'blk_side_rail', 'blk_split_tint',
   'blk_halo', 'blk_brand_led', 'blk_spec_led', 'blk_full_bleed',
   'blk_split_vertical', 'blk_plated_photo', 'blk_price_bomb', 'blk_corner_flag',
   'blk_name_band', 'blk_editorial', 'blk_inline_price', 'blk_words_only'
 );
