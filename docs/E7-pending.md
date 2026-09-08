# E7 — working notes

What E7 is now, what was built on 7 and 8 September 2026, and the corrections to
`docs/E7-template-grid-management.md` that follow from the composition model.

**Read §8 first if you are picking this up.** The designer described in §2 was
built on 7 September and the owner's verdict on it the next day was that it was
fundamentally not what they wanted — too constrained to design in. §8 is what
changed, which constraints turned out to be load-bearing, and which were only
caution. Everything in §2 still describes the shape of the thing; §8 describes
what an owner can now do inside it.

Read `docs/composition-model.md` §3 before anything here. The epic as written is
about templates, grids and seasonal presets; **two of those three tables no
longer exist**, and the third was never what an owner needed.

---

## 1. The epic, rewritten

`docs/STATUS.md` §3 said this before the work started, and it was right:

> **E7 lost most of its reason to exist.** It was admin tooling for templates and
> grids, and both tables are dropped: a grid is now `perRow` on a region and a
> template that bundled look *and* arrangement had nothing left to be. What E7
> still covers is a **block designer** — drag an element onto a block, bind it to
> a product field, pick a text style — plus the card designer addendum.

So E7 is now three things, and the first two are built:

| | What it is | State |
| --- | --- | --- |
| **E7-A** | The block library — two collections, one schema | **Built.** `/brand/blocks` |
| **E7-B** | The block designer — the card designer addendum, in full | **Built.** `/card-designer/[blockId]` |
| **E7-C** | Seasonal blocks — scheduled activation, an overlay asset library | **Not built.** §6 |

What is *gone* from the epic, and why:

| E7 as written | Now |
| --- | --- |
| **E7-01** Template admin — background, typography, price tag style, discount badge style, colour zones | A block. Background is a `shape` element bound to a `TokenRef`; typography is the brand kit's scale; the price tag and the discount badge are `priceMark` and `chip`, and **neither is configurable** (§3); colour zones are the roles a block references. |
| **E7-02** Grid admin — column and row counts, mergeable cells, hero positions | Not an object at all. A grid is `cols`/`rows`/`regions` on the *book*, authored in the editor. There is nothing to administer centrally. |
| **E7-04** Output format mapping — a compatibility table per template and grid | Replaced by arrangements. A block declares aspect *ranges*, and the engine picks by the shape of the region it lands in; there is no format list to keep in step with the formats that exist. |
| **E7-05** Shop owner custom templates (V3) | **Shipped in the MVP instead**, because the composition model made it the same code path as everything else. `blocks.organizationId` is nullable; null is seeded, set is authored. There was never a second system to build. |
| Version history | Kept, and now written to. `block_versions` had existed with nothing writing to it since the composition model landed. |
| Plan gating | Kept. `planReaches` in `lib/blocks.ts`; every seeded block is `starter`, so it is inert today and it is honest. |

**Level 2 arrived before Level 1.** The epic put admin-managed templates in the
MVP and owner-authored ones in V3. What actually shipped is the owner's half:
the seeded library is authored in code (`packages/engine/src/library.ts`, one
source that both `pnpm db:seed` and the render harness read), and an internal
screen to edit it is E13's, against `admin_users`. That inversion is the
composition model's doing — an owner-authored block and a seeded one are the
same row — and it is the right way round: the shop-facing half is the half that
sells.

---

## 2. What was built

### The library — `/brand/blocks`

Under `/brand`, because **a brand kit *has* blocks**. It does not contain a
choice of one — that was `gridId` and `templateId`, and both came out in E4 —
but the set of designed pieces a shop composes with is part of how that shop
looks, and `/brand` is where an owner already goes to see them. A rail item of
its own would say blocks are a fifth top-level thing.

Two sections, in this order: the organization's own blocks, then the four that
come with every account. Own first, because **saved blocks are the compounding
asset** — a chain designs a seasonal header once and every shop uses it, which
is what makes month six cheaper than month one.

**Duplicate is the primary action on a seeded block, and there is no "new blank
block" anywhere on the screen.** §3.6: *always seed* — a blank artboard produces
something worse than the default and the owner blames the product. A new block
is therefore a copy of one that works. `POST /api/v1/blocks` has no branch that
creates an empty one, so the rule is structural rather than a convention the
next screen can forget.

