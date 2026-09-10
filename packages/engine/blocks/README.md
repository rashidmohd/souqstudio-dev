# Authored blocks

Individual designs, one JSON file each. `library-source.ts` reads this folder,
validates every document, and hands the result to whatever is writing the
library — `pnpm db:seed`, or `blocks:publish` on its way to R2.

**Adding a design is adding a file here.** No TypeScript, no entry in a list, no
generated index. Nothing else changes.

## Where this folder sits now

The library has two sources, and `BLOCK_LIBRARY_URL` picks between them:

- **unset** — the repo. The generated blocks plus this folder. What a laptop
  with no credentials gets, and what the render harness draws.
- **set** — R2, and *only* R2. The compiled-in library is not consulted at all.

So a file here reaches shops in two hops rather than one: publish it to the
bucket (`pnpm --filter @souqstudio/engine blocks:publish`), then sync
(`POST /api/v1/library/sync`, or the next deploy's seed). See
`docs/block-library-from-r2.md` §10.

## Why this is not where the whole library lives

The offer cards in `library-cards.ts` are seventeen structures times a skin, and
they stay generated. `docs/E7-pending.md` §8 records what happened the last time
thirty cards were drawn by hand: they drifted apart inside a month. Files are for
the designs somebody drew once because they wanted exactly that — a seasonal
band with a deadline, a cover for one campaign.

## The document

```json
{
  "id": "blk_ramadan_band_2027",
  "name": "Ramadan band",
  "description": "One line, shown under the name in the picker.",
  "repeats": false,
  "category": "seasonal",
  "isSeasonal": true,
  "arrangements": [
    {
      "aspectMin": 2.4,
      "aspectMax": 9,
      "elements": [
        {
          "id": "ground",
          "kind": "shape",
          "variant": "rect",
          "radius": 0,
          "box": { "start": 0, "top": 0, "width": 1, "height": 1 },
          "fill": { "from": "role", "ref": "primary" }
        }
      ]
    }
  ]
}
```

- **`id`** is permanent and public. A live book names it inside its page grid as
  plain JSON, and the seed upserts on it. Renaming one is not a rename.
- **`category`** is one of `offer-card`, `header`, `panel`, `footer`, `seasonal`
  — it is what the picker filters by. It is written onto the row by the seed.
- **`isSeasonal`** carries no dates. Ramadan and both Eids move about eleven
  days a year against the Gregorian calendar, so the window is *computed* from
  the occasion. See `src/seasonal.ts`.
- **Every colour is a role** — `{ "from": "role", "ref": "primary" }`. A block
  ships before it has met a shop, so it cannot name that shop's palette entry,
  and a literal would stop looking like whichever account loaded it. The loader
  refuses a document that breaks this.
- **Every box is a fraction of the block**, never a pixel, so one design serves a
  1080 carousel post and a third of an A4 column.
- Warnings are refused too, not just errors. An owner may accept "this will
  disappoint you" on their own block; the library every account loads may not.

A document that fails any of these fails the **seed**, which is to say a deploy —
the loader names the file and what is wrong with it. That is the cost of
authoring outside the compiler, and `docs/block-library-from-r2.md` §5 is where
it is argued about.

The exhaustive per-field schema is still `arrangementsSchema` in
`apps/web/lib/block-document.ts`; the loader checks the skeleton plus the rules
above. Unifying the two is a prerequisite for loading this folder from anywhere
but the repo — §8 step 5 of that document.
