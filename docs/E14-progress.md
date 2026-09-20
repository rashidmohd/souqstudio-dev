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
| 7 — Designer UI | Not started |
| 8 — Delete the old path | Not started |

`pnpm lint`, `pnpm typecheck` and `pnpm test` are green: **1,462 tests**, up from
1,349. `pnpm build`, `check:classes`, the gallery diff and `export:check` pass.

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
