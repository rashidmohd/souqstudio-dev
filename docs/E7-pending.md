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
2. ~~**E7-03, seasonal.**~~ **Half done, 8 September — see §9.** A seasonal
   block now appears at the top of the *import* picker inside its window, and
   the window is computed from the calendar rather than stored, because Ramadan
   and both Eids move against the Gregorian one. The composer's side is still
   owed for the reason given here: the editor composes a book from the seeded
   grid rather than from a chosen block, so there is no composer picker to
   promote into. Build that when the composer chooses.
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

1. ~~**Gradients.**~~ **Done, 8 September — see §9.** Text on a path, shadows and
   blend modes are still not in the model, and none of them has been asked for.
   The estimate that gradients were "a `ColorValue` variant rather than a
   rewrite" was half right, and §9 says which half.
2. ~~**A seeded gallery.**~~ **Done, 8 September — fifty-nine blocks.** The ask
   was fifteen to twenty-five real designs; the library is thirty-three repeating
   offer cards, eight headers and covers, ten panels, five footers and eleven
   seasonal bands. `packages/engine/src/library-cards.ts`,
   `library-panels.ts` and `library-seasonal.ts`, on a shared vocabulary in
   `library-kit.ts`; grouped by category on `/brand/blocks`.

   **The count came from structure times skin rather than from drawing sixty-odd
   cards.** Seventeen structures — stacked, price band, overlay, burst, ticket,
   framed, price-first, list row, compact, feature, halo, brand-led, spec-led,
   side rail, split tint, photo-led, no-photograph — each parameterised by a
   ground, a price-mark skin, an accent and a pill colour. Thirty hand-drawn
   cards would have drifted apart inside a month.

   Three findings worth keeping, and all three came from **looking at the
   renders**, not from the tests, which were green throughout:

   - **`pickArrangement` never fails, so declining to design a shape does not
     avoid it.** The list row shipped with two arrangements on the honest
     argument that a line item in a tall cell is not a line item. What an owner
     actually got was the wide layout crushed into a portrait box — a stretched
     thumbnail, a two-character price, and the name escalated red. It now carries
     four.
   - **A promo-tier pill draws in a brand colour, so a brand-coloured ground can
     swallow it.** A "Half price" chip whose token is `primary`, on a
     primary-grounded card. Every tinted card now names a neutral for the pill,
     and the ticket's tab is `ink` or `surface` rather than a brand role.
   - **`variant: 'line'` draws left to right in both painters**, so three
     vertical dividers rendered as two-pixel dashes. `rule()` in the kit now
     emits a thin rectangle when the box is taller than it is wide.

   `pnpm --filter @souqstudio/engine gallery` draws every block at every shape it
   claims, plus the worst-case Arabic name and an Arabic edition, into
   `harness/out/gallery.html`. That is the check; nothing else finds these.

   **And it changed the screen.** `/brand/blocks` printed both collections, the
   shop's own above ours. At four seeded blocks that read as one page with two
   halves; at sixty-seven it read as a catalog with the shop's own work stranded
   at the top of it. They are not peers — one is theirs, editable, and the reason
   to open the screen; the other is a shelf. So the page is now *their* library
   alone, with "Add from library" opening `BlockImportDialog`: a filter across
   what a block is *for*, multi-select, and one action that names the count.

   Three decisions inside it worth not undoing:

   - **The filter earns its place only because it is a picker.** On a page you
     scroll, a category heading is a signpost and grouping is enough. In a picker
     "footers" is the question the owner arrived with, and the answer should
     remove the other sixty-two blocks from the screen rather than move them
     further down it.
   - **`POST /api/v1/blocks` grew a second branch rather than a flag.** `fromId`
     duplicates one block and returns it so the client can open it in the
     designer; `fromIds` imports several and returns the list. The naming differs
     and that is the whole reason: an imported block is not a copy of anything
     the owner can see, so it is "Ramadan band", not "Ramadan band copy" —
     `importName` in `lib/blocks.ts`. The loop is sequential so each name is
     decided against the ones the same import just added.
   - **A partial import reports what did not come.** Seven blocks arriving and
     one being plan-gated is a fact the owner needs; failing all eight over it is
     a worse answer than seven and a sentence.

   **Not opened in a browser** — same gap as §8 records for the designer. The
   dialog was checked by mocking it at its real dimensions against the rendered
   blocks, which is what caught the tile sizing: a footer at full tile width is a
   22px sliver beside a 240px card, so every block is now fitted into one shared
   box instead of setting its own height.

   **And the previews got a packshot.** `toArtboardOffer` sent `imageUrl: null`,
   so every card in the library drew the grey "this product has no photograph"
   box — the whole library in a shop window, and an owner could not tell a
   photo-led card from a compact one because neither had a photo. `PREVIEW_PRODUCT`
   now carries `SAMPLE_PACKSHOT`, a category illustration in
   `public/preview/`. Three things about it are deliberate:

   - **It is category artwork, not a photograph.** A placeholder should say "a
     product goes here" without pretending to be a product the shop sells. Dairy
     is one of the ten in `packages/db/src/catalog-categories.ts`; the rest slot
     in beside it and `SAMPLE_PACKSHOT` becomes a lookup rather than a constant.
   - **It is not in `public/illustrations/`.** That directory is the chrome slot
     map in `lib/illustrations.ts`, audited against the illustration manifest's
     charcoal-line, sand-ground rules. This is artboard content in its own
     palette and would fail that audit; filing it there would put it in front of
     the next person choosing an empty state.
   - **The stress panel strips it, and `TYPICAL_PRODUCT` never had it.** A
     missing photograph is not a gap in the worst case — it is 95.8% of the
     catalog, so it is part of it. The library preview is a shop window and may
     be dressed; the canvas an owner designs on may not.

   The sample product's *words* changed with it. They were a laundry detergent,
   and a card reading "Automatic laundry detergent powder" over a carton of milk
   undoes the reason for having a picture. Every worst-case property survives and
   the strings got longer — 56 characters of English against 55, 58 of Arabic
   against 52, the same two-line spec and the same three-decimal KWD price.

   **Then the owner looked at all thirty-three offer cards at once and said they
   looked the same.** He was right, and the diagnosis is the reusable part.
   Sixteen shared one skeleton — photo top, name, spec, price tag bottom, white
   ground, 8% margins — and differed by a hairline, a 4% rail or a disc at 28%
   opacity. Eleven were a colour swap of the card beside them. Six were
   genuinely distinct.

   Four causes, all of them decisions I made:

   - **The price mark was the same object at the same size in the same place in
     28 of 33.** It is a fifth of the card. `PriceMarkStyle.frame: 'plain'` had
     existed the whole time and was used twice.
   - **Every photograph was a `contain` rectangle in the upper third**, inset 8%,
     axis-aligned. Never full-bleed, never `cover`, never dominant, never small.
   - **One margin and one alignment everywhere.**
   - **Skins varied colour only** — the weakest differentiator at the size a
     library is actually browsed. Seventeen structures times skins sounded like
     variety and produced near-duplicates.

   **Cut sixteen, added eight.** Offer cards 33 → 25, library 67 → 59. Out: every
   pure colour swap (`blk_offer_card_tinted` survives as the one tinted
   exemplar), the hairline-only variants, `blk_pharmacy` — which was `framed` in
   a different stroke colour, and a swatch is not a register — and
   `blk_photo_led`, which was `fullBleed` with an inset. In: `fullBleed`,
   `cornerFlag`, `priceBomb`, `editorial`, `platedPhoto`, `inlinePrice`,
   `nameBand`, `splitVertical`. `photoLed` stays in the file, unshipped, with a
   note saying what it would need to earn a place back.

   Two consequences worth carrying:

   - **`price()` takes a rotation now.** The corner flag needs the mark tilted
     with the band it sits in; a horizontal price on a tilted band reads as a
     mistake. Rotation is `ElementBase` placement, not composition — E6 §3
     refuses opening the mark up, not moving it.
   - **The seed had to learn to delete.** It upserts `SEED_BLOCKS` and had never
     removed anything, so sixteen retired blocks would have sat in every database
     for ever, still in the picker. `pruneSeededBlocks` deletes a retired seeded
     block, or **archives** it if a page grid or a pin still names it — a grid
     names its block inside `regions` JSON, so deleting one a live book draws
     would make a hole rather than an error. A shop's own copy is a separate row
     and is never touched: importing is copying, so nothing an owner has taken is
     taken back.
