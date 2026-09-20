# E14 — progress

What is built, what it changed, and what the next person needs to know. The plan
is `docs/E14-implementation-plan.md`; Phase 0's answers are
`docs/E14-phase-0-findings.md`.

| Phase | State |
| --- | --- |
| **0 — Prove the three risky things · GATE** | **Done. Gate passed.** |
| **1 — The data map** | **Done. Ships alone.** |
| 2 — Frames in the engine | Not started |
| **3 — Paint** | **Done.** |
| 4 — Three blocks by hand · GATE | Not started |
| 5 — The converter | Not started |
| 6 — Regenerate the seeded library | Not started |
| 7 — Designer UI | **Paint controls built** — frames are Phase 2's |
| 8 — Delete the old path | Not started |

`pnpm lint`, `pnpm typecheck` and `pnpm test` are green: **1,526 tests**, up from
1,349. `pnpm build`, `check:classes` and `export:check` (11/11) pass. The gallery
is byte-identical apart from two files, both `blk_post_split`, where a static
placeholder became a real binding.

---

## Phase 0 — answered, and it changed the plan

Full write-up in `docs/E14-phase-0-findings.md`. The four things that change what
follows:

1. **There is a text measurer, so the fallback is not needed.** Word-segmented
   HarfBuzz matches Chromium's canvas at **0.000% through p99** on both scripts
   across 1.1M measurements. `estimateWidth` is off by **5–40% at the median** —
   not "slightly wrong", unusable for `hug` at any tolerance.
2. **Self-hosting the brand-kit fonts is now on E14's critical path.** It was
   E9's. A HarfBuzz measurer needs the font *file*, not a CSS link.
3. **`fill` gains `span`/`tracks` in Phase 2.2**, rather than `Layout` gaining a
   third mode. Nested rows express a spanning grid exactly — but only at weight
   `2 + g/t`, and that number silently rots when the gap is edited.
4. **§2.4's gradient row is overstated and §8's ring-count question is closed.**
   A gradient with alpha stops emits a vector shading pattern plus a page-sized
   soft mask; the page's text survives. It stays banned. A page of 24 ringed
   bursts at 300 dpi is 1,992 paths, 274 kB, zero rasters — no cap needed.

New in the repo: `packages/engine/src/shadow.ts` (+15 tests) and
`pnpm --filter @souqstudio/engine export:check`.

---

## Phase 1 — what it actually found

The plan lists six tasks. **The test in 1.6 found three more holes that the plan
did not know about**, which is the whole argument §3.5 makes.

### One resolver, not two

`draw.tsx` and `harness/svg.ts` each carried their own `switch` over
`TextSource`. They both answered `shop.address` and `shop.phone` with `''`, and
they "agreed with each other and with nothing else". Both now delegate to
`resolveTextBinding` in `packages/engine/src/bindings.ts`, and each keeps only
its own adapter — where that surface's fallbacks live.

### What was declared and drew nothing

| Binding | On the plan? | Now |
| --- | --- | --- |
| `shop.address` | yes, 1.1 | `shops.location` |
| `shop.phone` | yes, 1.1 | `shops.phone` |
| `product.origin` | **no** | `catalog_products.originEn` / `originAr` |
| `product.packSize` | **no** | `packLabel()` over the pack columns |
| `offer.prefix` | **no** | was `''` in the harness by choice, now real |
| `offer.unitPrice` | **no** | same |

The three unplanned ones had been in `TextSource` since `TextSource` existed.
Nobody had noticed, and nothing would have.

### New in the vocabulary

`offer.price`, `offer.saveAmount`, `offer.savePercent`, `brand.name`,
`book.title`, `book.validFrom`, `book.validTo`, and `image` bound to
`brand.logo`.

**`offer.price` is not on the plan's Phase 1 list either**, and it is here
because §3.3 declares it and 1.6's test walks §3.3. Under frames a price is an
ordinary bound line; the fils stays inside the run, because it is kerning.

### The tests

- `packages/engine/src/bindings.test.ts` — 53 tests, walks the vocabulary and
  renders through the harness painter.
- `apps/web/components/blocks/draw.test.tsx` — 27 tests, the same walk through
  the app painter. **Both are needed**: two painters is exactly why one was not
  enough.
- Both **iterate** rather than listing cases, and both were checked against a
  deliberately reintroduced defect: unwiring `shop.phone` fails 5 assertions.
- `document.ts` gains a compiler-side mirror check over `TextSource`, matching
  the one guarding `arrangementsSchema`.

### Schema

