-- Who a cover scene wants in it. E8-04.
--
-- **Because a staff member pushing a full trolley of shopping is not a picture
-- of anything.** That scene shipped in the first eighteen and it is a *customer*
-- scene — the commonest retail cover there is — but the prompt had only one kind
-- of person in it, the shop's own character, so it drew an employee doing the
-- weekly shop. The reverse is just as wrong: nobody but staff stands behind the
-- meat counter.
--
-- Three values. `staff` draws the shop's character from its reference image and
-- is the only one that consumes it. `customer` is invented by the model, which
-- is the point: a shop has one mascot and many customers, and a customer who
-- looked identical on every cover would read as another employee. `none` is the
-- shop and its goods with nobody in frame.
--
-- Default `staff` because that is what all eighteen existing rows were written
-- as; the ones that should be `customer` are corrected below.

ALTER TABLE "cover_prompts" ADD COLUMN "person" TEXT NOT NULL DEFAULT 'staff';

UPDATE "cover_prompts" SET "person" = 'customer'
  WHERE "slug" IN ('full-trolley', 'entrance-trolleys');