3. ~~**`pnpm db:seed` must be re-run.**~~ **Done**, and it found something. See
   below.
4. **Nothing has been opened in a browser.** Typecheck, lint, 232 engine tests,
   418 web tests, `pnpm build`, `check:classes`, the render harness and the block
   gallery all pass; the canvas interactions — marquee, snap guides, rotation
   handle, upload — have not been used by a person. **The library work of
   8 September is unopened too**: the reshaped `/brand/blocks`, the import
   dialog, and the previews with a packshot in them. Each was checked by mocking
   it at its real dimensions, which caught two defects on its own and cannot
   catch a third class — how the filter row behaves on a phone, or what mounting
   67 live previews at once costs on the mid-range Android this is built for.
   That is the check that has repeatedly found what the others could not, and it
   is the one still outstanding.

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

### The canvas was not on the screen, and it had not been since E6

**Found by opening the designer**, which is the check that had been outstanding
through all of this. The palette filled the width, the layer list sat under it,
and there was no artboard anywhere on the page.

`lg:w-72` and `lg:w-80` **do not exist in this design system**. The Tailwind
config replaces the spacing scale rather than extending it — deliberately, so an
off-system value fails loudly — and neither class compiles to anything. Both
panes therefore kept their `w-full`, each took the whole width of the flex row,
and pushed the artboard out of view.