`packages/db/prisma/migrations/20260920160000_offer_period_and_identity_pin/`

- `offer_books.validFrom` / `validTo` — `date`, deliberately not `expiresAt`,
  which is when the share *link* expires.
- `blocks.identityPin` — `inherit | organization`, §3.2's mode. Defaulted, so it
  deploys ahead of the code that reads it.

**Not applied.** It is written and the client is generated; running it against
the Railway dev database is a call for whoever owns that database.

### The gallery diff

172 renders byte-identical, 64 changed — **every one of them a block carrying a
logo, and in every one the only difference is the placeholder's label.** The
geometry is identical, which is what makes the `logo` → `image` conversion exact.

The gallery also **caught a design defect the tests could not**: folding `logo`
into `image` put every mark into the packshot's light grey box, and a mark sits
on a footer's ink band or a hero's tint almost every time. Same box, same
geometry, different palette.

### Converting stored blocks

`pnpm --filter @souqstudio/db blocks:convert-logo -- --dry-run`

Dry run against the dev database: **85 blocks read, 38 carry a logo** (32 seeded,
6 owner-authored), 47 already clean, none failed to validate. Idempotent, and it
refuses to rewrite a document it could not parse.

**Not run for real**, for the same reason the migration was not applied.

---

## What the next person should know

- **The `logo` kind is still renderable**, in both painters and in the schema.
  It is deleted in Phase 8, a release *after* the one that converts, because a
  block published to R2 is read by every shop.
- **`isBound` in `block-edit.ts` deliberately excludes `brand` and `book`.** It
  answers "does this need a product in scope", and widening it would put a
  warning on every seeded header and footer — which the loader refuses.
  `docs/block-library-from-r2.md` §12.
- **A font fallback policy is owed.** Between 19 and 125 catalog strings per face
  are in scripts the face does not cover; Chromium silently falls back and the
  export worker has no system fonts. `hug` makes it visible rather than causing
  it.
- **`Shadow` has no alpha field.** `FlatColor` carries none and `opacity` is the
  wrong control, so `SHADOW_PEAK` is a constant. Whether a shop may set it is
  undecided.
- **A second copy of the savings arithmetic** lives in `lib/preview-offer.ts`.
  Deliberate — the composer reads a `Decimal` off a row and the preview reads a
  number off a literal — and the shared rule is asserted in both.

---

## Phase 3 — paint, and the one thing it could not afford

Four parts, all four landed: an optional fill, an outline on text, a cast
shadow, and a lint rule for the effects that rasterize.

### What can now be expressed

| | Before | Now |
| --- | --- | --- |
| Outline-only shape | impossible at any setting | `fill` is optional on `shape` |
| Outline on text | impossible | `stroke` on the text element |
| Cast shadow | impossible | `shadow` on shape, text and image |

`Shadow` lives in `@souqstudio/types` beside `Stroke`; `shadowRings` in the
engine is the expansion and **both painters call it**, which is the rule §2.4
sets and the reason the file exists.

**The gallery is 236/236 byte-identical.** Every change is additive and no
seeded block carries any of it. One near-miss: refactoring the text painter
moved `fill` after `text-anchor` in the emitted SVG — visually identical, not
byte-identical, and the diff caught it.

### The measured decision: a text shadow must be hard

**A glyph has no box to expand.** A shape's ring is one path; text's ring is the
string again under a wider stroke — and Chromium *outlines* stroked text into
explicit path geometry on the way to a PDF.

| rings | 1 | 2 | 4 | 8 | 16 | 27 |
| --- | --- | --- | --- | --- | --- | --- |
| PDF | 34 kB | 61 kB | 108 kB | 205 kB | 396 kB | **663 kB** |

Linear, ~24 kB a ring, **for one element** — 26,385 curve operators for a single
softly-shadowed price. Twenty-four ringed *bursts* together come to 274 kB.

So `text.shadow.blur` must be 0. A hard shadow is one copy, costs ~24 kB, and is
what a retail "SAVE 20%" actually wears. A soft one is unavailable on text by
any vector means, and the non-vector means is the single disqualifying result in
`export-check.ts`. **Refused at the schema rather than clamped**, so a block
cannot store one thing and render another; `HardShadow` says the same in the
type, and the two-way mirror check is what caught them disagreeing.

**§2.4 should absorb this.** It specified shadows on text without saying how a
glyph expands, and the stroke-growth answer is the only vector one.

### The lint rule, and why it shipped inert the first time

`feGaussianBlur`, `feDropShadow` and `drop-shadow()` are refused as strings, as
template literals and as JSX.