Removing a block that a page grid or a pin still names **archives it instead**.
There is no foreign key to lean on — a region names its block by id *inside* the
`regions` JSON, deliberately, because Prisma cannot enforce a key through JSON —
so a delete would leave a live book unrenderable with nothing in the schema to
have stopped it. `blockIsInUse` scans the organization's grids, which is cheap
at the handful of books an organization has and is the shape the schema chose.

### The designer — `/card-designer/[blockId]`

Three panes on the canvas surround: palette (start), canvas plus stress preview
(centre), properties (end). Everything the design skill's *Design surfaces*
section asks for, and each of these is a rule rather than a feature:

- **Bound and static are distinguishable at a glance, in all three places** — a
  dashed ring on the canvas, a link glyph in the layer list, and two palette
  groups. All three read `isBound` from the engine; deriving it three times is
  how one of them ends up wrong.
- **Bound elements render sample data, never field names.** The canvas draws the
  *median* real row — a short name, a brand, no Arabic name, no image — because
  a "typical" sample with every field filled is a third preview of the same happy
  case, and 4.2% of the catalog has an image.
- **The stress preview is persistent and at the same scale**, drawing the same
  card against the longest Arabic name and a three-decimal Kuwaiti price. A
  worst case shown smaller reads as "it fits", which is the opposite of the
  point.
- **Overflow is declared per element**, in the properties panel, as a first-class
  control: shrink to a floor, clamp to N lines, or truncate. See §4.
- **The language is a segmented control in the chrome**, defaulting to English,
  and it drives the *artboard* rather than the interface. An owner working in an
  Arabic UI who is designing an English card must see an English card.

Direct manipulation: drag to move, eight handles to resize, arrows in the layer
list for paint order, undo and redo, autosave debounced two seconds with no save
button. A drag is **one** undo step — the checkpoint is taken on pointer down,
before anything has changed — because an undo that walks back a drag pixel by
pixel is not an undo.

Arrangements are tabs above the canvas, named by the shape they cover (Tall,
Square, Wide, Banner) rather than by index, with the aspect range editable in the
properties pane when nothing is selected. Adding one copies the layout currently
open, for the same reason a new block copies a seeded one.

### Where the code went

| File | What it owns |
| --- | --- |
| `packages/engine/src/block-edit.ts` | `moveBox`, `resizeBox`, the element-list operations, `isBound`, `validateBlock`. **27 tests.** |
| `packages/types/src/composition.ts` | `TextOverflow`, and `overflow` on a text element |
| `packages/engine/src/fit.ts` | `maxLines`, and `fitPolicy(source, overflow)` |
| `apps/web/lib/block-document.ts` | The zod mirror of the document, with a compile-time check that it *is* a mirror |
| `apps/web/lib/block-write.ts` | What a write may say, and when it is refused |
| `apps/web/lib/blocks.ts` | The reads, the plan gate, `blockIsInUse` |
| `apps/web/app/api/v1/blocks/**` | List, create by duplication, save, delete, version history |
| `apps/web/components/card-designer/**` | The seven components of the designer |
| `apps/web/components/blocks/BlockLibrary.tsx` | The library screen |
| `apps/web/stores/designer-store.ts` | Selection, undo, save state |

`BLOCK_DESIGNER_BUILT` is flipped in `lib/features.ts`.

---

## 3. Three decisions worth not reversing

### Still no Fabric, and this was the surface that was supposed to need it

E6 recorded that nothing built so far had needed a canvas object model, and
added: *"Fabric earns its place when direct manipulation does — dragging and
nudging — and not before."* This **is** direct manipulation, and it still does
not.

What a drag actually needs is a hit target, a delta and somewhere to put the
result. The engine already owns the arithmetic (`moveBox`, `resizeBox`, in
fractions), the painter already draws every element, and an SVG rect is a hit
target. Adding Fabric would mean a **second painter** — Fabric objects built
from the same elements — and the first thing to drift would be the thing that
matters most: whether the card the owner designed is the card the PDF prints.

It also avoids the hazard that was waiting: `document.fonts.load()` for every
family *and* weight before instantiating any text object, or every bounding box
is measured against the fallback. Nothing here measures text in order to decide
layout — the engine decides, and `fitText` takes its measurer as an argument.

**This does not settle it forever.** Multi-select, rotation, alignment guides
against other elements, and snapping to a neighbour's edge are all reasons to
revisit. None of them is in this epic.

### The price mark is not lego, and the designer is the surface that would erode it

