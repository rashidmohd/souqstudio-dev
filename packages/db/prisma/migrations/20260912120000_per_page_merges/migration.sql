-- Merges move from the master grid onto the page.
--
-- A merge used to be written into `page_grids.regions`, which made it a property
-- of the master and therefore of every body page at once: merging two cells on
-- page one merged them on all nine. That is the composition model's stated
-- behaviour and it is not what an owner laying out a booklet wants — a hero
-- belongs to the page they put it on.
--
-- So the master goes back to one region per cell and each page carries its own
-- merges. `flowBook` applies them per page while the product cursor runs
-- straight through, so a page holding a merged hero holds one card fewer and the
-- products simply carry on.
ALTER TABLE "offer_book_pages" ADD COLUMN "merges" JSONB;

-- No data migration. Every master grid in this database holds one region per
-- cell already, so there is nothing baked in to unpick; a grid that did carry a
-- merge would keep drawing it on every page until the next layout edit rebuilt
-- it, which is a rebuild the route performs on any change.
