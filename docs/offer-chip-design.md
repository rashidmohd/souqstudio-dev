# The offer-type badge

*A design note and a plan of record. Written 22 September 2026.*

**The question that started it:** a shop owner wants to design their BOGO badge.
They cannot. This note says why, what measuring the seeded library found, and
what to build — in three parts, the first of which is small and ships alone.

It also records one idea that the measurement **killed**: defaulting a mechanic
to a shape.

---

## 1. What is automatic today, and what is not

**The words are automatic, and that is working.** An owner never types
"Buy 1 get 1 free". Two paths write it for them, both from the closed set in
`lib/offer-types.ts`:

| Path | What happens |
| --- | --- |
| Editor — `OfferTypeField` | sends a *key*; `PUT .../offers/:id/type` looks the bilingual phrase up and writes one `offer_chips` row of kind `SCALE`, anchored `TOP_START` |
| Price list import — `PriceListMatcher` | the type column runs through `readOfferType`, which already reads `BOGO`, `BOGOF`, `b1g1`, `1+1` and `buy one get one`, and the chip is attached to the matched row |

A `PUT` rather than an append, so a second mechanic replaces the first: an offer
has one mechanic and a card cannot print buy-1-get-1 over buy-2-get-1. That is
`SCALE` doing the work of a column that does not exist.

**The look is not automatic, and it is not designable either.** The block
carries one `chip` element, and `draw.tsx` treats it as the *tier's* slot: the
tier draws in the box the designer gave it, and every other chip — the mechanic
included — stacks below it one box-height apart. The stacked rows take
`ctx.token('secondary')`, hard-coded. So of the four controls the card designer
offers on a chip:

- **position** and **shape** reach the mechanic (it inherits the slot's x, its
  width and the element's shape),
- **label colour** reaches it,
- **badge colour** does not. `element.fill` is read for the tier row only.

The painter already knows which row is the mechanic — `isOfferType` is composed
onto every chip in `offer-book-compose.ts` — and never reads it. That one unused
boolean is most of the fix.

---

## 2. What the seeded library actually carries

Measured across all 66 seeded blocks, every arrangement:

| | |
| --- | --- |
| Blocks carrying a `chip` element | **24** of 66 (26 are offer cards) |
| `chip` elements across arrangements | **75** |
| Elements setting `shape` | **8**, all of them to `none` |
| Elements setting `fill` | **0** |
| Anchors | 57 `TOP_START`, 12 `INLINE`, 6 `TOP_END` |
| Slots wider than 2:1 | **53** of 75 |

Two things follow.

**The shape control has never been used.** Not one seeded block asks for a
burst, a ribbon or a tag; the 67 that do not say `none` are all taking the
`?? 'pill'` default. Four shapes are offered, one ships.

**Nor has the colour control.** All 75 take the tier's own colour. So the badge
an owner sees on a fresh card is a pill in the tier colour, everywhere, and the
mechanic is a second pill underneath it in the chrome's secondary tone.

---

## 3. Two defects the measurement found

**The gallery has never drawn a mechanic badge.** `harness/svg.ts`'s `chip()`
reads `product.tier` and nothing else — the harness has no concept of an offer's
chips, so the stack, the mechanic row and its colour have never appeared in the
one renderer whose whole job is to be looked at. Per CLAUDE.md the gallery is
"the only check that finds a design defect as opposed to a correctness one", and
this is outside it.

**The two painters disagree about square badges.** `CHIP_FIT.burst.square` is
`true`. `draw.tsx` honours it — `width = fit.square ? box.height : …` — and the
harness does not: it fills the whole rect with `rounded(rect, …)` /
`shapePath(path, rect, …)`. The same document draws a squat square badge in the
app and a stretched one in the gallery. Nothing catches it because nothing sets
`shape: 'burst'`.

A third is latent in `draw.tsx` alone: the label size is fitted to `box.width`,
but a square badge is drawn only `box.height` wide. On a typical 0.34 × 0.09
slot, "Buy 1 get 1 free" would be set about **twice** as wide as the burst
containing it. Invisible today, because no block asks for a burst.

**And a fourth, which is not latent at all — it is on every BOGO card in
production.** The badge is allowed to grow to twice the slot's width:

```ts
const size  = Math.min(box.height * fit.height, (box.width * fit.width) / (label.length * 0.56))
const width = Math.min(box.width * 2, Math.max(box.width * 0.5, ctx.measure(label, size, '') + padding))
```

The *width* ceiling is `box.width * 2`. The *size* ceiling is `box.width`. So the
type is sized as though the badge could only ever be one slot wide, and then the
badge is widened to fit type that has already been shrunk. The room the second
line grants, the first line has spent.

On a 0.34 × 0.09 slot, against a tier badge reading "Deal":

| Label | Set at | Could be | Badge width used |
| --- | --- | --- | --- |
| `Deal` (4) | 0.0468 | 0.0468 | 0.180 of 0.68 available |
| `Buy 1 get 1 free` (16) | 0.0326 | 0.0468 | **70%** of the size it could be |
| `اشتر 1 واحصل على 1 مجانا` (24) | 0.0218 | 0.0435 | **50%** — the Arabic edition is worse |

The tier is short, so it hits the *height* cap and is set at full size. The
mechanic is long, so it hits the *width* cap and is set small. The result is the
inversion in the screenshot that prompted this note: **"Deal", which carries no
information, is the loudest badge on the card, and the promotion is a grey line
of small type underneath it.** Raising the size ceiling to the width the badge
may actually occupy is a one-line change and sets the mechanic at the same size
as the tier.

It is not purely mechanical, though: the badge then draws about 1.45 slot-widths
across instead of 1.01, and a corner badge overhangs its block by design
(E6 §7). Worth looking at in the gallery — which is step 0 below — before it is
called done.

**Both are fixed, and looking at it in the gallery found a fifth.** A
start-aligned badge sat at `box.x` and grew to the right in *both editions*.
That is correct in English and backwards in Arabic: the badge grows away from
the corner it is anchored to and off the edge of the card. `resolveBlock` had
already mirrored the box, and the comment in the painter said the stack was
therefore direction-neutral — which is true of the stacking and false of the
growth.

It had been latent for the same reason as the others: a badge that only ever
reached 1.01 slot widths has nothing to grow *with*. Raising the size ceiling
made it visible immediately, on the first Arabic card the gallery had ever drawn
a mechanic on. This is the class of defect CLAUDE.md says the gallery exists to
catch, and it is the argument for step 0 below in one picture.

---

## 4. What not to build: a shape per mechanic

The first idea was to give each row in the vocabulary a look — `bogo` draws as a
burst, say — so a mechanic arrives already designed.

**The measurement kills the shape half of it.** 53 of 75 slots are wider than
2:1, and the library's own geometry expects a pill: 0.34 wide by 0.09 tall is a
lozenge in a corner. A burst holds its proportion by design, so defaulting BOGO
to one would draw a badge a quarter of the reserved width in 53 places, and —
until the fit bug above is fixed — hang the label out of both sides of it.

A mechanic's shape is a property of *the slot it lands in*, which the block
author chose. The vocabulary does not know the geometry and must not guess it.

**Colour survives the objection**, because colour has no geometry.

---

## 5. The proposal

### Part A — let the mechanic be designed. Ships alone.

The chip element gains two optional fields beside `fill` and `ink`:

```ts
mechanicFill: flatColorSchema.optional()
mechanicInk:  flatColorSchema.optional()
```

`draw.tsx` splits its rows on `isOfferType` — already on the wire — and paints
the mechanic row with those, falling back to exactly what it draws today. Note
chips ("Limit 2 per customer", "Product of UAE") keep `secondary`, which is the
distinction the existing comment argues for and is right: a promotion and a
piece of small print are different kinds of statement.

`ElementProperties` gains one control group under the existing two, and the
designer can colour a BOGO badge. Absent both fields, every stored and published
block draws the pixels it draws now.

### Part B — a default worth having. Needs Part A.

A shop that never opens the designer should still get a red BOGO rather than a
grey one. Each row in the vocabulary gains a `tone`, drawn from `TIER_TOKENS`.

**This forces the table to move.** `--sq-tpl-*` names are refused in application
chrome by `packages/config/eslint.design.cjs`, and `apps/web/lib` is not on its
exemption list — which is precisely why `TIER_TOKENS` lives in
`packages/types/src/promo-tier.ts` and says so in its own header. So
`OFFER_TYPES` moves to `packages/types/src/offer-type.ts`, beside it. The
importer, the route and the editor import it from `@souqstudio/types`.

The token then travels to the painter **as data**, on `ComposedChip.tone`,
exactly the way `tierToken` already does — so `draw.tsx` writes
`var(${chip.tone})` and holds no template token of its own. The lint rule is
satisfied by the shape of the solution rather than by an exemption.

The same closed list as the tiers, deliberately: a mechanic badge that comes out
sand on one account and navy on another stops reading as a discount. A `custom`
mechanic takes the tone too — the slot has a look regardless of whose words fill
it.

**The screenshot raises a question Part B does not answer.** On a card that has
a mechanic, the tier badge is the redundant one: "Deal" above "Buy 1 get 1 free"
says nothing the second line does not say better. Colouring the mechanic red
leaves two loud badges stacked in one corner. The honest answer is probably that
**the tier yields when a mechanic is present** — which is Part C's territory,
because it is a question about what a chip slot carries rather than about what
colour it is. Do not settle it inside Part B.

### Part C — where the mechanic sits. Still open.

The stack is hard-coded in the painter. `docs/E6-pending.md` §6 raised the
alternative and left it: a `chipStack` element kind, "the block designer's
question". Having now measured the library, the better shape for it is a
`carries` field on the chip element — `'tier' | 'mechanic' | 'notes' | 'all'`,
defaulting to `'all'` — so a block can place a tier pill at `TOP_START` and a
BOGO badge across the packshot, each with its own box, shape and colour.

It also fixes something latent: two `chip` elements on one block today both draw
the whole stack, tier included, and nothing forbids that. With `carries`, the
`badges` count in `validateBlock` narrows to tier-carrying chips and
`duplicate-tier` keeps meaning what it says.

Part C is an architecture decision and is raised rather than taken.

---

## 6. Build order

**Step 0 and the fit defects are done.** 22 September:

- `layoutChipStack` in `packages/engine/src/shapes.ts` is now the one piece of
  badge arithmetic, and both painters call it. The stack, the fit, the growth and
  the square case were each written twice and disagreed; they are written once.
  The move `layoutPriceMark` made, and for the reason `packages/engine/CLAUDE.md`
  gives: rules checked only by eye, in two copies, are rules that drift.
- The size ceiling is the width the badge may occupy. A mechanic is now set at
  the same size as its tier instead of 70% of it, and 50% in Arabic.
- A square badge fits its label to its own width rather than to the slot's.
- A start-aligned badge grows inward from the start edge in both editions.
- `harness/svg.ts` draws the stack, and `HarnessProduct` carries a `mechanic`, so
  the gallery shows a BOGO badge at every shape and in both editions. Three of the
  fixture rows carry one — a minority, or the gallery stops showing what a card
  looks like without one.
- Ten tests in `shapes.test.ts`. The tier's badge is pinned, because the point is
  that short labels draw exactly as they did and only long ones improve.

What is left:

1. **Part A** — the schema in `packages/engine/src/document.ts`, both painters,
   one control group in `ElementProperties`. No migration, and no second schema
   to keep in step: `lib/block-document.ts` is a re-export of the engine's now,
   so the route, the committed file and the R2 object are all validated by the
   one definition.
2. **Part B** — new `packages/types/src/offer-type.ts`, importer and route
   re-pointed, `ComposedChip.tone` in the composer, one line in each painter.
3. **Part C** — its own note, after the first two have been seen in the gallery.

**Guardrails.** Neither A nor B adds a `validateBlock` warning, so the
publish-then-deploy rule in CLAUDE.md is not triggered; Part C does, and is. And
nothing here introduces a `switch` on `'bogo'` — the property `offer-types.ts`
asks every caller to preserve. Adding a mechanic stays one row.

---

## 7. One unrelated thing the measurement turned up

**`emphasis` is a dead field.** `PromoTier.emphasis` is written at signup,
validated by both promo-tier routes, chosen in `/brand` and labelled to the
owner as "Loud — bids for the big spaces". Nothing reads it. `minEmphasis` is
declared once in `packages/types/src/index.ts` and has no consumer, and no
painter scales a badge by it. Either wire it or stop offering it; a control that
promises a louder badge and changes nothing is worse than no control.