E6 §3 and composition model §3.5, restated because a block designer is exactly
where this gets lost: **the price mark is one element you place and size, never
one you open.** Raised minor digits, the tier tab, the three-decimal KWD/OMR/BHD
branch and LTR-in-Arabic are all internal. Selecting it in the designer shows a
box, a size, and one sentence saying why there is nothing else — not an empty
panel, which reads as unfinished.

Owners given text boxes for a price produce hundreds of inconsistent treatments
inside a month, and the price mark is the single element that decides whether
output reads as a real offer book.

### No colour picker, anywhere

Every fill is a `TokenRef` the brand kit resolves. The properties panel offers
roles — "First brand colour", "Card surface" — and the zod schema refuses a hex
at the edge, so a block that carries a literal colour cannot be saved even by a
client that tries. This is the rule that earns everything else: it is why a
seeded block looks like the shop that loaded it, and breaking it turns the
library into a set of unrelated pictures.

---

## 4. Overflow is now declared, and it reaches the engine

The design system has asked for this since before there was a designer: *"Every
bound component carries an overflow policy set in the properties panel:
shrink-to-fit with a floor, clamp to N lines, or truncate."* Until now
`fitPolicy` derived the answer from what the text **is** — a name is never cut, a
spec may be — which is a good default and not a control.

```ts
type TextOverflow =
  | { mode: 'shrink'; floor: TypeLevel }
  | { mode: 'clamp'; lines: number }
  | { mode: 'truncate' }
```

- `overflow` is **optional** on a text element, and omitting it keeps the derived
  answer. Every seeded block omits it, so nothing changed shape.
- `fitPolicy(source, overflow)` takes the declared policy over the derived one.
  `clamp` and `truncate` *are* a request to cut, made explicitly in the designer,
  which is the difference between a rule and a default.
- `fitText` gained `maxLines`, which caps the line count independently of the
  height the box allows — the box already caps by arithmetic; this caps by
  decision.
- Both renderers pass it: `components/blocks/draw.tsx` and the engine harness.
  E9's export must too, and it will get it for free if it uses the painter.

The floor is never editable to illegibility: the ladder escalates below it and
the card carries `fit-escalated`, which E6 already surfaces per offer.

---

## 5. Corrections to `docs/E7-template-grid-management.md`

Recorded here rather than edited into the epic.

- **The database tables at the foot of the epic do not exist.** `templates`,
  `template_versions` and `grids` were renamed and reshaped or dropped by
  migration `20260905000000`. `seasonal_assets` was never created.
- **"Preview panel renders a mini Fabric.js canvas"** — it renders inline SVG
  through the same painter as the editor and `/brand`. See §3.
- **"Template config stored as structured JSON — no freeform CSS"** survives
  intact and is stronger than written: the document is validated by a zod schema
  that mirrors the type union, with a compile-time check that it is a mirror.
- **The addendum's route, `card-designer/[templateId]`, is now
  `card-designer/[blockId]`.** The parameter was named after a dropped table.
  `references/layout-map.md` and `apps/web/CLAUDE.md` are updated.
- **The addendum's "template language binding, set at creation" is not built as
  a binding.** A block is language-neutral — every static string carries both
  `textEn` and `textAr`, and the schema refuses one without the other — so there
  is nothing to bind at creation. The direction control in the chrome remains,
  and it is what the addendum actually wanted.
- **E7-01's "changes apply to new offer books only"** holds without any work: a
  book's page grid names its block by id and reads the current document, so an
  edit *does* reach an unpublished book. Nothing snapshots a block into a book.
  Whether it should is an open question — §6.

---

## 6. Not built

1. **Dragging a *new* element from the palette onto the canvas.** Tapping a
   palette entry adds it to the middle of the card, which is the tablet-safe
   equivalent the design system asks for in any case; the drag is owed, exactly
   as it is in the editor's tray.
2. **E7-03, seasonal.** `blocks` already carries `isSeasonal`, `activeFrom` and
   `activeTo` and nothing reads them. What is missing is the *composer's* side —
   a seasonal block appearing at the top of the picker inside its window — and
   there is no picker yet, because the editor composes a book from the seeded
   grid rather than from a chosen block. Build it when the composer chooses.
3. **The overlay asset library.** Crescents, lanterns, National Day motifs.
   `ImageSource` already has `{ from: 'asset'; assetId }` and the designer does
   not offer it, because there is no asset library to point at and a picker over
   an empty set teaches nothing.