**The offer book editor has had the identical defect since E6.** Same two class
names, same two panes. Nobody saw it because nobody had opened either canvas.

**This is the third time this exact defect has appeared**, and the token file
already documents the first: the rail said `w-16` and `lg:w-64`, both compiled to
nothing, and it was sized by its own content until `--sq-rail` was added. The
answer is the same one that file states — *a box that needs a size needs a name*
— so `--sq-pane-start` (288px) and `--sq-pane-end` (320px) are tokens now, with
`w-pane-start` and `w-pane-end` in the Tailwind config, and both shells use them.

Two things worth taking from it:

- **Nothing in the toolchain can catch this.** The class name is a valid string,
  typecheck has no opinion, the linter's rules are about *wrong* values rather
  than absent ones, and a component test would have asserted the same class name
  the component already had. Only a rendered page shows it, which is why
  consistency check #9 is a check.
- **The check that finds it is cheap and was skipped repeatedly.** Every entry in
  this file and in `E6-pending.md` ends with "nothing has been opened in a
  browser". That sentence was the finding.

### ~~Still owed on the layout~~ — fixed, 8 September

Below 1024px the two panes **stacked above the canvas** rather than overlaying
it. The design system is explicit — *"side panels overlay the canvas, never
compress it"* — and stacking is worse than compressing: on a narrow window the
artboard was pushed off the bottom of the page entirely, which is the same
symptom as the bug above by a different route. It applied to the editor equally.

`components/shared/canvas-drawer.tsx`, and it is one component for both because
§7 makes canvas parity a hard rule. See §9.

### Driving it in a real browser, at last — and the three things that found

The check that had been outstanding through every entry above finally ran:
headless Chrome, a minted dev session, the designer opened, an element clicked
and dragged. It found three defects in about ten minutes, none of which any test
could have.

**1. The canvas was not on the page.** `lg:w-72` / `lg:w-80` — see above.

**2. "Background" was a lid, not a ground.** The palette appended it like any
other element, so it painted *last* and covered the whole design; and it
defaulted to `surface`, which resolves to white on white paper, so the owner saw
their card go blank with nothing apparently added. The owner's block had two of
them — because after the first click looked like it had done nothing, they
clicked again. It now inserts at the bottom of the paint order and lands in the
shop's first brand colour.

**3. The colour swatches were collapsed to dots.** `size-7` does not exist here
either. The swatch is a box that needs a size, so it has a name now:
`--sq-swatch`, 28px.

**`pnpm --filter @souqstudio/web check:classes` exists because of the second and
third of those.** It reads the built CSS and reports every sized utility in the
source that generates no rule. Run it after a build. The full reasoning is in
`apps/web/scripts/check-classes.mjs`; the short version is that this defect has
now appeared four times, nothing in the toolchain can see it, and the cost of
each occurrence has been a screen that looks broken for a reason nobody can find
by reading the code.

**One thing broken in passing, and worth knowing.** Running `next build` while a
dev server is running overwrites the `.next` directory it is serving from, and
the dev server then 404s its own chunks until it is restarted. It cost a
confusing five minutes. Build in CI or stop the dev server first.

### A tool, not a form — the interface pass

The owner's second look: *"can we make the left side look like a toolbar in
Photoshop, Illustrator and Canva, use icons familiar to that kind of tool even
in the settings, and let the layer list be dragged to change the index."*

All three were right, and the first one is the one that matters: **a labelled
list of cards reads as a form, and a form is what was rejected.** Every
application named puts a narrow strip of glyphs on the start edge, so a shop
owner who has opened any of them arrives already knowing where the shapes are.

- **The tool rail** — `ToolRail.tsx`, 56px, the pointer first and then the
  conventional glyphs: a paint bucket for a ground, a square, a circle, a rule,
  a `T` for type, an image-plus for an upload. **The two with no convention are
  the two that are ours** — a product field and a price mark exist in no other
  design tool — so those sit in their own tinted group below a divider, which is
  also one of the three places bound elements have to be marked.
- **Icons only where a convention exists.** Alignment, italics and case became
  buttons; weight stayed a list, because four named weights are four values an
  owner picks between and a `B` would collapse them to two. A binding — *what
  does this text show* — stays a select: there is no glyph anybody has seen for
  "product name", and inventing one is not borrowing a vocabulary.
- **Layers drag, and front-most is at the top.** That is the order all four
  tools use, and it is the reverse of the array underneath — index 0 paints
  first, so it is furthest back. The list renders reversed and translates on the
  way out; getting that backwards would send every drag the wrong way.

**Every icon carries its name** in `title` and `aria-label`. An icon rail is
fast for people who know it and opaque for people who do not, and that is the
entire cost of the pattern.

### Three more things the browser found

Only one of the three was in what the owner asked for. All three were invisible
to every test.