**It caught nothing at first and the tests are why that is known.** Two traps,
both worth recording:

1. **`no-restricted-syntax` is declared twice.** An override for
   `**/*.{ts,tsx}` *re-declares* the whole rule rather than adding to it, so
   anything added to the base `rules` alone is inert for every file it matches
   — `components/blocks/draw.tsx` included, which is the one file that matters.
   The entries are spread into both arrays now.
2. **esquery does not survive a top-level `|`** in an attribute regex. An
   unwrapped alternation compiles to a selector that silently matches nothing.
   Every alternation in that file is parenthesised for this reason.

**Gradient alpha stops are deliberately not linted.** §2.4 banned them on a
reading `export-check` later corrected, `stop-opacity` is a documented feature of
`GradientStop`, and its value is a runtime number — a rule there would flag
correct code and still miss the case. `export-check.ts` measures it instead.

### Still owed

- **No designer controls.** Phase 3 is the model and the painters; the paint
  panel is Phase 7. An owner cannot yet *set* a shadow or an outline — a seeded
  or API-authored block can carry one and both painters draw it.
- **`packages/engine` is not linted at all**, so `harness/svg.ts` is covered by
  `export:check` rather than by the rule.

---

## After Phase 3 — what using it found

Everything below came out of the designer being *looked at* rather than tested.
It is recorded as its own section because the pattern matters more than the
individual fixes: **nine defects, and the tests were green through all of them**,
because every one was about what the sample data contained or what a control was
wired to rather than about painter logic.

The method that found them: render the real painter to an SVG in a throwaway
test, rasterize it through headless Chrome, and look at the picture. Cheap, and
it works without booting Next or logging in.

### The vocabulary was reachable from nowhere

Phase 1 made twenty bindings resolve and draw. Three things still could not
reach them:

- **The designer's binding picker was a literal list** and offered eleven of the
  twenty. `offer.price`, both save fields, `brand.name` and all three `book.*`
  were resolved in both painters, drawn on a card, and unselectable.
- **`parseSource` would have ignored them anyway** — it parsed `from:field`,
  cast per source, and returned the *current* source for anything it did not
  recognise.
- **Images had no "Shows" control at all** while text did, so a placed logo
  could not be identified or rebound.

Fixed at the cause: `BINDING_LABEL`, `bindingKey` and `labelFor` in the engine,
one table, with `bindings.test.ts` asserting every binding in `TEXT_BINDINGS` has
an entry. The picker, `parseSource` and the layer list are all built from
`TEXT_BINDINGS` + `bindingInScope`, so none can fall behind again.

### `shop.*` drew white on white

`draw.tsx` decided a text's ink from **what it was bound to**:

```ts
const onTint = element.source.from === 'static' || element.source.from === 'shop'
```

A shop-bound line was assumed to sit on a tinted band and painted in the surface
colour. On a plain card that is invisible — and `brand.name` and `book.*` were
not in the list, which is exactly why those rendered and the shop fields did not.

**The library was already arguing with the rule**: most `shopField` calls passed
`color: 'ink'` explicitly to escape it. The six that relied on the white now say
`color: 'surface'`, `shop` is out of the heuristic in both painters, and the
gallery came back 236/236 byte-identical — which is what proves the six colours
were right.

### Things that were working around the bugs

- **A seeded block had a static "Your phone number"**, with a comment saying
  neither painter resolves a shop's phone. Now bound. It is the only gallery
  change in the whole epic so far.
- **A test had the bug written down as a rule.** `library.test.ts` asserted a
  seeded block may bind only `product.name`/`spec`/`brand` and `shop.name` —
  because the rest drew nothing. Rewritten to assert the real invariant: the
  binding exists, and it is in scope for that block's `repeats`.

### The canvas had nothing to lay out

An element bound to a field the sample left empty drew **nothing** — no text to
size, break or align against. `product.origin`, `product.packSize`,
`offer.prefix`, `offer.unitPrice` and the whole `book` subject were in that
state, and the logo was worse: the palette still made the dead `logo` kind, and
a shop with no logo drew no box at all.

- Samples carry a value for every text binding.
  `artboardIdentity({ samples: true })` fills empty shop and book fields **on the
  designer only** — a test pins that a real book still gets empty strings,
  because an invented address under a real shop's name is a lie a customer could
  act on.
- `FREE_ELEMENTS.logo()` makes an `image` bound to `brand.logo`. Phase 1
  converted the seeded library and all 38 stored blocks and **missed the thing
  that creates new ones**.