4. **Thumbnails.** `blocks.thumbnailUrl` is still null on every row. The library
   draws a live preview through the engine instead, which is better and is what
   makes a thumbnail unnecessary until there are enough blocks for the page to
   feel slow.
5. **A block snapshot per book.** Editing a block changes every unpublished book
   that uses it. That is right for a fix and wrong for a redesign, and the honest
   answer is probably a version pin on the page grid rather than a copy. Not
   urgent: an organization has one or two blocks today.
6. **The admin half** — E13, against `admin_users`. Editing the *seeded* library
   is still a code change, and `packages/engine/src/library.ts` is deliberately
   the one source both the seed and the harness read.

---

## 7. Two things to know before touching this

**The route keeps the dashboard rail, and so does the editor.** The design skill
says both canvases escape the shell via their own `layout.tsx`. A nested layout
cannot do that — Next nests layouts rather than replacing them, so escaping means
a route group outside `(dashboard)`, which is also where the auth gate lives.
Matching the editor is the requirement that actually matters: **canvas parity is
a hard rule**, and a designer that escaped while the editor did not would be
precisely the divergence the rule exists to prevent. If one moves, both move, in
one change.

**`components/card-designer/` is the directory name the lint config already
expected.** `packages/config/eslint.design.cjs` exempts `components/editor/**`
and `components/card-designer/**` from the template-token rule, because both draw
offer book content in `--sq-tpl-*`. The components were first written under
`components/designer/` and the artboard's `--sq-tpl-paper` failed lint on the
spot — which is the rule working, and the reason the directory is named as it is.

---

## 8. The designer was too tight, and what changed — 8 September

**The owner's verdict on §2's designer: "fundamentally not what I want. I want
something like a small Figma or Illustrator — the user designs their own
template. Right now the user is too stuck with us, or we have to give hundreds of
templates."**

That is a fair reading of what was built, and "ship a hundred templates" is the
wrong answer to it. What follows is the analysis that separated the constraints
doing real work from the ones that were only caution, and what happened to each.

### The bounds that are load-bearing, and stay

All three exist because of what an offer book *is*, not because of taste:

- **Product text is bound, never typed.** A typed-in name cannot reflow, cannot
  translate, and is wrong the moment the catalog corrects itself.
- **Coordinates are fractions of the block.** One design serves 1080×1080 for a
  carousel post and a third of an A4 column in a booklet. A pixel would be right
  in exactly one of them.
- **The repeating card reflows rather than being hand-placed.** A `flow` region
  binds to a position in the product list, so next week's hundred products fill
  the same layout untouched. Free-positioning that card is the five-minute
  promise gone — E6 §1 has said so since before any of this was built.

### The bounds that were only caution, and went

| Was | Is |
| --- | --- |
| Six colour slots, no picker | The shop's palette as swatches, the three page mechanics, and **any colour** as a literal — `ColorValue` |
| Sizes from an eight-step scale | The scale by default, **any size** when the owner sets one — and the fit ladder still runs |
| No weight, italic, letter-spacing, case, face | All five, per element |
| Rectangles only | Rectangles, circles, **lines**, and a stroke on any of them |
| Product photo and logo only | Plus **uploaded artwork**, full-bleed or inset, `cover` or `contain` |
| No rotation, no opacity | Both, on every element |
| One element at a time | **Multi-select**, marquee, group, align, distribute, snap with guides, copy, paste, duplicate, lock |
| No keyboard | Arrows nudge, shift-arrow nudges further, ⌘C/V/D/G/A, delete, escape |
| The price mark was opaque | Its **colour, ground, frame and badge** are the shop's; only the composition stays ours |
| One card, always | A block placed once is designed **at a page shape** — A4, square, story, band |

### Two rules that replaced the old blanket ones

**"No hex, ever" became "no hex in a block we ship."** A seeded block is loaded
by every account and has to name a colour before it has met any of them, so it
names a role the kit fills — that rule is now enforced rather than assumed, by
`usesOnlyRoles` in `lib/block-document.ts`. A block the shop authored *has* met
them, and an owner with a Ramadan gold in their hand and no way to type it is an
owner who leaves.

**"Snap to the brand scale" became a default rather than a law.** A level is
still what a text element carries and still what the fit ladder steps down; a
hand-set size overrides what it draws at and keeps what it degrades to. Text
sized by eye therefore still shrinks rather than overflowing — `fitFreeSize` in
`packages/engine/src/fit.ts`, which falls by ratio to 60% of what was asked for
because there is no scale step to fall to.