**The shell was `min-h-screen`, so nothing scrolled inside it.** A canvas
application's shell is exactly the window; with a minimum instead of a height,
the three-pane row had no definite height to divide, `flex-1` sized to content,
the `overflow-auto` on each pane never engaged, and the *document* scrolled — a
1,188px card ran off the bottom of the window and took the tool rail and the
properties panel with it. **The offer book editor had the same bug**, and both
are now `h-screen overflow-hidden`.

**Fit-to-view then silently did nothing**, because it measures the column it is
fitting into and that column was as tall as its content: the ratio came out
above 1 and clamped to 100%. With the shell fixed, a tall card opens at 66% and
the whole thing is on screen — which is what every tool this is modelled on does
on open, and for the reason that the first thing you need is the whole thing.

**The layer names were truncated to `Prod…`** once the rail took 56px out of a
288px pane. `--sq-pane-start` is 344 now.

One bug of my own worth recording: the fit effect marked its work done *before*
its early return, so a first pass that ran before layout — when the column has no
height — locked the fit out permanently. The guard has to come after the thing it
is guarding.

### The controls were four hand-rolled segmented controls

*"The italics and AB icon are not looking great — for text alignment I think we
have a better grouped button we can use."*

Right, and the cause was worse than the symptom. **Four surfaces had each grown
their own version of the same control**: the language switch, the canvas-shape
picker, the alignment buttons and the italic/case pair. Four shells, four sets of
borders, four ideas of what selected looks like — which is precisely what
`references/component-inventory.md` exists to prevent, and there was no entry for
it because nobody had built one.

`components/ui/segmented.tsx` is the one, and the inventory entry is written.

- **One bordered shell, flush segments inside.** The pair of italic/case buttons
  had a border each, so they read as two unrelated controls that happened to sit
  next to each other rather than one group about one thing.
- **Two components, not a `multiple` flag.** `Segmented` is one-of-these —
  choosing one unchooses the others — and `ToggleBar` is any-of-these. An owner
  reads which they are looking at before they touch it, and a mode prop hides
  exactly that.
- **`TT`, not an icon.** The mark for uppercase *is* type: every design tool
  draws it as letterforms, no icon set carries it, and lucide's `CaseUpper` is an
  `AB` that reads as neither. `Segment.glyph` renders it in the interface face,
  which is a better version of letterforms than any 16px drawing of them.
- **A `Field` wrapper in the panel**, because `Input` and `Select` draw their own
  labels and a bare row of buttons would have none. The panel is a list of
  decisions and a decision without a name is a puzzle.

---

## 9. Gradients, the drawers, and a calendar — 8 September

Three of the four things §6 and §8 left owed. What is deliberately still not
built is at the end.

### Gradients: the estimate was wrong about which part was hard

§8 said gradients were "a `ColorValue` variant rather than a rewrite". The type
change *is* four lines. **The seam is `resolveColor` returning a `string`**, and
that is what made it look like a rewrite to anyone who opened the file.

A flat colour is a string in every target — an SVG attribute, a canvas
`fillStyle`, a PDF colour operator. A gradient is not. SVG needs a
`<linearGradient>` *in the document* and a `url(#id)` pointing at it, and CSS
`linear-gradient()` syntax is **not** valid in an SVG paint attribute, so there
is no version of this where the string form quietly keeps working.

So `resolvePaint` is the new seam and hands back a discriminated value; the
renderer materialises it. `resolveColor` stayed, narrowed to `FlatColor`.

- **The narrowing is the design.** `ColorValue` gained a gradient arm and every
  field except a shape's `fill` was retyped to `FlatColor` — so the compiler
  named all eight call sites that had to decide, rather than a reviewer being
  asked to find them. Gradient text and gradient hairlines are how a card stops
  being legible at the size a booklet prints; neither has been asked for, and
  widening a field later is one word here plus whatever the renderers then owe.
- **The gradient line is computed in the engine, not the renderer.** Both
  painters read `x1`/`y1`/`x2`/`y2` from `gradientVector`. Two renderers agreeing
  on the stops and disagreeing on the angle is exactly the drift `packages/engine`
  exists to prevent, and it is the kind that survives review because both
  pictures look plausible. The half-length is `(|cos| + |sin|) / 2` rather than
  `0.5`, or a 45° run stops before the corner it is aimed at and both ends flatten.
- **Stops are sorted in `resolvePaint`, not refused at the edge.** An owner drags
  one stop past another and the array stops being sorted; `<linearGradient>`
  ignores an offset that goes backwards, so an unsorted document would draw
  differently in SVG than anywhere that sorts. Refusing it would reject work the
  owner can produce with one drag.
- **Definition ids carry a per-surface prefix.** `/brand/blocks` draws every block
  the shop owns on one page, ids are document-global, and two blocks imported
  from the same seed carry identical element ids — so without the prefix the
  second card's ground silently adopts the first card's gradient. That failure
  looks like a rendering bug and is a naming one.