- A shop with no logo gets a **reserved slot**, which answers §8's open question
  about what a missing logo draws. An element that cannot be seen cannot be
  positioned.
- The canvas sample carries the packshot. The argument for leaving it null was
  that an absent photo draws a visible, sizeable box — true of *sizing*, false
  of *composition*. The stress panel strips the image deliberately and is the
  surface that shows the hole.

`apps/web/CLAUDE.md` decides the shape of that fix: *bound components render
sample data, never field names*. The test asserts the label is **not** drawn.

---

## Phase 7's paint controls, built early

The model shipped in Phase 3 and nothing could set any of it. Three controls,
and each was asked for by someone who could not do the obvious thing.

| Control | What it unblocked |
| --- | --- |
| **Fill → None** | An outline-only shape. `ColorControl` could only ever *set* a colour. |
| **Border** | `Stroke` had been in the type for two epics with no control. |
| **Shadow** | Phase 3's model, unreachable. |

- **"None" is only offered where absent means nothing drawn.** `undefined` means
  *automatic ink* on a text colour and *no fill* on a shape, so `ColorControl`
  takes an `onClear` callback rather than a flag — a caller can only offer None
  where None is true.
- **Turning a border or shadow off removes it** rather than zeroing the width or
  going transparent. A zero-width border is a colour nobody can see attached to
  an element claiming to have one.
- **Every value is a percent of the card**, via `lib/percent-field.ts`. The
  `NaN` guard is the reason it is shared: `Number('')` is 0 and `Number('abc')`
  is `NaN`, both of which a number input hands over, and `NaN` passes straight
  through `Math.min`/`Math.max` into a document the schema then refuses.
- **The shadow offsets are "Across" and "Down"**, not left and right. A shadow
  is light direction and never mirrors — §5.5 — so the words describe the
  artboard rather than the reading order.
- Text gets an **Outline** and a **hard** shadow, with no softness field.

### The bug rendering found

**A shadow on an outline-only shape showed through the hole.** The rings are
filled copies of the shape, which is right while it is filled and visibly wrong
when it is not — a hairline rule box came out a solid grey panel.

What casts a shadow is whatever draws, so on an unfilled shape each ring is now
the grown path **stroked** rather than filled. Constant alpha accumulates the
same way §2.4 derives, `blur: 0` gives one offset outline, and a shape with
neither fill nor border casts nothing. Both painters, three tests.

---

## New block, and the rule it bends

`E7-pending.md` §8 and `composition-model.md` §3.6: *always seed* — there was
deliberately no "new blank block", and `POST /api/v1/blocks` had no branch for
one *"so the rule is structural rather than a convention the next screen can
forget."*

That rule is right about **blank** and was wrong about **new**: an owner who
wanted a footer of their own had to take somebody else's, rename it and delete
its contents.

So there is a third branch, and it is **not** an empty artboard. `starterBlock`
returns the smallest block of its kind that already reads as one — every element
bound, nothing decorative, nothing to undo — and the dialog says what will be on
it *before* making it. `starter.test.ts` holds all five to the shipped-block bar:
`validateBlock` returns **zero** problems, every binding is in scope, both
languages on every typed line, and the repeating card designs all four merge
shapes.

**There is still no branch that creates an empty block**, and there should not
be.

Rendering the five found the last defect of the session: the panel starter's
headline was **white on white**, because `static` is still in the `onTint`
heuristic. Worked around with an explicit colour, and the comment says it is a
workaround.

---

## What is owed

- **Phase 2 is the next real work** — frames, the solver, and the HarfBuzz
  measurer Phase 0.1 settled. Nothing after it is startable.
- **`static` is still in the `onTint` heuristic**, so a "Text you type" element
  on a light card is white on white. `shop` came out; `static` has 81 seeded
  call sites and needs the library to move with it. The right answer is deciding
  ink from what is *behind* the text — `readableInkOn` exists — but the painter
  draws one element at a time and has no sibling in scope. It belongs where the
  block is resolved.
- **The brand-kit fonts are still not mirrored to R2.** Phase 0.1 put this on
  E14's critical path; `pnpm --filter @souqstudio/web fonts:mirror -- --dry-run`
  is written and has never been run for real.
- **A font fallback policy is owed** — 19 to 125 catalog strings per face are in
  scripts the face does not cover.
- **No shadow opacity.** `FlatColor` carries no alpha and `opacity` fades the
  element with its shadow, so `SHADOW_PEAK` is a constant.
- **Nothing has been run in the real app.** Everything here is verified by
  types, tests and rendered SVGs.