### Where the work went

| File | What it owns |
| --- | --- |
| `packages/types/src/composition.ts` | `ColorValue`, `Stroke`, `ElementBase` (id, rotation, opacity, group, lock), `PriceMarkStyle`, and the freed-up text element |
| `packages/engine/src/color.ts` | Resolving a colour, one way, for both renderers |
| `packages/engine/src/snap.ts` | Snapping and alignment. **21 tests** |
| `packages/engine/src/fit.ts` | The ladder for a hand-set size |
| `apps/web/components/blocks/draw.tsx` | Rotation, opacity, strokes, circles, lines, `cover`/`contain`, artwork, free typography, price-mark styling |
| `apps/web/components/card-designer/*` | The canvas, the toolbar, the colour control, the keyboard |
| `apps/web/lib/block-elements.ts` | Minting elements, and the ids everything else selects by |
| `apps/web/app/api/v1/blocks/artwork` | Presigned uploads |

### Three things this deliberately did not do

1. **It did not make the repeating card free-form.** See above; that is the
   reflow promise, and the owner's own answer to the question chose the option
   that keeps it.
2. **It did not add a `cover` / `back` page role to the editor.** A page-shaped
   panel is designed here and reaches a book as a **pin**, which already
   displaces products rather than consuming them. A first-class cover is a book
   decision rather than a designer one.
3. **It did not build an asset table.** `ImageSource.assetId` holds the R2 object
   key for owner artwork, resolved by `lib/block-assets.ts`. `image_assets`
   exists but every row on it hangs off a catalog product, and a table for block
   artwork is a schema decision rather than an upload route's business.

### What is still owed

1. **Text on a path, gradients, shadows, blend modes.** None of them are in the
   model. Gradients are the one most likely to be asked for next, and they are a
   `ColorValue` variant rather than a rewrite.
2. **A seeded gallery.** The owner's own option list raised this: fifteen to
   twenty-five real designs — seasonal, grocery, pharmacy, electronics — so a
   shop starts from something good. That is design work rather than engineering,
   and it is what stops a blank canvas feeling worse than the default.
3. ~~**`pnpm db:seed` must be re-run.**~~ **Done**, and it found something. See
   below.
4. **Nothing has been opened in a browser.** Typecheck, lint, 216 engine tests,
   415 web tests, `pnpm build` and the render harness all pass; the canvas
   interactions — marquee, snap guides, rotation handle, upload — have not been
   used by a person. That is the check that has repeatedly found what the others
   could not, and it is the one still outstanding.

### The reseed, and what reading real rows back found

The dev database held five blocks in the old shape — the four seeded ones and
one organization's `Footer copy` — every element of all five without an id and
with `surface` where `fill` now goes. They were deleted and written back:
`pnpm db:seed` recreates the seeded four **at the same ids**, which is what the
page grids of four live books name inside their `regions` JSON; the shop's own
copy was made again from the new seeded footer, keeping its id and its name so
their library did not quietly lose a row.

Two things came out of reading the result back through the real parser rather
than trusting the write:

- **The seeded offer card reported three overlapping-aspect warnings, and every
  one was wrong.** Its four ranges *meet* — 0.35–0.85, 0.85–1.35, 1.35–2.6,
  2.6–12 — which is how a set of ranges covers the line without leaving a hole,
  and `coverageProblems` was reading a shared endpoint as an overlap. Three
  warnings on the block every shop starts from is how owners learn to ignore
  warnings. Fixed, with the boundary case now asserted.

  **The existing test did not catch it and could not have**: it asserted the
  absence of an `aspect-gap` on touching ranges and never looked at what else
  was reported. This is rule #7 again — the answer came from looking at the
  output, not from the suite.

- **Nothing enforced that two elements on one layout have different ids**, which
  the designer now depends on for selection, grouping and z-order. The designer
  mints ids that cannot collide, but a hand-written seed can, and a document
  where clicking one element selects another is unfixable from inside the tool.
  `duplicate-element-id` is now an error.

Verified after the fact: all five rows parse under the strict schema, carry
distinct ids within every arrangement, use roles only where they must, and raise
no errors and no warnings; and all four books still resolve `Offer card` and
`Footer` from their master grids.
