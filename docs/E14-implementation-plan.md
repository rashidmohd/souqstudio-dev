# E14 — implementation plan

The work, in order, with the gates. The design is `docs/E14-layout-frames.md`;
read §2 and §3 before starting anything here. This file does not restate the
design and does not argue for it.

**Two gates decide whether this continues.** Phase 0 says whether the model is
buildable; Phase 4 says whether it survives contact with real blocks. Neither is
a formality and both are early on purpose.

Sizing is relative — **S** is under a day, **M** is a few, **L** is a week or
more — because a calendar estimate on work this exploratory is a number somebody
will later be held to. What each phase is uncertain *about* is stated instead.

---

## Phase 0 — Prove the three risky things · **M** · **GATE**

Nothing else is worth starting until these three are answered. None of them ships
a feature; all three are throwaway if the answer is bad, which is the point.

### 0.1 Text measurement parity

**The single largest risk in the epic.** `hug` means measuring a string, and
`estimateWidth` in `draw.tsx` and the browser's canvas already disagree. Today
that costs a slightly wrong wrap. Under frames it moves boxes, and a server
render that disagrees with the first client paint is a React hydration mismatch.

- Measure a corpus — every product name in the catalog, both languages, at the
  weights and faces the brand-kit catalog ships — through `estimateWidth`, through
  a browser canvas, and through the real font metrics.
- Report the distribution of the disagreement, not the mean. The tail is what
  moves a box.
- **Exit:** either a measurer that agrees to within a tolerance that does not
  move a box at 300 dpi, or a written decision to measure once on the server and
  ship the numbers to the client.

The second option is probably the right answer and is cheaper than making two
implementations agree. Decide it here rather than discovering it in Phase 2.

### 0.2 Grid in nested frames

Figma shipped one-dimensional auto layout in 2020 and needed until 2025 to admit
two-dimensional layout is not nested rows and columns. A flyer is a grid product.

- Build a 3-up band with one card spanning two cells, by hand, as nested row and
  column frames. No solver yet — do it on paper or in a spreadsheet of numbers.
- **Exit:** either it expresses cleanly, or `Layout` gains a third mode and the
  design changes before any code depends on it.

### 0.3 The export harness, into the repo

§2.4's findings came from rendering to PDF through headless Chrome and counting
PDF objects. It lives in a scratch directory and is the only thing that would
catch the export path silently rasterizing a page.

- Move it in, beside the gallery. Run on demand, not in CI — it needs a browser.
- Cover the nine cases already tested plus a ringed shadow.
- **Exit:** `pnpm --filter @souqstudio/engine export:check` prints a table and
  fails on any unexpected raster.

---

## Phase 1 — The data map · **M** · ships alone

**Worth doing whatever happens to the rest**, and it does not touch layout. Two
bindings draw nothing today and a group cannot be named; none of that is waiting
on frames. If E14 is shelved after Phase 0, this still ships.

### 1.1 Fix what is declared and absent

- `shop.address` and `shop.phone` resolve, in `draw.tsx` **and**
  `harness/svg.ts`. The columns are `shops.location` and `shops.phone`.
- `ArtboardOffer` and the composer carry them.

### 1.2 Identity as a mode

- One `brand` source. `brand.name` and `brand.logo` resolve through
  `readEffectiveBrand` and `brandOverride`.
- An identity pin on the block, so a group footer can force the parent mark.
- `brand.name` returns the organization's name when pinned.

### 1.3 `logo` folded into `image`

- `ImageSource` gains `{ from: 'brand'; field: 'logo' }`.
- The `logo` element kind stays renderable — it is deleted in Phase 7.
- A converter turns every stored `logo` element into a bound `image`. 83 blocks;
  run it and diff the gallery.

### 1.4 The offer period

- `validFrom` and `validTo` on `offer_books`, plus a migration.
- The editor sets them. **Resolved to strings by the composer**, never as dates
  the engine formats — §8's decision, same rule as `comparePrice`.
- `book.validFrom` / `book.validTo` bindings.

### 1.5 Save fields

- `offer.saveAmount` and `offer.savePercent`, computed by the composer from
  `price` and `comparePrice`, empty when there is no was-price.
- This is what makes conditional content work without a predicate in the engine.

### 1.6 The test that walks the vocabulary

**§3.5, and the reason this phase exists at all.** A binding is declared in
`@souqstudio/types` and resolved in a painter, and nothing has ever checked the
two lists match — which is why `shop.phone` has been broken for as long as it has
existed.

- A fixture with every source populated.
- A test that iterates the vocabulary and asserts each binding draws something.
- **It must iterate, not list cases.** A test that lists cases has the same defect
  as the thing it is testing.

**Exit:** every binding in §3.3 draws. `pnpm test` green, gallery byte-identical
except where a previously-blank binding now draws.

---

## Phase 2 — Frames in the engine · **L**

Types and solver. No UI, no painter changes, no conversion. Tests only.

### 2.1 Types

`Frame`, `Layout`, `Sizing`, `min`/`max`, `aspect`, `direction`, `ignoreLayout`,
`whenEmpty`, `designSize`. Zod schema alongside, with the mirror check that
already guards `arrangementsSchema`.

### 2.2 The solver

- **Measure, bottom-up.** Resolve `hug`, clamp to min/max. A `fill` child
  contributes nothing to a `hug` parent — the rule that makes it terminate.
- **Position, top-down.** Divide free space among `fill` children by weight,
  place along the axis with the gap, recurse.
- `designSize` in, absolute boxes out.

### 2.3 Direction

Resolve `start`/`end` **on the inline axis only**. `justify` on a row mirrors;
`align` on a row does not; on a column it is the other way round.