- **No seeded block may hold one**, by construction: `usesOnlyRoles` tests
  `from === 'role'` and a gradient's `from` is `gradient`, whatever its stops
  name. The shipped library stays flat. The design system's "no gradients" is
  about *our* surfaces, and a card the owner drew is not one of ours — that
  distinction is now written down rather than assumed.
- **A stop cannot be a gradient**, in the type and in the schema. One level, no
  recursion, no depth check.

### The drawers, and why they are one component

`components/shared/canvas-drawer.tsx` is used by the designer and the offer book
editor, because §7 makes canvas parity a hard rule and a drawer that behaved one
way in one of them would be the divergence that rule exists to prevent.

- **Toggled with `hidden`, not a transform.** Tailwind's translate utilities are
  physical, so sliding a drawer needs a second set of `rtl:` classes on every
  pane — four rules to get a direction right in a product that is half Arabic,
  for an animation nobody asked for.
- **No scrim.** The system defines no scrim token — the reasoning is already in
  `ui/dialog.tsx` — and inventing an rgba to dim a canvas would break the
  no-raw-colour rule for decoration. The pane is opaque and hairline-bordered
  like every other surface; the click-catcher behind it is transparent.
- **One drawer open at a time.** Two open on a 700px window is the whole canvas
  covered, which is the bug this replaced.

### E7-03, and the reason it had been blocked

§6 recorded seasonal scheduling as blocked on two things: no picker, and no dates
on the seeded rows because *"Ramadan and both Eids move against the Gregorian
calendar"*.

**The first blocker had already gone** — `BlockImportDialog` is a picker, built
when the library outgrew the page. Nobody went back and noticed.

**The second is answered by not storing dates at all.** A date seeded today is
wrong within a year and silently wrong after that, which is exactly why those
columns stayed null. `packages/engine/src/seasonal.ts` derives the window
instead: a seeded block names an occasion, and the occasion knows whether it is
fixed to the Gregorian calendar, fixed to the Hijri one, or a property of the
shop's country. Nothing to re-seed, and the library shipped today is still right
in 2032.

- **`islamic-umalqura`, through `Intl`.** It is the civil calendar the Gulf
  states publish and therefore the one shops print against; the astronomical and
  tabular variants disagree by a day, and a day is the whole difference between
  a band appearing on Eid and after it.
- **Ramadan ends the day before Shawwal opens**, which is correct in a 29-day and
  a 30-day month without knowing which it is.
- **National day reads `organizations.country`.** Six different dates across the
  Gulf, and greeting a Saudi shop on the second of December is worse than no
  band. A country not in the list gets no window rather than a wrong one.
- **A three-week lead on the occasions people plan a campaign around.** A band
  that appears on the first of Ramadan appears after the issue it belonged in.
- **`activeFrom`/`activeTo` keep their meaning for a block the shop authored** —
  a shop's own anniversary is a fact about that shop and nothing can compute it.
  `blockWindow` is the one question, asked of whichever source owns the answer.
- **The now is read after mount.** `new Date()` during render answers differently
  on the server and in the browser, which on the day a window opens is a
  hydration mismatch and a picker that reorders for a frame.

One bug worth recording, because it was invisible and the test that caught it was
a property rather than a date. `fromHijri` rounded *milliseconds* instead of
days, so every date it returned was at 11:03 in the afternoon rather than
midnight — which nothing showed until the end-of-day calculation added a day less
a millisecond to one and landed in the next Hijri month. Ramadan's last day
reported as the first of Shawwal. Rounding whole days before multiplying is the fix.

### What this did not do

- **Text on a path, shadows, blend modes.** Still not in the model, still not
  asked for.
- **Dragging a *new* element from the palette.** §6.1 stands: tapping adds it,
  which is the tablet-safe equivalent the design system asks for anyway.
- **The overlay asset library**, §6.3 — still blocked on the asset-table decision
  in §8's "did not do" list, not on effort.
- **Thumbnails, the per-book block snapshot, the admin half.** §6.4, §6.5, §6.6,
  all still deliberate.
- **Seasonal blocks are promoted in the *import* picker, not in a composer.**
  That is the picker that exists. The editor still composes a book from the
  seeded grid rather than from a chosen block, so §6.2's "build it when the
  composer chooses" remains true of the composer — what is built is the half that
  had a surface to live on.

### And the check that keeps being the one that finds things

`pnpm --filter @souqstudio/web check:classes` ran clean — 65 sized utilities, all
resolving — but only after it flagged `canvas-drawer.tsx`. **The offending class
name was inside a doc comment**, quoted while explaining the bug the checker was
written for. The checker reads source text and cannot tell prose from markup, and
a permanent false positive in the one check nobody should learn to ignore is
worse than the comment was useful. Utility names are spelled around in that file
now, with a note saying why.

