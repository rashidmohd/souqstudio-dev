# @souqstudio/engine

The layout engine. Given a master page grid, a product list and a set of pins, it
produces the pages of an offer book: which block renders where, at what rectangle,
carrying which offer.

Read `docs/composition-model.md` before changing anything here.

## Why it is a package

It runs in two places — in the browser for the editor, and in the worker for
export. **One implementation, always.** Two would drift, and drift here means the
PDF does not match the screen. That is why this is not `apps/web/lib`.

## What belongs here

Pure functions over plain data. No Prisma, no Fabric, no React, no I/O.

The engine decides geometry and assignment. Fabric renders what it decides and
owns nothing else — E6 §1.

`price-mark.ts` is the clearest case of that split. It decides where the currency
code, the major digits, the raised minor, the tier tab and the struck-through
compare price each sit, and returns them as rectangles and baselines; it draws
nothing. That is what lets the same three rules hold in the browser and in the
export worker, and what makes them testable at all — the rules that decide
whether a page reads as a real offer book used to live in throwaway harness code
and were checked only by eye.

`fit.ts` is the same split again: it decides sizes and line breaks and draws
nothing, and it takes its `TextMeasurer` as an argument because measuring a glyph
needs a font that the engine does not have. The browser passes a canvas
measurement, the worker passes its own, tests pass an estimator.

`direction.ts` and `compact.ts` are both here because a *renderer* needs them and there
are four of them — the harness, `BlockPreview`, E6's Fabric layer and E9's export — and
three are not a browser. Both were written from real catalog rows rather than from
reasoning: `direction.ts` after every Arabic pack label printed backwards, `compact.ts`
after a card designed at the worst case turned out to be a fifth void on the rows a real
catalog actually holds. Neither draws anything. `compact.ts` in particular decides *how
much* space is reclaimed and takes *where it goes* as a parameter, because that is a design
decision and the engine does not own it.

`library.ts` holds the seeded blocks. It lives here rather than beside the seed
because two consumers need the same bytes: `packages/db` writes them into
`blocks`, and the harness draws them. A second copy would drift, and a drifted
seed block renders differently in the database from the one that was checked.

## What does not belong here

- Rendering. The engine returns rectangles; something else draws in them.
- Overrides. `SlotOverride` is a bounded delta applied *after* the engine runs.
- Anything that reads the database.