**Write the test before the code.** §5.5 exists because a solver that mirrors by
field name rather than by axis flips every column frame top-to-bottom in Arabic,
and it looks like a vertical centering bug.

### 2.4 Placement

`s` as a single scalar. Per slot class, not per instance — measured against the
worst case across the set. `minLegible` as the floor that triggers reflow rather
than further scaling.

**Exit:** the solver has tests for every rule in §5, including the direction trap
and the hug/fill termination rule. Nothing renders yet.

---

## Phase 3 — Paint · **M**

Independent of Phase 2 and can run beside it.

### 3.1 Optional fill

`fill?: ColorValue` on shapes and frames. Absent draws no fill.

### 3.2 Stroke on text

`stroke` on the text element, painted **`paint-order: stroke fill`**. Without it a
stroked glyph loses half the stroke into its own counters and comes out thin at
exactly the size a price is read. The visible outline is half the declared width;
double it for the intended weight.

### 3.3 Shadow

- `Shadow { x, y, blur, color }` on frames, shapes, text and images.
- **The ring expansion lives in `packages/engine`, beside `shapePath`**, and every
  painter calls it. Same argument that file already makes.
- `a = 1 − (1 − peak)^(1/n)`, `spread = 2.5 × blur`, constant alpha per ring.
- **`n` is derived at paint from blur and output scale**, never stored: about 16
  on screen, about 48 at 300 dpi. Stored fields are `x`, `y`, `blur`, `color`.
- `blur: 0` is the same path with one ring.

### 3.4 The lint rule

`feGaussianBlur`, `feDropShadow`, `filter: drop-shadow()` and gradients with
alpha stops, refused on anything reaching the export path. The rule names §2.4 so
the next person finds the measurement rather than re-deriving it.

**Exit:** Phase 0.3's harness reports zero unexpected rasters on a page using all
three, and the ringed shadow is visually indistinguishable from `feDropShadow` at
16 rings.

---

## Phase 4 — Three blocks by hand · **M** · **GATE**

The second gate, and the one that decides whether the model survives real design
rather than test fixtures.

- **A shelf ticket.** Row frame, currency and price, hug, justify end.
- **A burst card.** Frame with `shape: 'star'`, a fill, padding, hugging a price.
  The one that answers "how do I recolour the star" by construction.
- **A 3-up band with a card spanning two cells.** Phase 0.2 on paper; this is it
  in the solver.

Then **a header and a footer**, because those exercise the data map and the offer
card will not: logo, shop address, phone, the offer period, the identity pin.

**Exit:** all five render, and somebody looks at them. If the nesting is
unsurvivable this is where it is said, not in Phase 6.

---

## Phase 5 — The converter · **M**

- Every `priceMark` becomes a frame holding a price text plus whatever its recipe
  said was visible.
- Every `groupId` run becomes a `free` frame.
- Every `logo` becomes a bound `image` — Phase 1.3 already did this.
- Each block gets a `designSize` equal to its current rendered size at the
  library's reference region, which makes the conversion exact rather than
  approximate.

**Exit:** the gallery harness renders all 83 blocks before and after and the two
are **byte-identical**. That is the bar every change this month has met and there
is no reason to lower it here.

---

## Phase 6 — Regenerate the seeded library · **L**

`library-cards.ts` and its siblings rewritten as frame trees. 66 blocks. This is
the largest single piece of work in the epic and it is deliberately after both
gates.

Do it in category order — offer cards, then panels, then headers and footers,
then seasonal and social — and run the gallery after each group rather than at
the end.

**Exit:** `pnpm --filter @souqstudio/engine gallery` draws all 66 at every shape
they claim, and `library-source.ts` reports no warnings. A shipped block that
draws a warning is refused by the loader — `docs/block-library-from-r2.md` §12,
which took the dev deploy down on 10 September.

---

## Phase 7 — Designer UI · **L**

- Create, nest and unnest frames. Convert a selection to a frame.
- Layout: direction, gap, padding, justify, align, baseline, first-on-top.
- Sizing per axis: fixed / hug / fill, with min/max and fill weights. Disable
  what §2's validity rules forbid rather than letting it be set and ignored.
- Paint: fill, stroke, radius, shadow, clip.
- The binding picker, scoped per §3.6.
- `locked` per §3.8.

The properties panel is already the largest component in the app. This phase is
where it gets reorganised around the frame tree rather than having controls added
to it — which is the mistake §1 describes.

---

## Phase 8 — Delete the old path · **S**

**The release after the one that converts**, never the same one. A block
published to R2 is read by every shop.

Remove: `PriceMarkRecipe` and its presets, the compass and nudge, `MarkSatellite`,
`MarkCurrency`, the mark's shape kit and colour slots, the `chip` element, the
`logo` kind, `groupId`, and the RTL mirror transform in `resolveBlock`.

`price-mark.ts` should end at roughly 150 lines: split an amount to its currency's
precision, and set a raised fils on the major's cap line.

**Exit:** the deletions table in §4 is all crossed off, and the line count is
lower than it was before Phase 1.

---

## What can run in parallel

- **Phase 1 and Phase 0** — different people, no shared files.
- **Phase 3 and Phase 2** — paint and layout do not touch each other. §2.4's
  rule that effects never affect measurement is what makes this true.
- **Nothing else.** Phases 4 through 8 are a chain, and each one's exit criteria
  is the next one's input.

## What would make me stop

- **Phase 0.1 finds no measurer that agrees and no willingness to ship numbers
  from the server.** Then `hug` is not buildable and the epic is a different,
  smaller one about the data map.
- **Phase 4's grid card needs a third layout mode.** Not fatal, but it changes
  §2 and everything after it, and it should change the design before it changes
  the code.
- **Phase 5's diff is not byte-identical and the difference is not explainable.**
  A converter that silently moves things is worse than no converter.