`next build` was run into `.next-verify` via a temporary `distDir`, because
building into `.next` while a dev server is serving from it costs the five
confusing minutes §8 already recorded. The config change was reverted; if this
keeps happening, a one-line env-var escape hatch in `next.config.mjs` is the fix.

**Still not opened in a browser.** Typecheck, lint, 746 tests and the class check
all pass, and the build compiles every route — but §8's own lesson is that those
four things were green for every defect a browser found in ten minutes.

---

## 10. The gradient control was a form, and the model had no alpha — 9 September

The owner's verdict on §9: *"we don't have transparency in the colours, we need
rgba or something, and the interface is poor."* Both right, and the second one is
the same mistake §8 already recorded — a labelled list of fields is a form, and a
form is what was rejected the first time.

### Alpha, and why the six-digit rule bends here and nowhere else

The rule in `block-document.ts` was **"alpha belongs to the element's
`opacity`"**, and its reasoning is sound: a flat fill at half alpha and an element
at half opacity are the same picture, so two controls saying one thing is two
that eventually disagree.

**That reasoning stops at the edge of a gradient.** A ground that fades out is
opaque at one end and gone at the other. Element opacity fades the whole thing
uniformly and cannot express it, so the missing feature was not a variation on an
existing control — it was a design nothing in the model could describe. Fading a
ground out is also not an exotic ask; it is most of what people reach for
gradients to do.

So `GradientStop` carries an `opacity`, and the six-digit hex rule is untouched
everywhere else — including *inside* a gradient, where a stop's colour is still
six digits.

- **A field, not `#RRGGBBAA`.** Eight-digit hex would carry alpha only on a
  literal. A stop names its colour the same three ways everything else does, so
  "fade my brand's primary to nothing" — the exact thing owners want — would be
  the one gradient the palette could not express, and the escape hatch would
  become the only route to a common design.
- **It maps to SVG's own `stop-opacity`**, so the painter carries colour and
  alpha as the two separate things they already are. `resolvePaint` defaults it
  once, so "not written" and "1" cannot come to mean different things in two
  renderers.
- **The CSS preview is the only place they get combined**, because a CSS gradient
  has nowhere to put alpha except inside the colour. That conversion lives with
  the control and never touches the artboard.

### The control: on the ramp, not beside it

The first version had a row of swatches disconnected from the preview, a
percentage typed into a number field, and an angle typed into another. Three
fields describing a picture that was sitting right above them.

- **Handles on the bar, dragged to move.** The position of a stop is a spatial
  fact and a spatial fact should not be typed. Click the bar to add one; arrow
  keys nudge, because a control that only answers to a pointer is one that half
  the people using it cannot reach.
- **The stops are held in document order, not sorted.** Sorting on every write
  renumbers them mid-drag, so dragging one past its neighbour would leave the
  pointer holding a different stop — the handle jumping out from under the
  cursor. `resolvePaint` sorts when it paints, which is the only place order
  matters. This was a bug waiting in the first version's `[...stops].sort()`.
- **A checkerboard behind the ramp**, or a stop at zero opacity reads as white
  and the owner cannot tell transparent from the colour of the paper.
- **Eight directions instead of a degree field.** An angle in degrees is a number
  an owner has to imagine. The arrows are physical and deliberately do *not*
  mirror in an Arabic interface — `Segmented` has a `mirror` flag for glyphs that
  point somewhere and it is deliberately not set, because the angle is measured
  against the artboard and an owner who aimed a run at the bottom-right corner
  meant that corner. The document still stores any angle 0–360, so a value set
  elsewhere survives a round trip.
- **No new control was invented.** Opacity is a percent `Input`, exactly as the
  element's own opacity already is in `Appearance`; the direction picker is the
  existing `Segmented`. §8 ended with four hand-rolled segmented controls being
  collapsed into one, and adding a fifth one-off here to avoid reusing two
  existing ones would have been that mistake with the ink still wet.

**Still not opened in a browser** — and this is now the third entry in a row
ending that way, on a control whose entire substance is pointer behaviour. The
drag, the pointer capture, the click-to-add and the checkerboard are precisely
the class of thing every test here is blind to. Typecheck, lint, 429 web tests,
265 engine tests and `check:classes` at 65 utilities all pass, and none of them
has ever seen a handle move.

---

## 11. Five notes from the designer on screen — 9 September

The owner, looking at the real thing: the tool rail needs a start border, the
layer list should collapse the way the navigation does, *"what you value like
1–100 should be slider"*, the selection outline is too heavy, and the mid-edge
handles are too big.

All five are the same class of finding as §8's — things only visible on a screen,
and none of them reachable by any test in this repo.

### The selection was competing with the card

A 1.5px minimum at full opacity draws a hard blue box around the thing the owner
is trying to look at. On a photograph it reads as part of the design. The outline
is thinner and part-transparent now; the handles keep full opacity, because they
are targets rather than decoration and a target you have to hunt for is worse
than a line that is slightly loud.

