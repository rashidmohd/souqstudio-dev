# E14 — Frames: layout the block designer never had

**Status: proposed. No code written.** This is the design to argue with before it
costs anything.

*Revision 5. Changes from r4: §2.4 says where the ring expansion lives, §7 adds
the export regression harness and the filter lint rule, and the task breakdown
moves to `docs/E14-implementation-plan.md`.*

*Revision 4. Changes from r3: §2.4's shadow subsection is rewritten around a
measured result. Soft shadows are fully vector, built from concentric rings, and
the rasterization cost r3 tried to price does not have to be paid. Two claims in
r3 were wrong and are corrected there: a filter's resolution is not reachable
from `s`, and the gradient fallback rasterizes the whole page. Both r3 open
questions on shadows are closed; one new one.*

*Revision 3. Changes from r2: §2.4 adds paint — optional fill so a shape can be
outline-only, stroke on text with the `paint-order` rule, and a shadow model that
separates hard shadows (vector, free) from soft ones (rasterized, and costed
through §5.2's scalar). Two new open questions in §8.*

*Revision 2. Changes from r1: the model gained min/max, fill weights, aspect
ratio, baseline alignment, canvas stacking, clipping and direction; §5 is
rewritten around a design size and a single scale factor, which removes the fit
ladder's loop; §8 has six fewer open questions and four new ones; §9 records the
prior art the decisions rest on.*

---

## 1. What is wrong

A block is a flat list of elements, each positioned absolutely as a fraction of
the block. There is no layout. Grouping exists and does exactly one thing —
select together — and `groupId` is read in two places, both about selection. The
engine never sees it.

Everything the product does about *relationships between elements* is therefore
special-cased inside one element. The price mark is that element, and by now it
carries: eight recipe presets, a nine-point compass with a bounded nudge per
part, a shape kit for its own background, twelve colour slots, a currency with
its own size, gap and alignment, and a fit ladder that shrinks the whole
assembly. All of it exists because two things needed to sit next to each other
and reflow, and nothing in the engine could express that.

The cost is visible from the outside. Asked how to recolour the star behind a
price, the answer is *"open the price element, scroll to Colour each part,
Ground fill"* — a control buried inside another object, for a shape the owner is
looking straight at. The owner's instinct is to click the star. They are right.

The same question in its most ordinary form: *"I mapped currency and price, I
grouped them, now give the group a background colour, a border and a corner
radius."* Today that is not possible at any price. A group draws nothing. The
only background available behind a price is the one inside the price mark's own
shape kit, which is why that kit exists. One sentence, and it is the whole
argument for this epic.

**The general mechanism was asked for on 8 September** and is quoted in
`E7-pending.md` §8: *"fundamentally not what I want. I want something like a
small Figma or Illustrator — the user designs their own template."* That round
opened up colour, size, shapes, rotation, multi-select and uploads. It did not
build layout, and every price-mark control added since has been working around
its absence.

---

## 2. The model

Three ideas, and nothing else is new.

**A frame is a group that lays its children out.** It replaces `groupId`.

**Sizing is per axis, three values.** `fixed`, `hug` (shrink to content), `fill`
(expand into the parent). This is Figma's model, and it is chosen because three
composable values cover the cases rather than a list of behaviours that grows
whenever somebody meets a new one.

**Data binding stays orthogonal.** Any text binds to any field. It already
does — `TextSource` — and it does not need to know about layout.

```ts
interface Frame extends ElementBase {
  kind: 'frame'
  children: BlockElement[]
  layout: Layout

  /** A frame draws. This is what makes "the star" a frame rather than a sibling,
   *  and it is what makes "give my group a background" a two-field answer. */
  shape?: 'rect' | PathShape | undefined
  /** Optional — absent is outline-only. See §2.4. */
  fill?: ColorValue | undefined
  stroke?: Stroke | undefined
  /** Design units, never a fraction. See §2.2. */
  radius?: number | undefined
  /** Clip children to the frame's shape and radius. Default false. */
  clip?: boolean
  /** Paint, never layout. See §2.4. */
  shadow?: Shadow | undefined
}

type Layout =
  /** Children keep their own boxes. Exactly today's group. */
  | { mode: 'free' }
  | {
      mode: 'row' | 'column'
      /** Design units. */
      gap: number
      padding: { start: number; end: number; top: number; bottom: number }
      /** Along the direction of flow. Mirrors under RTL only when the flow
       *  axis is horizontal — see §5.5. */
      justify: 'start' | 'center' | 'end' | 'between'
      /** Across it. Never mirrors. */
      align: 'start' | 'center' | 'end' | 'stretch'
      /** Row only. Align text children on their baselines rather than their
       *  boxes. A frame-level toggle, not a value of `align`. */
      baselineAlign?: boolean
      /** Flow order is not paint order. `false` (default) paints last on top. */
      firstOnTop?: boolean
    }

interface ElementBase {
  id: string
  box: Box            // read when the parent is `free`, or for the root
  width: Sizing       // read when the parent is `row` or `column`
  height: Sizing
  /** Composable with any Sizing, including hug and fill. Design units. */
  minWidth?: number; maxWidth?: number
  minHeight?: number; maxHeight?: number
  /** Images only for now. Applied only when at least one axis is flexible —
   *  on a fully fixed element the ratio re-derives the cross axis and fights
   *  the solved size over rounding. */
  aspect?: 'fit' | 'cover' | number
  /** 'inherit' is the default and is right almost everywhere. See §5.5. */
  direction?: 'inherit' | 'ltr' | 'rtl'
  /** Excluded from the auto flow, positioned by `box` against the parent,
   *  exactly as a child of a `free` frame. See §2.3. */
  ignoreLayout?: boolean
  // rotation, opacity, locked — unchanged
}

type Sizing =
  | { kind: 'fixed'; value: number }
  | { kind: 'hug' }
  /** `weight` divides the parent's free space, flex-grow style. Default 1. */
  | { kind: 'fill'; weight?: number }
```

Two validity rules, copied from Figma because they remove a class of nonsense
states from the designer UI before it is built:

- `hug` is valid only on frames and text elements.
- `fill` is valid only on a child of a `row` or `column` frame.

### 2.1 The owner's examples, mapped

> *"I drag a shape and text, I group them, the shape grows to fit the text."*

A frame with `shape: 'star'`, a fill, padding, `width: hug`, `height: hug`, and
one text child. The star **is** the frame. Recolouring it is selecting it and
setting its fill — which is the question that started this.

> *"Currency and price, gap 5, price grows from right."*

A `row` frame, `gap`, `justify: 'end'`, `width: hug`, holding two texts — one
bound to `currency`, one to `price`. A longer price makes the row wider and it
extends to the left, because the row is anchored at its end.

That last sentence is the whole reason this is worth doing. It is the same
problem that produced the compass and the nudge, and the compass never actually
solved it: it let an owner say *where a part sits* and not *what happens when the
digits change width*. A row with a gap says both, in two fields, for every
element rather than for three named ones.

> *"Background, border and radius on that group."*

`fill`, `stroke`, `radius` on the frame that already holds them. Hug plus
padding is what makes the background wrap the numbers rather than being a box
somebody resizes by hand. Put the decoration on whichever frame you want the
border around: a column frame holding a was-price above the currency/price row
takes the border for the whole mark; the inner row takes it for the number
alone.

### 2.2 Units

**Every spatial value in a frame is in design units** — `gap`, `padding`,
`radius`, `stroke`, `min`/`max` — and never a fraction of the frame.

A fraction is circular. In a hugging row the frame's width is children plus
gaps; if the gap is a fraction of that width there is no fixed point. The same
defect makes a hugging frame's corners change shape as the price gets longer.
Design units are defined in §5.1 and they are stable.

`box` stays fractional. It is read only for the root and inside `free` frames,
where the containing size is known before anything is measured.

### 2.3 Strokes and the escape hatch

**A stroke is drawn outside the box and excluded from measurement.** This is a
choice, not a law — Figma exposes it as a toggle — and it is made this way
because it matches how a designer thinks about a border and because the
alternative compounds through nested frames in a way that is visible in print. If
something needs the other behaviour it becomes a toggle then.

**`ignoreLayout` is kept.** It is Figma's *Ignore auto layout*, formerly
absolute position: the child is excluded from the flow while staying in the
frame, and it and its siblings ignore each other. It costs nothing to build,
because an ignored child reads `box` against its parent — the code path that
already exists for `free` frames and for the root.

It is kept for one concrete reason: **chip and badge overhang is on the
roadmap** and cannot be expressed any other way. An overhanging badge is not a
member of the flow that positions the card's contents.

### 2.4 Paint: fills, outlines and shadows

Missing from r1 and r2 entirely, and two of the three are things a retail flyer
uses on almost every card.

**Effects never affect measurement.** Everything in this section happens at
paint, after the solver has finished. That is what keeps §5.4's two passes
untouched, and it is the same rule §2.3 already applies to strokes.

#### `fill` becomes optional

`shape` declares `fill: ColorValue` as **required**, so an outline-only shape
cannot be expressed today at any setting. A hairline rule box around a price —
the commonest piece of furniture on a printed ticket — has to be faked with one
filled rectangle sitting on another.

`fill?: ColorValue` on shapes and frames. Absent means no fill; the stroke is
what draws. `opacity` on `ElementBase` is not the answer, because it fades the
stroke along with it.

#### Outline on text

A stroke belongs on `text`, not only on shapes and frames. *"SAVE 20%"* in white
with a red outline, or price digits outlined over a photograph, is retail
typography rather than decoration, and neither can be drawn now.

**It must be painted as `paint-order: stroke fill`.** SVG centres a stroke on the
path by default, so a stroked glyph loses half the stroke width *into* its own
counters and comes out thinner and muddier at small sizes — which is exactly
where a price is read. Painting the stroke first puts it behind the fill, so the
visible result is an outside outline of half the declared width; double the width
to get the intended weight. Chromium supports it, so Playwright does.

A one-line rule that is invisible until it is wrong, at which point it reads as
*"the bold prices look thin in the PDF"*.

#### Shadow — measured, not reasoned about

```ts
interface Shadow {
  x: number; y: number      // design units
  blur: number              // design units; 0 is a hard shadow
  color: FlatColor
}
```

One shadow per element, not a list. Stacked shadows are a design-tool feature
with no retail case behind them, and a list can arrive later.

**Soft shadows are available and fully vector.** That is a measured result, not a
guess. r3 said a blurred shadow costs rasterization and tried to price it; the
pricing was wrong in both directions and the conclusion was wrong. What follows
replaces it.

##### What Chromium actually does

Nine cases, each rendered alone to PDF through headless Chrome — the same engine
Playwright drives — and the PDF objects counted. The harness is in
`scratchpad/shadow/` and is worth keeping.

| Case | Rasterized | Result |
| --- | --- | --- |
| Plain shape, plain text | none | vector, fonts embedded |
| `opacity` alone | none | vector |
| Text + `stroke` + `paint-order` | none | **vector, and the text stays text** |
| `feDropShadow` on a shape | 929×632 | element only, ~220dpi |
| `feGaussianBlur` | 938×641 | element only |
| `filter: drop-shadow()` on **text** | 796×277 | **the text stops being text** |
| Gradient with alpha stops | **567×738 — the whole page** | **72dpi** |
| **Concentric vector rings** | **none** | **vector at any size** |

Three of those change decisions:

**A filter rasterizes its own element, not the page.** Less bad than assumed. But
Chromium picks the resolution — roughly 2.3× CSS, about **220dpi** for a
card-sized element on an A4 page, under the 300dpi target and **not reachable
from `s`**. r3 claimed `s × dpi` could set it. It cannot; nothing in the document
can.

**A drop-shadow on text destroys the text.** The font is gone from the PDF and
the price is a picture — unselectable, unsearchable, and resampled by any printer
that reprocesses it. This one is disqualifying on its own.

**The gradient approach r3 suggested as a safe fallback is the worst option
available.** A radial gradient with `stop-opacity` rasterizes **the entire page
at 72 dpi**. Had it shipped, it would have quietly destroyed every page carrying
one.

##### What to build instead

A soft shadow is **n concentric copies of the shape**, each one step further out,
at a constant alpha.

The falloff needs no curve. A point just outside the shape is covered by every
ring and a point at the outer edge by one, so accumulated cover is
`1 − (1 − a)ⁿ` and the per-ring alpha is a constant:

```
a = 1 − (1 − peak)^(1/n)      spread = 2.5 × blur
```

A first attempt weighted the rings by a quadratic and produced visible banding at
every count; the constant is both simpler and correct.

**`n` is derived at paint, never stored.** Banding disappears once rings are
about a device pixel apart, so `n ≈ spread × s × (dpi / 72)` — roughly 16 on
screen and 48 for the same card at 300 dpi. The document stores `x`, `y`, `blur`
and `color`; the painter decides how many paths that becomes for the surface it
is drawing on. Rendered at 8 rings the steps are visible; at 16 they are not.

**`blur: 0` is the same code path with one ring.** That answers r3's open question
about whether a hard shadow is a shadow or a duplicated layer: both are
duplication, there is one field, and the ring count falls out of the blur.

It works on arbitrary paths. A twelve-point burst offsets by growing its radius,
and the shadow follows its points — verified, not assumed.

**The expansion lives in `packages/engine`, beside `shapePath`, and every painter
calls it.** A shadow drawn by the screen and a shadow drawn by the export worker
have to be the same shadow, and the ring count depends on the output scale, which
is exactly the kind of thing two implementations get subtly different. This is the
same argument the shape kit already makes in `shapes.ts` and it is the reason that
file exists.

**Cost:** two shadowed objects on a page, one of them a burst, came to 33 kB and
zero rasters. Paths are cheap; this is not a reason to ration them.

##### What stays banned

`feGaussianBlur`, `feDropShadow`, `filter: drop-shadow()`, and any gradient
carrying alpha stops, on any element that reaches the export path. Not because
blur is undesirable — because Chromium's answer to all four is a resolution
nothing in this codebase can set. A design-lint rule should say so, and it should
name this section.

#### Two boundaries

**A shadow bleeds outside the element's box**, because it is paint and the box is
layout. On a grid that means into the gutter, or over a neighbouring card. The
block's own boundary clips it; inside the block it is the author's problem, and
`clip` on a frame is how they solve it.

**`clip: true` clips a child's shadow**, which is what anyone who has used
`overflow: hidden` expects. Worth stating, because the alternative is arguable
and would surprise everybody.

#### Not now

Gradients stay on fills only — `resolvePaint` handles them, `Stroke.color` is a
`FlatColor`, and a gradient border has no case behind it yet. Inner shadow, layer
blur and background blur are all filters, all rasterize, and none of the 83
blocks wants one.

#### The rule this sits under

CLAUDE.md says **"No shadows anywhere in chrome"**, and the last word is
load-bearing. The same file already makes this exact carve-out for colour: *"A
colour a shop owner picked is not component code — it is data on their block or
their brand kit. The rule governs our chrome; it never governed what a shop
produces."*

A shadow on a price burst is what a shop produces. `--sq-ui-*` is our surface and
takes no shadow; `--sq-tpl-*` is the offer book and always could. The design lint
that errors on shadows is scoped to component code and stays exactly as strict
there.

---

## 3. The data map

Frames decide where things sit. The data map decides what they say, and it is the
half that has to be right first, because **this vocabulary is what makes a block
of any kind buildable at all** — an offer card, a header, a footer, a brand
panel, a cover. A layout engine over a vocabulary that cannot name a shop's
address just produces well-arranged blanks.

### 3.1 `logo` stops being an element kind

Today it is `{ kind: 'logo' }` — no source, no options, nothing to configure. It
draws *the* logo.

That is the same mistake as the price mark, one size down. A logo is a picture,
so making it a kind of its own means it cannot be cropped, cannot take a stroke
or a radius, cannot be the child a frame hugs, and every property ever added to
images has to be added to it separately or silently not exist.

**It becomes an image binding.** `image` with `source: { from: 'brand', field:
'logo' }`, and every image property applies to it because it *is* an image —
including `aspect`, which a logo needs more than most.

### 3.2 Identity is a mode, not a source the owner picks

`brandOverride` already decides whether a shop shows its own logo or the
organization's — `inherit | logo | colors | full`, resolved by
`readEffectiveBrand`. An owner designing a header must not be asked to choose
between two logos, because whichever they pick is wrong for half their branches.

**So there is one identity source, `brand`**, meaning *the identity this book
should carry*. It resolves through the override exactly as the artboard's colours
already do.

The group footer that deliberately always shows the parent mark does not get a
second vocabulary entry. It gets an **identity pin on that block** — the same
shape as Figma Buzz's variable modes, where a template carries brand modes the
user switches rather than duplicate fields they choose between. One entry in the
picker, no way to pick it wrongly, and the deliberate case stays expressible.

*This supersedes r1 §3.2, which kept `organization` as a parallel source, and
closes the corresponding open question.*

### 3.3 The vocabulary

Bindings are grouped by what they produce, because an image cannot bind to a
phone number and the picker should not offer it.

**Text**

| Source | Fields |
| --- | --- |
| `product` | `name` `spec` `brand` `origin` `packSize` |
| `offer` | `price` `currency` `compare` `prefix` `tier` `unitPrice` `saveAmount` `savePercent` |
| `shop` | `name` `address` `phone` |
| `brand` | `name` |
| `book` | `title` `validFrom` `validTo` |
| `static` | the owner's own words, both languages |

**Image**

| Source | Fields |
| --- | --- |
| `product` | `image` |
| `brand` | `logo` |
| `asset` | artwork the owner uploaded |

One field per element. A text element bound to `product.name` holds the name and
nothing else; there is no composite binding and no template string. This is
Buzz's rule and it is right for the same reason its date rule is right in §8: the
composer decides, once, and the engine never learns about formatting.

`offer.saveAmount` and `offer.savePercent` are the answer to conditional
content. *"SAVE 20%"* is not a predicate in the engine; it is a field the
composer resolves, empty when it does not apply, collapsed by §3.7.

### 3.4 Three things this needs that do not exist

Each is small, and each blocks a whole category of block until it lands.

**`shop.address` and `shop.phone` are declared and draw nothing.** Both are in
`TextSource` today and both fall through to `''` in the painter *and* in the
harness — the two places are `draw.tsx` and `harness/svg.ts`, and they agree with
each other and with nothing else. A footer bound to the shop's phone number
renders an empty box and says nothing about why. `shops.location` and
`shops.phone` are columns; nothing reads them.

**A group cannot be named.** Under §3.2 this is no longer a missing
`organization.name` binding but a missing resolution: `brand.name` must return
the organization's name when the block's identity is pinned to the parent.

**The offer period has no column anywhere.** A flyer header almost always reads
*"Offers valid 1–7 October"*, and `OfferBook` carries `expiresAt` — which is when
the **share link** stops working, a different fact that would print a wrong date
if borrowed. This needs `validFrom` and `validTo` on `offer_books`, and they are
the two fields a header block is most likely to want.

### 3.5 The rule that stops the next silent hole

`shop.phone` has been in the vocabulary and absent from the painter for as long
as both have existed, because a binding is *declared* in `@souqstudio/types` and
*resolved* in a painter, and nothing has ever checked that the two lists match.

**Every binding in the vocabulary must draw something for a fixture, asserted by
a test that iterates the vocabulary rather than listing cases.** A new field then
fails a test on the day it is added instead of rendering a blank for a month. The
test is cheap and it is the only thing that makes a vocabulary this size
trustworthy.

### 3.6 Scope, and what is in it

A binding is only offered where its subject exists. `repeats` already draws this
line for products — a block placed once has no product in scope, which
`validateBlock` reports as `product-binding-on-static-block`.

Frames generalise it rather than changing it: `product` and `offer` need a
repeating block; `shop`, `brand`, `book` and `static` are available everywhere. A
header is a static block, so it gets four of the six text sources and both
non-product images.

### 3.7 Empty is a layout decision now

This is new, and it falls out of combining the data map with `hug`.

When a bound value is empty — no was-price, no `nameAr`, a shop with no logo —
an element in a hugging frame **collapses**, and the gap beside it goes with it.
That is usually exactly right: a card with no was-price should not print a hole
where one would have been.

Sometimes it is wrong. A row of cards where one has a was-price and the others do
not must still set every price at the same size, which is the rule
`layoutPriceMark` enforces today by reserving bands whether or not anything fills
them. Under frames that becomes a property of the element:

```ts
whenEmpty: 'collapse' | 'reserve'
```

`collapse` is the default because it is right more often. `reserve` is what a
repeating offer card sets on its was-price, and it is the frame-shaped version of
a rule the price mark already has and states in its own comments.

`reserve` handles *presence*. It does not handle *magnitude* — one card's name
wrapping to two lines while its neighbour's fits on one. That is §5.3.

### 3.8 Locked layers

A seeded block published to the library should let an owner retint it and
rebind it without dismantling the frame tree. Buzz does this by letting the
template author lock layers, and marking restricted templates so the
restriction is visible and removable on purpose.

`locked` already exists on `ElementBase`. It needs to mean this: a locked frame's
structure, sizing and layout are not editable, while its fill, stroke and
bindings are. Cheap, and it is what keeps 66 generated blocks from degrading into
66 broken ones.

---

## 4. What this deletes

Not additions — removals. That is the argument for doing it.

| Gone | Becomes |
| --- | --- |
| `PriceMarkRecipe`, eight presets | a row or column frame |
| `MarkPlace` compass, `dx`/`dy` nudge | `justify`, `align`, `gap` |
| `MarkSatellite`, `MarkCurrency` | ordinary children |
| Twelve colour slots on the mark | each element's own fill |
| The mark's internal shape kit | the frame's `shape`, `fill`, `stroke`, `radius` |
| `chip` element | a frame with a fill and a text |
| `groupId` | `Frame.children` |
| `logo` element kind | an `image` bound to `brand.logo` |
| `organization` as a second identity source | an identity pin on the block (§3.2) |
| **The RTL mirror transform in `resolveBlock`** | logical layout (§5.5) |
| **The fit ladder's iteration** | one scale factor (§5.2) |

The last two are new in r2 and they are the two largest. A mirror pass that
rewrites every box is where the pack label printed backwards. A fit ladder that
changes the measurement it depends on is a loop nobody has proved terminates.
Both stop existing rather than getting better.

`price-mark.ts` shrinks from ~1,200 lines to the two things that are genuinely
about a price and not about layout: splitting an amount to its currency's
precision, and setting a raised fils on the major's cap line.

**That second one stays inside a single element, and the distinction is the
load-bearing one in this whole document.** A raised fils is typography *within one
text run* — it is kerning, not layout. Major and fils have no gap between them to
set and no direction to grow in; the fils is positioned against the glyphs. So a
price-bound text gets a formatting option, in the same class as bold, and never
becomes two elements. Everything that sits *beside* the number can leave; nothing
*inside* it can.

---

## 5. How the engine resolves it

### 5.1 Design size, and why a block stops being normalized

Today a block is **normalized**: every box is a fraction of the block, so the
block is resolution-independent and drops into any region for free. That property
is why the current engine works at all.

`hug` breaks it. Hugging means measuring a string, and measuring requires an
absolute font size. A block with frames in it is no longer scale-free, and
pretending otherwise produces the worst available outcome: the same card placed
in a smaller slot keeps its absolute text size, the fit ladder fires
per instance, and every card on the page lands at a different scale.

You cannot have both a normalized coordinate space and content-measured layout.
This chooses:

**A block declares one `designSize`** — e.g. 400 × 500 design units — and the
layout solves once, in absolute units, at that size. Every value in §2.2 is in
those units. Text is measured at design size.

### 5.2 Placement is a scalar, not a re-layout

Fitting a solved block into a region is a single uniform scale `s`, applied at
paint.

What this buys:

- **Measurement happens once per block definition, not once per placement.** The
  hydration risk in §5.4 shrinks from every card on the page to one solve per
  block.
- **The fit ladder stops being a loop.** It is a solve for the largest `s` that
  fits, subject to §5.3's clamp. No bounded iteration, nothing to prove.
- **Raster sizing becomes computable.** `s` × output dpi says which source
  resolution to pull for a product image instead of guessing — and, per §2.4,
  what device pixel ratio a soft shadow has to be rasterized at.

**There is no viewport.** Every target region is known before anything is
painted — A4 at 300dpi, a WhatsApp story, a square social crop. This is not the
web and the engine should not be built as though a user is dragging an edge.

### 5.3 `s` resolves per slot class, and has a floor

**Per slot class, not per instance.** Every card in the same row of the same grid
gets one `s`, computed against the worst case across that set. A repeating block
is measured once with the widest name, the longest price and the presence of
every optional field any instance has, and that measurement drives the whole
class.

This is the thing no design tool does. Figma's component instances size
independently. InDesign's data merge is worse — auto-sized frames are positioned
from the placeholder's size and only then grow, so they overlap, and the standing
professional advice is to find the longest record by hand and size for it. **The
generator has every record before it paints.** Doing this automatically is not a
gap-filler, it is the part a design tool structurally cannot copy, and on a
printed flyer grid regularity is the first thing that reads as professional.

**The floor is legibility.** Below roughly 6pt at 300dpi nothing is readable, and
no amount of proportional thinking gets around it. So a text element declares
`minLegible` — per role is enough: price, name, spec — and when `s × fontSize`
would fall under it, **the block reflows rather than scaling further**: drop the
spec line, collapse to one line, shorten. That is the only breakpoint concept in
this design, it is content-driven rather than size-driven, and it is declared per
block.

### 5.4 The two passes

**Measure, bottom-up.** Resolve every `hug`: a text hugs its measured string, a
frame hugs its children plus gaps and padding, then clamps to `min`/`max`.

One rule makes this terminate: **children whose size depends on the parent are
excluded from the parent's hug measurement.** A `fill` child cannot contribute to
a `hug` parent. Figma states the consequence as a UI rule — a frame containing
any `fill` child stops hugging on that axis and becomes fixed — and the same rule
belongs in the solver, not just the panel.

**Position, top-down.** The root gets the region. Each frame divides its free
space among `fill` children by weight, places everything along its axis with the
gap, and recurses.

**Text measurement is load-bearing.** `hug` depends on measuring a string, and
`estimateWidth` in the painter and the browser's canvas already disagree — today
that costs a slightly wrong wrap, tomorrow it moves a box. The server and the
first client paint must produce the same numbers or React reports a hydration
mismatch. **Settle this before anything else in §7 step 2.** §5.2 reduces its
blast radius but does not remove it.

### 5.5 Direction

Direction is a **render context plus a per-frame override**, never a mode of
`Layout`. A block is authored once and rendered in both editions, so it cannot be
stored on the block.

```ts
interface ResolveContext { direction: 'ltr' | 'rtl' }
```

Mirroring stops being a transform. The solver lays out from the other end; there
is no pass that rewrites boxes, which is the pass that printed a pack label
backwards.

**Resolve `start`/`end` on the inline axis only.** They mirror when the flow axis
is horizontal and direction is `rtl`, and never otherwise. `justify` on a `row`
mirrors; `align` on a `row` does not; on a `column` it is the other way round.
Both are spelled `start`/`end`, so a solver that mirrors by field name rather
than by axis flips every column frame top-to-bottom in the Arabic edition. It
will look like a vertical centering bug. This paragraph exists so that it does
not get written.

**`direction: 'ltr'` pinned on a frame** is for the subtree that must not flip:
the currency/price pair, a Latin wordmark lockup, a barcode, a phone number, a
`1L × 6` pack spec. The block still mirrors as a whole — the price mark moves to
the other corner — while the pair keeps its internal order.

**What never mirrors:** paint order (which is why `firstOnTop` is a separate
field), images and logos, rotation, text runs, and shadow offsets. Bidi is the
shaper's job. The price's own left-to-right rule narrows to the price text run,
where it always belonged.

### 5.6 Aspect

A uniform scale handles a smaller card. It does not handle a square card dropped
into a 3:1 band, and no scalar does.

**A block declares the aspect band it is valid for, and the composer will not
place it outside that.** A shelf ticket, a burst card and a wide band are already
three different blocks; this formalises what the library assumes.

Layout variants per aspect band — one block, one set of bindings, a different
frame tree per band, which is how Buzz lets a template carry multiple layout
configurations — are the answer if an owner asks for the same card in two shapes.
Not now: it doubles the authoring surface and its designer UI is not small.

---

## 6. Getting 83 blocks across

66 seeded, 17 owner-authored. Both convert mechanically; neither needs a person.

**Seeded blocks are generated code.** `library-cards.ts` and its siblings are
TypeScript that builds them, so this is a rewrite of the generators, not a data
migration. It is the largest single piece of work here and it is also the best
test: if the 66 cannot be expressed as frames, the model is wrong and that is
worth finding out early. Build three by hand first — see §7 step 3 — before
touching the other 63.

**Owner blocks need a converter**, run once over `blocks.arrangements`. Every
`priceMark` becomes a frame holding a price text plus whatever its recipe said
was visible; every `groupId` run becomes a `free` frame. Each block gets a
`designSize` equal to its current rendered size at the library's reference
region, which makes the conversion exact rather than approximate. Then the
gallery harness renders old and new and the two are diffed — the same check that
caught a pack label printing backwards, and the same one that has kept every
change this month byte-identical.

**The old kinds stay renderable through one release.** A block published to R2 is
read by every shop, and the loader refuses a shipped block that draws a warning —
`docs/block-library-from-r2.md` §12, which took the dev deploy down on
10 September. Delete the old path in the release *after* the one that converts.

---

## 7. Order to build in

1. **The data map, on its own.** The full vocabulary, the three missing pieces in
   §3.4, identity-as-a-mode per §3.2, the `logo` kind folded into `image`, and the
   test in §3.5 that walks the vocabulary. It ships against today's flat elements,
   changes no layout, and is the half that decides whether a header or a footer can
   be built at all.
2. `Frame`, `Sizing`, the two-pass solver and `designSize` in `packages/engine`.
   Tests only, no UI. **Settle text measurement first.**
3. **Three hand-built blocks, and one of them is a grid.** A shelf ticket, a burst
   card, and a 3-up band with one card spanning two cells. The third is the real
   test: Figma shipped one-dimensional auto layout in 2020 and needed until May 2025
   to admit that two-dimensional layout is not nested rows and columns. A flyer is a
   grid product. Find out in week one whether the nesting is survivable, not in
   month three. Stop and look at all three before continuing. Then a header and a
   footer, because those are the ones the data map has to carry and the offer card
   will not exercise.
4. The converter, and the harness diff over all 83.
5. Regenerate the seeded library.
6. Designer UI — create a frame, set direction, gap, padding, justify, align;
   per-element hug/fill/fixed with min/max; fill weights; paint per §2.4; the
   binding picker, scoped per §3.6; `locked` per §3.8.
7. Delete the price mark's layout machinery, the `chip` element, the `logo` kind
   and the mirror transform.

Two things run alongside rather than in sequence, and both are cheap:

**The export regression harness.** §2.4's findings came from rendering to PDF
through headless Chrome and counting the objects. That harness is the only thing
that would catch a future change to the export path silently rasterizing a page,
and it currently exists in a scratch directory. It belongs in the repo, run on
demand rather than in CI, next to the gallery.

**A lint rule for the banned filters.** `feGaussianBlur`, `feDropShadow`,
`filter: drop-shadow()` and gradients with alpha stops, refused on anything that
reaches the export path, with the rule naming §2.4 so the next person finds the
measurement rather than re-deriving it.

**Step 1 stands alone and is worth doing whatever happens to the rest.** The
vocabulary is wrong today — two bindings draw nothing and a group cannot be
named — and none of that is waiting on frames.

Steps 2–4 answer whether the layout model works. Nothing after them is worth
starting until they do.

**The task-level breakdown is `docs/E14-implementation-plan.md`.** This section is
the order; that file is the work, the exit criteria and the two gates that decide
whether it continues.

---

## 8. What I have not decided

Resolved since r1, recorded so they are not reopened: identity is a mode and
`organization` is not a second source (§3.2); dates resolve to strings in the
composer; `brand` and `shop` stay separate entries with `brand` offered first;
`free` frames stay, as the `groupId` migration path; absolute escape is kept
because overhang needs it (§2.3); nesting is capped at three.

Still open:

- **`between` as a `justify` value.** Useful for a wide band, and meaningless
  under `hug` — there is no free space to distribute. Either it is rejected by
  `validateBlock` on a hugging frame, or it is cut. Leaning cut.
- **Grid as a third `Layout` mode.** Deferred, not rejected. Step 3 decides. The
  union is shaped so that adding it does not touch `Frame`. If it lands, the
  known trap is that Figma's rows cannot hug, which forces hand-set track heights
  — do not copy that.
- **Wrap.** Also a flow mode rather than a boolean on `row`, with its own
  `rowGap`/`columnGap` and cross-axis distribution. Not needed by any of the 83.
- **What a missing logo draws.** A shop that has never uploaded one is the common
  case on day one. `collapse` leaves a header with a hole in the middle;
  `reserve` draws an empty box. Neither is obviously right and the answer is
  probably per-block rather than global.
- **Components across blocks.** "Define this price chip once, use it in twenty
  blocks, edit it in one place" is a components-and-variants feature, not a frame
  feature, and the word *component* should not be allowed to smuggle it into this
  scope. Decide separately.
- **Whether `minLegible` is per role or per element.** Per role is less to author
  and probably enough. Per element is more honest. Leaning role, with an
  element-level override if step 3 wants one.
- **Whether the ring count needs an authored ceiling.** §2.4 derives `n` from
  blur and output scale, which at 300 dpi on a large burst is a few hundred
  paths. Cheap individually; unmeasured across a 24-card page. Measure before
  deciding, and only then consider a cap.

---

## 9. Prior art

Recorded because several decisions above are borrowed rather than invented, and
knowing whose mistake is being avoided is worth more than the decision itself.

**Adobe XD is a completed experiment.** Maintenance mode since 2024, no new
features since roughly mid-2023, abandoned after the Figma acquisition collapsed.
Its original model was constraints — pin edges, preserve spatial relationships,
with the tool guessing which constraints you meant from grouping and proximity to
the parent's edges. That is structurally what `box`-as-fraction is today. XD then
had to add **Stacks** on top, a group that preserves defined spacing as objects
are resized and reordered, because constraints cannot express *the content
changed length*. Same arc as this document. Nobody is going back to pure
constraints.

XD's padding also required a **background layer**, and deleting it promoted the
next layer or reset padding to zero. That is §2's "the star is the frame",
shipped in 2020.

**Figma is where §2's additions come from.** Min/max composable with
fixed/hug/fill rather than replacing them; `hug` valid only on frames and text,
`fill` only on children; per-child flex-grow; aspect ratio applied only when an
axis is flexible; baseline alignment as a frame-level advanced toggle; canvas
stacking as an explicit first-on-top control because flow order and paint order
collide; absolute position kept and renamed *Ignore auto layout*, with ignored
children falling back to constraints. Each of those exists because the simpler
version was shipped first and did not hold.

**Figma's grid is the warning in §7 step 3.** Announced at Config 2025 with
multi-track spans and fixed track sizing, explicitly because designers had been
building grids out of complex nested auto layout frames. Five years after auto
layout shipped. The beta landed badly and the loudest complaint is directly
relevant: rows and grids cannot hug their contents, so row heights are auto or a
hand-set pixel value.

**Figma Buzz is the closest living analogue to this product** — upload a
spreadsheet, map a text or image object to a column, generate the set. Three
things taken from it: text binds only to text and images only to images (§3.3);
one data field per object, so a name is one column and not two (§3.3); template
authors lock layers so everyone stays on approved fonts and layouts (§3.8). Its
variable modes are §3.2's identity pin. Its guidance for handling long values is
to test the template with longer strings by hand — which is §5.3's opening.

**InDesign data merge is the failure mode §5.3 avoids.** Auto-sizing text frames
on a multiple-record merge overlap each other, because the generated frames are
positioned from the placeholder's size and only then grow. You cannot dictate the
resulting size. The standing advice in that community is to find the longest
value and set the size to fit it, by hand, before merging. The same guidance
covers images: differing aspect ratios go into consistent frame dimensions with
fit-proportionally and some letterboxing accepted.

Everyone solves the worst-case problem manually because an interactive editor
cannot see the data. This one can.