**Mid-edge handles are drawn at 62% of a corner's size, and their hit area did
not change.** A corner resizes both axes and is the one reached for most, so it
earns the larger mark — that is what every tool this is modelled on does. Each
handle now has a transparent hit rect at half again the full size behind the
visible square, because shrinking the thing you have to grab is how "tidier"
becomes "harder to use on a trackpad", and that difference does not show in a
screenshot either.

### A slider, and the rule for when to use one

`components/ui/slider.tsx`, with an inventory entry, because §8 ended by
collapsing four hand-rolled segmented controls into one and the next one-off
would have been that mistake with the ink still wet.

**The rule is whether the number or the result is the point.** An owner setting
opacity is looking at the card and stops when it looks right; a field makes them
convert that judgement into a number and back. An owner setting a rotation or a
corner radius has a number in mind. So opacity — the element's, and a gradient
stop's — is a slider, and `Turn`, radius, price and every count stay fields.

Native `<input type="range">` styled under `.sq-slider` in `globals.css`, the
same arrangement as `.sq-swatch` and for the same reason: track and thumb are
vendor pseudo-elements no utility class reaches. The readout is always shown —
a slider without one leaves an owner unable to say what they set.

### The rail had a border on one side only

`border-e-hairline` and nothing on the start edge, so the rail met the dashboard
navigation — the one dark surface in the product — with no line between them.
Two panels meeting like that read as one panel with a colour change in the
middle.

### The layer list collapses, and the toggle is on the rail

**Not in the list.** A toggle inside the panel can only ever close it; the way
back has to be somewhere still on screen, which is why the dashboard navigation
keeps its own toggle on the strip. The pane narrows to the tool rail's width from
`lg` up, and below `lg` the list always shows — there the pane is a drawer the
owner opened on purpose, and hiding the list would leave them holding a drawer
full of tools they could already reach.

**The state is not persisted**, unlike the dashboard rail's cookie. That one is a
cookie because the shell renders on the server and the width has to be right
before the first paint; this pane is inside a client component reached from one
screen. If owners turn out to collapse it every session,
`lib/rail-preference.ts` is the pattern to copy.

### The width prop, and why it is not a class name

`CanvasDrawer` grew an `lgWidth` prop rather than taking the override through
`className`. Both values are project tokens rather than stock Tailwind, so `cn`'s
merge cannot be relied on to know that `w-pane-start` and `w-tool-rail` conflict
— and a width silently losing to another width is precisely the failure
`check:classes` was written to catch after the fact rather than prevent.

**Still not opened in a browser.** Four entries in a row now, and this one is
entirely about how things look and how a pointer behaves.

---

## 12. The properties pane was overflowing, and the cause was one flex item — 9 September

Four more from the screen: the gradient control still reads badly, *"right window
overflow and a scroll appearing"*, the two bars of chrome over the canvas should
be one card with a dropdown, and the layer list still is not collapsible.

### The overflow, which was also three other bugs

**One flex item was setting the minimum width of the whole pane.** The eight
direction segments want about 330px in a row; `--sq-pane-end` is 320 with 288
inside it. A flex item does not shrink below its content — `min-width: auto` is
the default — so the pane's content box grew to 330, a horizontal scrollbar
appeared, and *everything right-aligned in the panel went off the edge with it*.

That one fact explains three separate complaints:

- The opacity **slider looked missing**. It was there. Its readout is
  right-aligned and its thumb was at 100%, so both sat in the overflowed strip.
- The **remove button was cut to "Rem"**, for the same reason.
- The **scrollbar** was the symptom the owner actually named, and it was the only
  one pointing at the cause.

The `overflow-x-auto` wrapper that was supposed to contain the row could not: a
scroll container still reports its content's min-width to the flex layout unless
it is told it may shrink. The row is a 4×2 grid inside the same bordered shell
now — still one control, and it has no min-width to impose. `flex-wrap` was tried
first and breaks six and two at this width, which looks like a mistake rather
than a layout.

**Worth generalising.** Any control wider than ~288px placed directly in the
properties pane will do this again, and it will present as something unrelated
going missing on the right-hand side rather than as a width problem.

### The gradient control

Beyond the overflow: the handles were `--sq-swatch` at 28px on a 48px bar, which
read as swatches parked on the ramp rather than as handles in it — 20px now. The
two-line instruction under the bar is one short line. And the colour rows now say
**which stop they edit**: without that they are three rows of swatches with no
stated subject, and an owner clicks one, sees a colour change somewhere on the
bar, and has to work out which handle moved by watching.

### One card at the top

The shape picker floated on the dark surround above a separate pill of tools —
two bars of chrome over one canvas. They answer the two halves of one question:
what am I designing, and what am I doing to it.

`CanvasToolbar` takes a `leading` slot and the shape control goes in it: a
`Select` for a block placed once, the layout tabs for a repeating one. A card
rather than a pill, because a pill is the shape of a row of icons and this row
now starts with a field. It is `sticky` so a tall card scrolling under it does
not take the tools off the screen.

**`ArrangementTabs` had to lose `text-inverse`**, which existed for the dark
surround and would have been white on white the moment the tabs moved onto a
light card. Nothing would have failed — the tabs would simply have been invisible,
which is this codebase's most repeated failure mode written in a different colour.

### The layer list toggle nobody found

The toggle from §11 works; it is at the bottom of the tool rail, which is where
the *reopen* control has to live and is not where anyone looks to close a panel.
So the heading carries one too. A close control belongs on the thing being
closed; the rail keeps its copy because once the pane is gone, a control inside
it is gone with it.

**Still not opened in a browser.** Five entries now. Every finding in this one
came from a screenshot, and the overflow — the single cause of three of them —
was invisible to typecheck, lint, 694 tests, the build and `check:classes` alike.

---

## 13. Four layouts called "Banner", and the save that was failing silently — 9 September

The owner, on the new top card: *"I can see more than one banner in the top bar,
what is that? I think we can handle that in a dropdown, and each I think we have
to use icon."*

### The tabs had stopped naming anything

`shapeName` maps an aspect range to one of four words, and everything above 2.6:1
is "Banner". **`add()` produces exactly those**: it starts the new range at the
widest one already present and doubles it, so the second, third and fourth
additions are all in banner territory. Four tabs reading "Banner", identical, in
a control whose whole job is to say which one you are on.

A dropdown now, as asked, and the label carries the proportion — `Banner · 3.7:1`,
`Banner · 7.4:1`. Ratios rather than the raw aspect, and inverted below square:
nobody describes a portrait card as "0.71 to 1".

**The icon is drawn rather than chosen.** Four layouts that are all banners would
get the same glyph from any icon set, which restates the problem instead of
solving it — so `ShapeGlyph` draws a rectangle at the layout's real proportion. A
box at 3:1 and a box at 12:1 do not look alike, and this is the rare case where
drawing the thing is less work than naming it. Its height is floored so a very
flat band stays a rectangle instead of becoming a hairline that reads as a
divider. The shape picker for a block placed once takes the same glyph.

### The screenshot also showed a block that could not save

Seven layouts, and `Not saved` in the corner in red.

**`MAX_ARRANGEMENTS` is 6 and only `arrangementsSchema` knew it.** Nothing in the
designer stopped an owner adding a seventh, so every autosave from that point on
was refused — and the entire report of that failure, on screen, was two words.
The block still edits, still draws, still says the shop's name; it just never
persists again.

Two fixes, because they answer different questions:

- **`add()` refuses at the cap and the button is disabled**, with the reason in
  its `title`. A limit the interface does not know about is a limit the owner
  meets as a bug.
- **A block already over the cap says so**, in the same place the grid problems
  appear, and says what to do. The Add button cannot help someone who is already
  past it, and `arrangementsSchema` is a long way from this screen.

**This is the first defect in this file that a test could plausibly have
caught** — the cap is a pure number and the store is unit-tested — and it still
took a screenshot, because nothing tested the *pairing* of a client that can
produce a document and a schema that refuses it. Worth remembering the next time
a limit is written in one place.

**Still not opened in a browser.** Six.

---

## 14. The layout picker is a row, not a field — 9 September

*"That layout dropdown maybe a dropdown menu, and we can use the text and box in
one line, or instead of the text use an icon."*

Right, and the version §13 shipped was the half-answer: a `Select` with the shape
glyph parked *beside* it. `Select` draws its label above its field, so on a
toolbar it is three stacked things in a row of flat ones, and a glyph sitting
next to it reads as a second control rather than as part of the first.

**`components/ui/inline-select.tsx`, and the pattern was already in the repo.**
`ShopSwitcher` lays a bare native `<select>` transparently over its own row, with
the visible markup `aria-hidden` and the accessible name on the select — the
inventory blessed that in E2 as the answer to "a select that should not look like
a form field". This is the same arrangement, generalised, with a `leading` slot
for a mark.

It buys the thing that made the ask hard: **a native `<option>` cannot carry an
icon**, so a list of glyphs is impossible in any real `<select>`. Putting the
glyph on the *row* rather than in the list gives the owner the shape of the
layout they are on, at the cost of the list still being text — which is why the
option labels keep the proportion in them and have to stand alone.

**Not a hand-rolled menu**, which was the other reading of "dropdown menu". A
listbox built from divs owes keyboard navigation, focus return, type-ahead,
scroll containment and a screen-reader contract; the platform does all five here
already, and this project has one very recent lesson about what happens when a
control is rebuilt rather than reused.

The toolbar went back to `items-center` and lost the baseline nudges §13 added —
those existed only to cope with a label sitting above a field, and there is no
label above anything in the bar now.

**Still not opened in a browser.** Seven.
