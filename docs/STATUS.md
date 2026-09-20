# Where the project stands

Read this before starting an epic. It says what is built, what is blocking, and what each
of the remaining epics needs before it can begin.

Last updated 20 September 2026.

**E14 is under way. Its first gate is passed and three of its nine phases are
built.** `docs/E14-layout-frames.md` is the design, `docs/E14-implementation-plan.md`
the phased work, **`docs/E14-progress.md` what is actually done**, and
`docs/E14-phase-0-findings.md` the measurements that changed the plan. §1.9.

Built: **Phase 0** (the gate), **Phase 1** (the data map, which ships alone),
**Phase 3** (paint), and Phase 7's paint controls early. **Phase 2 — frames and
the solver — is the next real work and nothing after it is startable.**

Four findings from Phase 0 changed the plan and are worth knowing before
touching any of it:

- **`estimateWidth` is off by 5–40% at the median**, not "slightly", measured
  over 1.1M strings — the whole catalog, both scripts, all 31 brand-kit faces.
  But **word-segmented HarfBuzz matches Chromium's canvas at 0.000% through
  p99**, so `hug` is buildable and the plan's fallback of shipping numbers from
  the server is not needed. Two itemization rules fell out of measuring: shape
  per *word* (Chromium's word cache skips kerning across spaces) and itemize per
  *bidi run* (the entire Arabic residual is mixed-direction tokens).
- **Self-hosting the brand-kit fonts moved onto E14's critical path.** It was
  E9's. A shaper needs the font file, not a CSS link. `fonts:mirror` is written
  and has never been run.
- **§2.4's gradient row overstates the damage.** A gradient with alpha stops
  emits a vector shading pattern plus a page-sized soft mask, and **the page's
  text survives** — it is resolution-limited rather than page-destroying. It
  stays banned on the export path; the disqualifying case is
  `filter: drop-shadow()` over text, which takes the font out of the PDF
  entirely. `pnpm --filter @souqstudio/engine export:check` is that measurement,
  in the repo now, 11 cases.
- **§8's ring-count question is closed.** 24 ringed bursts at 300 dpi is 1,992
  paths, 274 kB, zero rasters. No cap needed — except on **text**, where a
  glyph's ring is the string again under a stroke and Chromium outlines it:
  ~24 kB a ring, 663 kB for one softly-shadowed price. Text takes a hard shadow
  and the schema refuses any blur on it.

**Home is a shelf of book covers.** The six most recent draw their own first page — the
real `BookPage` at thumbnail size, not a stored image, so a cover cannot disagree with the
book it stands for. Earlier ones are the same shelf inside a dialog, drawn twelve at a time
by `POST /api/v1/offer-books/covers` when it is opened. `docs/E6-create-flow.md` §22–§23.

**A price list now survives being walked away from.** `offer_book_drafts` (migration
`20260915120000`) keeps the sheet, the column mapping and every choice an owner has made,
autosaved on the usual two-second debounce, and the create screen says so. Nothing is
written to the catalog or to `offer_books` until the book is actually made — which matters
because creating one now also writes the shop's own products for rows the catalog has never
seen. `docs/E6-create-flow.md` §21.

**The creation flow was rebuilt, the page itself is designable, and the editor grew a tool
rail.** Starting a book is four steps instead of one form, the twenty-five seeded offer
cards are finally reachable from it, a price list can be dropped straight in, and a page
can carry a colour, a gradient or a photograph behind its cards. `docs/E6-create-flow.md`
is the record. §1.4.

**The block designer is a design tool, it has a library to design from, and the first AI
feature is live on dev.** A shop owner can build an offer book end to end — create it,
price it, adjust it, lay it out, pin panels into it, duplicate it next week — design the
blocks it is built from, start from **sixty-six seeded blocks**,
and now **photograph a card they like and get one of their own back**. What no owner can do
is get any of it out of the product, which is E9.

**The offer cards were redrawn from real cards, 19 September.** All twenty-five
structures in `library-cards.ts` were rebuilt against seven photographed reference cards —
a Gulf quick-commerce tile, two German discounter leaflets, an electronics deal card, a
Bahraini grocery tile. Three registers the library had no answer for arrived
(`blk_top_ribbon`, `blk_deal_frame`, `blk_price_pill`); `blk_price_first` and
`blk_split_tint` retired. **A re-seed is required** — `pruneSeededBlocks` deletes the two
retired ids, or archives either one a live book still names. The four changes that carry
it: the price is placed per register instead of running the full measure at the foot of
sixteen cards, the brand gets its own line on nearly every card, the detail block gets two
or three lines instead of one caption, and a card carries a chip *or* the mark's attached
tab and never both. §1.8.

**The library is distributed through R2 and dev reads it.** `BLOCK_LIBRARY_URL` decides
the source per environment; unset is the repo. `docs/block-library-from-r2.md`, and read
its §12 before changing anything `validateBlock` warns about — a stricter check
invalidates every object already published, and it took the dev deploy down on the 10th.

**Uploads work on dev as of 15 September.** The `R2_ENDPOINT` shape was corrected on
Railway and the bucket now answers a browser PUT — the three faults in §2, found over one
afternoon on 8 September, are closed on that environment. **Production has had none of it
applied**, and the CORS policy in particular is a per-environment step rather than a code
change. §2.

**`Toast` is built, which unblocks undo-over-confirm everywhere.** It had been `spec` since
E2 for want of a mounting mechanism, and the first thing built on it is a removal an owner
can take back: `E2-pending.md` §3's second compromise is now a change waiting to be made
rather than a constraint. §1.6.

**Two things about today are worth more than the feature list.**

The designer was rejected on its first outing — *"fundamentally not what I want; the user
is too stuck with us"* — and the useful part of that was separating the constraints doing
real work from the ones that were only caution. Three survive: product text is bound rather
than typed, coordinates are fractions of the block, and the *repeating* card reflows rather
than being hand-placed. Everything else opened. `docs/E7-pending.md` §8.

And **it was finally opened in a browser**, which found four defects in an afternoon that
every test had passed over — including one that had been shipping in the offer book editor
since E6. See §1.0; it is the most re-usable thing in this file, and on 11 and 12 September
it collected three more entries. **The repository still has no browser driver**, and every
one of those three was found by the owner opening a screen rather than by anything in the
toolchain.

Per-epic detail lives in the working notes: `docs/E2-pending.md`, `docs/E3-pending.md`,
`docs/E4-pending.md`, `docs/E5-pending.md`, `docs/E6-pending.md`, `docs/E7-pending.md`,
`docs/E8-pending.md`.
The epic specs themselves (`docs/E1-*.md` … `docs/E13-*.md`) stay the record of what was
asked for — corrections to them are recorded in the pending notes, not edited in.

**`docs/composition-model.md` is the architecture now, and it is built.** Read it before
touching E6 or E7. It supersedes E6 §2 and §5, changed the E4 brand-kit shape, and absorbed
most of what E7 was scoped to do — E7 is the block designer that was left, and it is built. In one sentence: *a brand kit is identity, a block is a
designed building block, a page is a spreadsheet of regions filled with blocks, and
products flow through it.*

**One line to remember before picking anything up: the loop closes now.** A shop owner can
create an offer book from the catalog or from a price list, see it drawn, price it, reorder
it, lay out each page — merged cells, its own paper, a chosen block in any cell — and edit
it, `/editor/new` to `/editor/[id]`. The dev
database holds real books, offers and items written through that path rather than through a
script, including books made through the rebuilt wizard.

**What that leaves on the critical path is E9, and nothing else is close.** A book can be
made, priced, adjusted, laid out page by page, duplicated and designed for — and it cannot
leave the product: the `pdf` worker still throws, so there is no export, and E10's share
paths do not exist. Nothing an owner builds can reach a customer. **Every day spent on the
editor widens that gap**, and the last two were.

---

## 1. Built

| Epic | State |
| --- | --- |
| **E1** Authentication & onboarding | Built. Signup, login, email verification, password reset, TOTP two-factor with backup codes, org-wide 2FA policy, the four-step brand setup wizard, and the getting-started checklist. |
| **E2** Organization management | Built. Org settings, shops (add, deactivate, archive), team and invites, per-shop access, brand inheritance. See `E2-pending.md`. |
| **E3** Billing & subscription | Built. Plans, Checkout, upgrade/downgrade, cancel and resume, shop add-on billing, AI credits with rollover and top-ups, invoices, Stripe portal, webhook. See `E3-pending.md`. |
| **E5** Product catalog | **Mostly built.** E5-01 search, E5-02 category browsing, E5-03 barcode lookup, E5-04 add-a-product and E5-06 CSV import ship at `/catalog`. Not written: XLSX, the camera scanner, E5-05's contribution queue, E5-07 phone capture, and the `bg` worker's catalog branch. The import commits into the catalog and stops short of creating offers, which needs E6. See `E5-pending.md`. |
| **E6** Offer book editor | **Built, and the front of it rebuilt on 10–12 September.** Creating a book is four steps rather than one form — pick what you are making (booklet, post, status, poster), pick the offer card from the seeded twenty-five, add products by search *or* by dropping a price list in, then preview what you made and keep it or discard it. Nobody is asked for a name; the editor renames. Then: draw it, price it, set tiers, reorder by drag, add and remove offers, join two products with an `or`/`and`, set unit price, chips, footnotes, extra charges and per-book product names, nudge a card within bounded limits, undo and redo, autosave, change the master grid, **set the page margin, its header and footer bands, and a page background of a colour, a gradient or an image**, pin a panel, and duplicate the whole book. **Since 12–13 September a page is something an owner lays out**: select cells and merge them, give one page its own paper, and put any block in any single cell — a brand panel in a cell stops it taking a product and the products route around it rather than being dropped. All three belong to the page they were made on, not to the book. The start pane is a tool rail grouped by scope — Offers, Layout, Background, **Page**, Pins. Not written: dragging track edges, and the two block element kinds the unit-price line and footnote markers would need to *print*. Still no Fabric anywhere. See `E6-create-flow.md`, `E6-pending.md` §8 and §10, and §1.5. |
| **E7** Block designer | **Built, rebuilt, and then made to look like the tools it is competing with.** `/brand/blocks` is the library; `/card-designer/[blockId]` is the designer. A tool rail of the conventional glyphs on the start edge, a layer list that drags to reorder with front-most at the top, and a canvas that opens fitted. Multi-select and marquee, group, align, distribute, snap with guides, drag, resize, rotate, opacity, any colour from the palette or a hex, any type size, weight, case and italics, rectangles, circles, lines and strokes, uploaded artwork, a price mark whose colour and frame are the shop's, keyboard nudge and clipboard, undo, autosave, version history. A block placed once is designed at a page shape rather than a card. **The seeded library is sixty-five blocks** — twenty-five offer cards, seven headers and covers, nine panels, five footers, eight square social posts and eleven seasonal bands — and the screen changed shape with it: `/brand/blocks` is now the shop's own blocks alone, with "Add from library" opening a filtered, multi-select picker. Gradients shipped on shape fills. **The price mark now draws from the shape kit too** — a burst, a tag, a ribbon or nothing, fitted by `layoutPriceMark` rather than hand-placed behind it — and the library was pulled apart so twenty-five cards stop reading as one card in costumes. See §1.3. Not written: seasonal *scheduling* (the blocks are marked `isSeasonal` and carry no dates, because Ramadan and both Eids move against the Gregorian calendar). See `E7-pending.md` §8. |
| **E8** AI features | **Eight of nine built, and the image half is running against a live model.** E8-07 magic block, E8-08 brand direction, E8-09 logo mark, E8-05 background removal — now including the manual action and the credit that had never been charged — and E8-01 to E8-04: characters, poses, described poses and covers, behind `IMAGE_PROVIDER` (Gemini default, Qwen second). **E8-06 `enrich` is the one that is not built**, and it is E5's Arabic blocker. **E8-01 was rebuilt the day it shipped** — see §1.7. What is still owed: **E8-02 and E8-03 have routes and workers but no UI** — `CharacterGallery` renders poses and cannot make one. **E8-04 shipped on 16 September** as "Generate a ground" in the editor's page-background control: a drawn background reaches a page through `PageBackground`, which needed no schema change because a cover key already satisfies that route's org-prefix check. The *composite* — name, logo and character on top — is still E9's. See `E8-pending.md` §3, §3a and §3c. |
| **E4** Brand setup | Built, and **reshaped by the composition model**. `/brand` is four cards — logo, colours, typography, blocks. The kit holds *identity only*: an open-ended named palette, definable text styles with a Google Fonts picker, and no layout at all. The setup wizard dropped from five steps to three. See §1.1. |

**Not an epic, but built:** the layout engine, the block schema and the first renderer.
See §1.2 — it is most of what E6 and E7 were scoped to do.

Everything else is unstarted: **E9, E10, E11, E12, E13**. Their route directories
exist and are empty. E8 now has eight features in it and one that is not — `enrich`,
which is also what is holding up E5's Arabic editions.

`apps/web/lib/features.ts` is the machine-readable version of this table. A control whose
destination is not built renders disabled with the reason visible, or is omitted. **Flip
the flag in the change that adds the route** — that is the whole point of the file. The
left rail now reads those flags, so an unbuilt destination is not rendered at all;
`/catalog` and `/analytics` had been shipping as live nav items pointing at 404s.

### 1.0 What opening it in a browser found, and why nothing else could

The designer and the editor had been reported "built" for two days on the strength of
typecheck, lint, 630 tests and a production build. On 8 September a headless browser was
finally pointed at them. It found four defects in an afternoon.

**Three of them were the same defect.** This system *replaces* Tailwind's scales rather
than extending them — deliberately, so an off-system value cannot silently work — and the
cost is that an off-system class name is not an error either. It is a valid string that
generates no CSS, so the element is simply unstyled.

| Where | What was written | What happened |
| --- | --- | --- |
| The rail (earlier) | `w-16`, `lg:w-64` | sized by its own content |
| The editor, since E6 | `lg:w-72`, `lg:w-80` | **the artboard was off the screen** |
| The block designer | the same two | the same |
| The designer's swatches | `size-7` | collapsed to dots |

**Nothing in the toolchain can see this.** TypeScript has no opinion on a string. The
design lint rules test for *wrong* values, not absent ones. A component test asserts the
same class name the component already has. Only a rendered page shows it.

So there is now a check: **`pnpm build && pnpm --filter @souqstudio/web check:classes`**.
It reads the built CSS and reports every sized utility in the source that generates no
rule. It is not in `pnpm check`, because it needs a build to compare against. Run it before
calling UI work done. `apps/web/scripts/check-classes.mjs`.

The tokens that were missing are named now, which is what the token file already said the
answer was — *a box that needs a size needs a name*: `--sq-pane-start`, `--sq-pane-end`,
`--sq-swatch`, `--sq-tool-rail`.

**The fourth was a layout assumption.** Both canvas shells were `min-h-screen`, so the
three-pane row had no definite height to divide, `flex-1` sized to content, the
`overflow-auto` on each pane never engaged, and the *document* scrolled — a 1,188px card
ran off the bottom of the window and took the tool rail and the properties panel with it.
A canvas application's shell is exactly the window: both are `h-screen overflow-hidden`.

**Two product defects came out of the same session**, and neither is a class name. A
"Background" added from the palette appended like any other element, so it painted *last*
and covered the whole design — and it defaulted to a white that is invisible on white
paper, so the owner saw their card go blank with nothing apparently added, and clicked
again. And four surfaces had each grown their own segmented control, which is what
`references/component-inventory.md` exists to prevent; `components/ui/segmented.tsx` is
the one now, with an entry.

**The lesson is the cheapest one in this file and it was skipped for two days.** Every
entry in `E6-pending.md` and `E7-pending.md` ended with "nothing has been opened in a
browser". That sentence was the finding.

#### It happened three more times, 11–12 September

Three defects in the new creation and layout work. **All three were found by the owner
opening a screen. None was found by typecheck, lint, 509 tests, a production build or
`check:classes`**, all of which passed on every one of them.

| What | Why nothing caught it |
| --- | --- |
| The page background never saved | `prisma.pageGrid.update` simply did not mention the new nullable column. The route rebuilt the grid correctly and **echoed the background back in a `200`**, so the API looked right; only the row was wrong. A missing field in a Prisma call is not a type error. |
| The gradient picker was unusable | Every colour control emits *continuously* — the native picker while dragging, a range input per pixel, the gradient bar per `pointermove` — and each event was wired to a full PATCH. Measured: **1.5–2.6s per write and 7.5–11.3s per `router.refresh()`**. The control also carried `disabled={busy}`, so it went dead mid-gesture. Nothing in a test suite has a pointer. |
| A white colour was invisible | An unselected gradient handle's ring was `--sq-stone-0`, which is `#fff`: a white stop on the pale middle of a run was a white circle with a white ring on white. The palette swatch was nearly as bad at `rgba(50,50,50,.14)`. Contrast is arithmetic in the source and a *look* on screen. |

**`check:classes` has a blind spot, and it is the larger half of this system.** Its regex
matches numeric suffixes only — `\b(size|gap|p|w|h|…)-[0-9]+\b` — so `size-7` is caught and
`size-chip` is not. That gap hid a real one: **`size-chip` generated no CSS at all**, and
`IconChip`, the component whose entire job is to be a 28px square, had been shipping
unsized on `/catalog` and `/brand`. `height` and `width` had carried the token since it
existed; `theme.extend.size` never did. Fixed in `packages/config/tailwind.config.ts`.
Extending the checker to named tokens is still owed.

**What would actually close this: a browser driver.** The repo has no Playwright and no
`chromium-cli`, so UI work is still being verified by reading rendered HTML with `curl` —
which proves structure and cannot prove behaviour or contrast. The artboard has
`pnpm --filter @souqstudio/engine gallery` for exactly this; **chrome has no equivalent.**
Two of the three above would have been a ten-second look.

### 1.1 What changed in E4, and why

The brand kit carried a `gridId` and a `templateId`. Both are gone. **A brand kit *has*
many blocks; it does not contain a choice of one**, and which grid a book uses is a
decision about that book rather than about the shop. The `layout` facet in
`lib/brand-inheritance.ts` is now `typography`, and `isBrandSetupComplete` tests the
colours alone.

Two things stopped being fixed-size lists, for the same reason both times — a brand kit is
a **guideline that defines things, not a map of where they go**:

- **The palette is open-ended.** Named colours the shop writes itself, 3 to 8 of them, not
  three slots called primary/secondary/accent that also implied where each one belonged.
  A seeded block still names a `TokenRef` slot because it has never met this shop; the
  first three entries answer those. A fourth and fifth colour need no slot.
- **Text styles are open-ended.** Named styles — "Product name", "Headline", "Small print"
  — each carrying its own typeface, size, weight, italic and colour. 5 to 12. A fixed
  h1–h6 ladder capped a brand at eight and named them after nothing an owner recognises.

`fontHeadline` is a **separate face slot from `fontDisplay`** and that separation is
load-bearing: with three slots named after parts of a card, a hero band could be *larger*
than a product name but never a *different voice*.

Typography is a Google Fonts picker over a **curated ten**, every one covering Arabic and
Latin. Never the full library — most of it has no Arabic, and an owner who picks a
Latin-only face then toggles a book to Arabic gets tofu. Chrome loads those faces from
Google's CDN for previews; **the render path must not** — see the known gap in `CLAUDE.md`.

### 1.2 The composition model, built

Not an epic. It is the architecture E6 and E7 sit on, and most of it now exists.

**`packages/engine`** — pure functions, no Prisma, no Fabric, no React, no I/O. It decides
geometry and assignment; something else draws. In `packages/` because web and worker must
share one implementation, and drift there means the PDF does not match the screen.

| Piece | What it decides |
| --- | --- |
| `tracks` | fr track sizes to pixel offsets |
| `geometry` | cell spans to rectangles, **and the only place RTL mirrors** |
| `arrangement` | which block layout an aspect selects |
| `validate` | overlaps, bounds, inverted spans, no-flow-region |
| `flow` | master grid + offers + pins → pages |
| `render` | a block's elements to absolute rectangles |
| `price-mark` | every piece of a price mark, and the money formatting |
| `fit` | the four-rung fit ladder and what each text may suffer |
| `library` | the seeded library — **66 blocks** across `library-cards`, `library-panels`, `library-seasonal` on a shared `library-kit` |
| `direction` | which way a *string* reorders, and where its line is anchored |
| `compact` | reclaiming the height a card's content did not use |
| `override` | the bounded nudge, and the key that survives next week's products |
| `block-edit` | moving, resizing and validating an element while it is designed |
| `snap` | snapping to a neighbour's edge, and aligning a selection to itself |
| `color` | a role, a palette entry or a literal, resolved the same way twice |

**232 tests.** `pnpm --filter @souqstudio/engine harness` renders sample pages to SVG —
that is how the model is checked, and it is not a renderer anything ships. Output lands in
`packages/engine/harness/out`; open `index.html`.

**Be exact about what it draws.** The *blocks* are the seeded ones — `library.ts` is the
single source both `pnpm db:seed` and the harness read, so a block drawn here is the block
in the table. The *products* are the dozen literals in `harness/dummy.ts` **and, since
6 September, real catalog rows.** `pnpm --filter @souqstudio/db catalog:harness-export`
writes them to `harness/real-products.json`; the harness draws them if the file is there
and says at the top of the index when it is not. The engine still has no database import
and must not gain one — `packages/db` already depends on it, so a read the other way would
close a cycle and pull Prisma into the PDF worker. JSON on disk is the seam. The file is
gitignored: it is a snapshot of somebody's dev database, and a checked-in copy would go
stale and read as a fixture.

**Prices on those pages are invented, and nothing else is.** A catalog row has no price —
that is what E6 is for — so the exporter derives a stable fake from the row id. Names,
brands, specs, pack lines and, above all, the *absences* are real. The `WORST_CASE` dummies
still cover the price mark better, because they carry a three-decimal currency on purpose.

**What real rows found that the dummies could not**, all four of them in the first render:

- **A pack label printed backwards on every Arabic card.** `2 kg` rendered as `kg 2`: the
  digit is bidi-weak, `kg` is a strong LTR run and the space between them is neutral, so an
  RTL paragraph reorders them. The chrome is safe — `ProductCard` puts the pack line
  through `Figure`, and `[data-figure]` carries exactly this isolation — but **the artboard
  had no `Figure` and no equivalent**. This is the one that would have shipped: a printed
  Arabic flyer with every pack size reversed, in a language nobody reviewing the English
  edition reads. **Fixed** — see below.
- **The card is mostly empty, because the catalog is.** 58% of rows have a brand, 33% a
  spec, 4.2% a pack size, 4.2% an image, 4.2% an Arabic name. The offer card reserves a box
  per field, so a typical real card is a short name, a grey placeholder and a large void.
  The block is not wrong; it was designed against twelve products that all have every
  field. It needs an arrangement for sparse rows — answered by `compactBlock`, which the
  editor now passes `balance` to.
- **The fit ladder escalates on real names and never did on the dummies.** Four escalations
  across the longest-names page, zero across every dummy page including `WORST_CASE`. Real
  names are *shorter* at the median (17 characters against the dummies' 30) and longer at
  the tail (78), and the tail is what the ladder has to absorb.
- **Mixed scripts inside one English page compose fine.** Turkish, French and a lone
  Arabic-only name render correctly in an LTR booklet. That was an open question and the
  answer is yes.

The pages are `real-typical`, `real-longest`, `real-arabic` and `real-sparse` in
`harness/out`.

**`placeText` is in the engine now, and both renderers use it.** It returns the x, the
anchor and the direction *together*, because deciding them separately is what broke next:
the first fix set `direction` from the string while `text-anchor` still came from the page,
and in SVG — as in CSS — `start` and `end` resolve against the element's *own* direction.
A real Arabic product name in an English booklet (`خردل`) was anchored at its box's left
edge and then drawn right-to-left *from* it, straight out of the card. **Found by looking at
the rendered page, which is the only way it could have been** — every test passed, and it is
the second time in this change that rule #7 caught what the others could not.

**`textDirection` underneath it.** `src/direction.ts`,
exported, 15 tests, beside `price-mark` — which already decides that a price mark lays out
start-to-end and never mirrors, so direction resolution is the same kind of decision the
module already owns. It answers first-strong, the Unicode `plaintext` heuristic, and it is
resolved in code rather than left to `unicode-bidi: plaintext` because three of the four
renderers that need it are not a browser.

**`BlockPreview` had the same bug and it is shipping code.** `/brand` draws the seeded
blocks in the shop's own palette and was passing the page direction straight to every
`<text>`. It does not *show* today only because `PREVIEW_PRODUCT` carries a fully
translated Arabic spec — and 96% of the universal catalog does not, which is exactly the
gap real rows exposed. Fixed in the same change; the note is on `lib/preview-product.ts`.
**E9's SVG export still has to call it**, and E6's Fabric layer will when it exists —
neither does yet. The editor's artboard does call it, through the shared painter.

Worth keeping from writing it: **the first version of the rule was wrong twice, and its
tests caught both.** Matching code-point ranges let `×` (U+00D7, which sits among the
accented Latin letters) decide that `12 × 1.5 L` was a strong LTR string, and let an
Arabic-Indic digit (U+0660–U+0669, inside the Arabic block) decide `١٢ × ١٫٥ لتر` — which
gave the right answer for the wrong reason, the worst way for a rule to be wrong. Matching
`\p{L}` first removes both by construction: a digit is `Nd`, a symbol is `Sm`, and neither
is strong in the Unicode bidi algorithm either.

**Schema**, migration `20260905000000`: `blocks`, `block_versions`, `page_grids`,
`book_pins`, `plans.maxProductsPerBook`. `grids`, `templates` and `template_versions` are
dropped, along with `offer_books.templateId`/`densityProfile` and
`offer_book_pages.pageType`/`densityProfile`. Safe to drop with rows in them because
nothing referenced either — the database held zero offer books.

**`pnpm db:seed`** publishes **66 blocks** — 26 repeating offer cards, 7 headers and
covers, 9 panels, 5 footers, 8 square social posts and 11 seasonal bands — and **prunes
the ones that have been retired**, archiving any a live book still names rather than deleting it. Upserting alone
was enough only while the library could not shrink. It was four until 8 September: offer
card, hero band, footer, message. Those four keep their ids, because four live books name
`blk_offer_card` and `blk_footer` inside their `page_grids` regions and Prisma cannot
enforce a key through JSON. `page_grids` has no relation to `blocks` on purpose — a region
names its block by id *inside* the `regions` JSON, and Prisma cannot enforce a key through
JSON, so a relation would only add a join table nothing writes to.

**`components/blocks/BlockPreview.tsx`** is the first renderer: inline SVG, drawing the
seeded blocks in the shop's palette and typefaces — on `/brand/blocks` and in the import
dialog that screen opens. Since 8 September the sample offer carries a stand-in packshot
(`public/preview/`), because a library this size all drawing the grey "no photograph"
box is a shop window in which nothing can be told apart. It computes
no geometry — every rectangle and line break comes from the engine. Fabric is still the
*editor's* renderer, where dragging needs an object model.

Three rules are asserted rather than described, because they decide whether output reads
as a real offer book: the price mark's minor digits raise to the major's cap height, the
tier tab overlaps the mark at every size, and the mark lays out start-to-end and **never
mirrors** — LTR with Western numerals in an Arabic edition too.

**What the harness caught, that typecheck and lint could not:** a footer band whose type
collapsed because the scale anchored to the block's shorter edge instead of its geometric
mean; a price mark that spilled out of merged regions because it fitted on height alone;
`KWD` landing on top of the digits because letters were measured at digit width; and a
seeded offer card whose name box was sized for "Basmati rice" rather than for
`مسحوق غسيل أوتوماتيك بالليمون للغسالات`. Every one of them was found by looking at a
render.

### 1.3 Magic block, and the day the library stopped looking like one card

*9–10 September.*

**E8-07 ships: a picture of an offer card in, a block in the shop's library out.**
`/brand/blocks` and `/brand` both open the same dialog; the upload goes straight to R2
through the presign route the designer already had, `POST /api/v1/blocks/magic` queues an
`ai_jobs` row, the worker matches and writes the block, and the client polls
`GET /api/v1/ai/jobs/:jobId`. Five credits, charged on success only. The result is a
**draft**, drawn in the shop's own palette inside `MachineOutput` with the model's notes
beside it, and it opens in the designer.

**The owner says what kind of thing the picture is, and it binds the match.** Offer card,
header, panel, footer or square post — `MAGIC_CATEGORIES` — and the model is shown that
kind's designs and nothing else. A model choosing between eight headers is a better
matcher than one choosing between sixty-five mixed things, and the enum is what makes the
choice binding rather than advisory: a footer named under "header" fails the schema. The
cost is that a picture uploaded under the wrong kind comes back declined, which is the
right trade — the nearest header to a picture of a footer is still a header, and the owner
paid for it.

**It matches; it does not draw.** For a card the model picks one of the twenty-five
structures in `library-cards.ts` and describes its skin, and `arrangementsFromChoice`
calls the same function the shipped library calls. For every other kind it names a block
the library already ships and gets a copy of it — there is nothing to skin, because those
designs already name every colour by role. So it cannot emit an illegal document, the block
reflows into any merge, and every colour is a role — the card is drawn in whichever kit
loads it rather than in the colours of the flyer it was photographed from.
`magic.test.ts` enumerates the entire output space (2,400 combinations) and asserts each
one builds a block with no errors *and no warnings*.

**Two providers, one question.** `MAGIC_BLOCK_PROVIDER` picks; unset is Claude. The
prompt, the vocabulary and the schema live in `lib/magic-prompt.ts` so the two stay
comparable, and `interpretFirst()` validates every reading of a reply against the schema —
Anthropic constrains generation to it, Qwen is asked and takes its chances.
`pnpm --filter @souqstudio/worker magic:check` renders cards of known structure, feeds them
back, and reports what came out; it is the only way to compare them and **it has only ever
been run against Qwen.**

#### What the first live run found, and what it cost

Both defects were in this code rather than in the model, and neither was reachable by a
test.

**A white product name on a white card.** Asked whether the card inverts its type, the
model saw white type on a red price band and said yes — a fair reading of the picture and
the wrong answer to the question, because `onTint` inverts every bound string at once.
It is no longer asked for: the ground decides it. The 2,400-case enumeration had passed
that combination happily, because an invisible card is structurally valid.

**A reply that corrected itself, thrown away.** The model emitted a malformed `notes`
array, abandoned it, and re-emitted the object correctly — *nested inside* the broken one,
which never closed. Two attempts at recovering it were wrong before one was right: the
wreckage still parsed, because mismatched quotes had turned half a sentence into a key.
Only the schema can separate them. `vision-qwen.test.ts` holds the verbatim payload.

#### The library was one card in costumes, and the reason was a number

Measured rather than judged. `start: 0.08` and `width: 0.84` were **17% of all 654
element boxes** in the shipped library, the most common values by a factor of two, and
they always travelled together. That pair is the example box in
`docs/authoring-a-block.md` §2 — an illustration of *what a `box` field looks like*,
attached to an element called `name`. Twenty-one of twenty-five cards put the price in the
bottom band at that inset, and magic block inherited all of it: both of its first real
outputs returned `0.08 / 0.74 / 0.84 / 0.2`, byte-identical to `blk_offer_card`.

Three things changed:

- **The price mark can draw any shape in the kit.** `shape` had nine variants and a badge
  could draw four; the mark drew a rounded rectangle or nothing, so 40 of 100 arrangements
  switched its ground off and hand-placed a disc behind it — which decoupled the shape
  from its contents. `layoutPriceMark` draws it now. Grounds across the 25 cards:
  14 none, 8 box, 2 burst, 1 tag.
- **The promo tier stopped drawing twice.** A chip *and* the mark's attached tab both
  rendered it in **43 of 100 arrangements**, including `blk_offer_card`. `validateBlock`
  warns on `duplicate-tier` now and the library is down to zero.
- **The gutter is a decision again.** `Skin.inset` carries it, `gut()`/`measure()` derive
  together, and the registers diverged: eight distinct gutters from `0.02` to `0.14`,
  chosen from what each register is *for* — editorial generous, a line item tight.

**The gallery earned its keep twice.** It caught a was-price printing across a burst's
spikes, and it caught me stripping the emphasis from `feature`, the one register whose
whole point is a large price. Neither was visible to the type system or to 359 passing
tests. **193 of 218 renders are still unreviewed** — the wide and banner arrangements, the
worst-case product and the Arabic edition — and the inset change touched 97 boxes across
all four shapes.

#### Two things that were quietly wrong and now are not

**A draft did not mean anything.** `listBlocks` served the library screen *and* the book
editor with drafts included, so the designer's "hidden while you work on it" was untrue.
Harmless while nothing created drafts — duplicating and importing both write `published` —
and not harmless the moment a model could. The editor reads with `forComposing: true`.

**`MachineOutput` had never been implemented.** It was `spec` in the component inventory
and this is its first caller, which matters because a matched card is drawn in the shop's
own colours: without the mark there is nothing on screen to say a machine chose it.

### 1.4 The creation flow, the page, and the tool rail — 10–12 September

Full record and reasoning in `docs/E6-create-flow.md`. The summary, because three things
changed that anyone touching E6 will meet immediately.

**Starting a book is four steps, not one form.** What shipped before asked for a *title*
first — the least consequential and most reversible decision on the screen, about a thing
that did not exist yet — and refused to submit without one. It asked for a *format* out of
seven values, three of which are the same A4 sheet. It never asked which design to use at
all. Now: what are you making (booklet · post · status · poster), which offer card, which
products, then a preview of the real book with **Open editor** or **Discard**.

**The twenty-five seeded offer cards are reachable.** `bookletGrid` closed over
`blk_offer_card` as a module constant, so **every book this product has ever made used one
card while twenty-four sat in a library nothing could reach.** The grid builders take the
id now, and the create route gates it through `loadBlock` for tenancy and plan.

**A price list goes straight in.** The old "from a spreadsheet" path appeared only if the
organization had already committed an import through `/catalog/import` on an earlier
visit — a flow whose job is adding products to the catalog, in front of someone making a
flyer. `POST /api/v1/offer-books/match` reuses E5-06's matcher (`matchImportRows`,
`resolveRow`, its tuned thresholds) and **writes nothing**: no import row, no catalog row.
A flyer is not an inventory update. What happens to an unmatched row is still open —
listed and skipped for now, `E6-create-flow.md` §8.1.

**The page itself is designable.** `PageGrid` gained a `background` — flat colour, gradient
or uploaded image, reusing `ColorValue` so it resolves through the same `resolvePaint` and
the same painter as a shape fill. Plus a page margin and running header/footer bands, all
on one delta-patching route. `page_grids.background JSONB` — migrated and applied on dev,
and any other environment needs `pnpm db:migrate` before a book will open.

**The editor's start pane is a tool rail.** Offers · Layout · Background · Pins, matching
the designer's arrangement — `size-control-lg` buttons, collapsing between
`lg:w-tool-rail` and `lg:w-pane-start`. It was built as a tab row first and replaced the
same day on the owner's argument that **tabs do not grow**: four fit the pane, eight will
not, and export, sharing and seasonal scheduling are all still coming.

**Four things that were quietly wrong and now are not:**

- **`PATCH .../grid` reset everything it was not told about.** It rebuilt from `perRow` and
  `bodyRows` alone, so changing the cards across a page silently reset the offer card and
  gave a square post a footer band it never had. `readGridChoice` reads a stored grid back
  into the choice that made it; the route applies a delta.
- **The pin page select offered 1 to 12 whatever the book was.** On a one-page post that is
  eleven pages that do not exist — and it does not error, because `flowBook` generates pages
  far enough to reach the last pin. It silently made eleven empty ones.
- **The editor had no asset resolver**, so a block carrying artwork the owner uploaded drew
  *nothing* there while looking correct in the designer.
- **Gradient element ids carried colons** from `React.useId()`. Browsers resolve them;
  E9 renders these SVGs through Playwright rather than a browser tab, and a paint server
  that fails there is a flyer with a black rectangle on it. `safeId` strips them.

**A number worth keeping.** The editor page re-renders in **7.5–11.3s in dev** — `loadBook`,
the flow engine and every offer, on every `router.refresh()`. Debouncing means an owner
meets it far less often; it is still what every layout change costs, and E9 is about to put
an export button beside it. Worth profiling before then.

### The design system, reconciled against the brand palette

Not an epic, but it moved in September and the notes are worth carrying.

The printed brand palette was checked colour by colour against
`souqstudio-tokens.css`: **blue, navy, charcoal, sand, sky, gold and the `#F8F7F3` page
ground all match exactly.** The token file is not a paraphrase of the brand; it is the
brand. Three things came out of that pass:

- **There is no lime.** `--sq-lime` and `--sq-lime-tint` were in the tokens, the Tailwind
  config, the lint rule and four documents, and lime is not one of the seven brand
  colours. All of it is gone. The working set is blue, charcoal and sand, with sky as the
  second tint.
- **Three accessibility defects, none of which had bitten yet.** Charcoal on sky is
  4.25:1, so sky now carries no text at any size. `--sq-machine-rule` — the border that
  marks AI-generated content, which the system calls a functional requirement — was sky
  at 2.76:1 against its own fill, under the 3:1 non-text floor; it is navy at 11.60:1.
  And `--sq-ui-text-muted` is rated against the page ground, so it fails on any tint
  (4.19:1 on sand); tinted surfaces stop at `text-secondary`.
- **The brand blue is settled.** The palette gives `#143CD2`, which is what the tokens
  and the committed marks carry. Exports from the design tool keep emitting `#153CD0`.
  **Correct the export, never the token.**

Two components were built to their inventory signatures — `IconChip` and `TintedCard` —
and have no call sites yet, deliberately: existing screens were left alone. Seven remain
`spec`, of which `StatusPill` and `Toast` are blocked on decisions rather than effort.

**Illustrations moved from nothing to four.** The artwork on `assets.souqstudio.com` is
already recoloured — that CDN is `rebrand-svgs.py`'s output, not its input — and
`assets/illustration-catalog.json` already carries `souqUse` assignments on 35 of its 385
entries, so most of the selection work was done. `EmptyState` now renders the prop it had
been discarding, and `app/not-found.tsx` and `app/error.tsx` exist for the first time. See
`illustration-manifest.md` for what is `ready`, what is blocked, and the one slot that was
struck as unfillable.

---

### 1.5 The page became a thing an owner can lay out — 12–13 September

Full record in `E6-pending.md` §10. The summary, because the composition model now says
something different from what it said a week ago and anyone touching E6 will meet it.

**Composition model step 4 is built: cells merge.** Click a cell, shift-click or drag to
extend, Merge. Rectangular only, same as a spreadsheet, and a selection half-covering an
existing merge grows to take it whole rather than producing an L. The engine had handled
merges since it existed — `spanRect` draws one, `validateGrid` refuses an overlapping one —
and nothing in the product could author one.

**The model's "one merge styles nine pages" is superseded, and it was superseded by use.**
The composition model argued that one master grid instanced on every body page is what
anyone wants: *"Nobody hand-merges cells nine times."* The first thing tried in the built
editor was merging two cells on page one and expecting page two to keep its nine — reported
twice, before it was clear this was the design rather than a defect. A hero belongs to the
page an owner put it on. So merges moved onto `offer_book_pages`, and the flow applies them
per page while **one product cursor runs through the whole book**: a page holding a hero
holds one card fewer and the products carry on. That continuity was the owner's own
condition, and it is what keeps a merge a layout decision rather than a pagination one.

**Three things a page may now disagree with the book about**, and nothing else: its merged
cells, its paper, and what any single cell draws. Cards across and down, the margin, the
running bands and the default paper stay the book's and still change every page at once.

**Putting a brand block in a cell moves the product that was there.** A cell holding a
block that does not repeat becomes `static`, and `flowBook` routes products around static
regions exactly as it has routed them around pins since pins were built — *"the offers that
would have sat there move downstream; the book grows by a page rather than losing a
product."* No new machinery, and no product is ever dropped.

**The tool rail is grouped by scope.** It was Offers, Layout, Background, Pins — one content
tab presented as the equal of three design tabs, which the design skill contradicts
outright: *"The start pane is an offer tray, not a placement palette."* The parity argument
that justified the rail does not survive inspection either, because the card designer's
rail is homogeneous — every entry inserts an element — while this one was four unrelated
kinds of thing in the same clothes. There is a **Page** tab now, holding everything scoped
to one page, with the active page named once and set by clicking any cell on the artboard.
Two page-scoped controls had grown two different ways of asking which page; there is one.

**What the tests could not find.** Merging shipped green — twenty tests on the span algebra,
six on the round trip, the whole chain simulated end to end — and was broken the first time
anyone pressed the button, because a pinned row still offered its cells and the merge
landed where that page could not show it. Two more followed: a nine-second unlit wait after
every press, and a button that read as a heading. Every one of them was in what the
interface put in front of the owner; the engine was correct throughout. **No amount of
further unit testing would have found any of the three.** Driving a real browser against a
real book found all three in an afternoon, and that is now the check this epic is held to.

### 1.6 Removing a card is undoable, and the artboard got its accelerators — 13 September

Full record in `E6-pending.md`, last section. Three things worth carrying here.

**`Toast` is built, and it had been `spec` since E2.** The signature was in the component
inventory and there was no provider, portal or store to show one through, so three screens
shipped inline `role="alert"` banners and `E2-pending.md` §3 recorded the compromise along
with its cost: *"the design system prefers undo over confirm, and undo lives in the toast
that does not exist."* `toast()` plus one `<Toaster />` in the dashboard layout is the
mechanism; the props are the inventory's, unchanged. **This unblocks every reversible
action in the product that currently asks for confirmation**, starting with pausing a shop.

**Removing an offer is reversible now, and the undo stack learned a second kind of step.**
`EditorStep` was one shape — a field, its old value, its new value, replayed through
`PATCH`. That cannot express a removal: there is no row left to patch. So `DELETE` hands
back a full snapshot, the step carries it, and `POST .../offers/:offerId/restore` puts the
offer back **under its own id** — which matters because a slot override lives on the page
and carries an `offerId`, so restoring under a fresh one would leave the nudge stranded and
the card back in the wrong place. The row is still hard-deleted; what changed is that its
contents are handed over on the way out instead of dropped.

**The artboard's selection is no longer a dead end.** Clicking a cell has selected its offer
since E6-02 and every action then lived across the screen in the tray, matched to the card
by its ordinal number. `OfferProperties` now ends in Earlier, Later and Remove from book,
sharing one implementation with the tray so the two cannot become two behaviours.

**The accelerators followed, in the order that made each one safe.** Reordering went onto
the undo stack — it never was, in either place, so Cmd+Z reached past a move to the price
before it, and the tray's arrows, the tray's drag and the panel's arrows now share one
implementation instead of three. `Delete` and `Backspace` remove the selected card, which
was only ever blocked on removal being reversible. And the artboard has a context menu.

**That last one put the first `@radix-ui/*` package in the tree, which was the decision
rather than the component.** `Dialog` is the native `<dialog>` and `Select` a native
`<select>`, both having refused their Radix versions with the reasoning at the call site —
but there is no platform primitive for a context menu, so that reasoning does not transfer.
Every item in the menu is also a button in a panel, because the design skill requires a
persistent equivalent for anything the editor offers on tablet; a menu is where an owner
who knows the product goes faster, never where a feature lives. **Do not paste shadcn's
block for this** — it ships `shadow-md`, `rounded-sm`, `text-sm` and `animate-in`, none of
which resolve against replaced scales and none of which error either.

**Checked by: typecheck, lint, stylelint, build, `check:classes`, 533 tests. Not opened in
a browser** — and §1.0 is the standing evidence that this is the check that finds what the
others cannot. Three specific risks nothing here can see: whether the menu flips to the
correct side in an Arabic interface, whether the toast anchors bottom-right there, and
whether long-press opens the menu on an iPad without the selection callout fighting it.

### 1.7 E8-01 was rebuilt the day it shipped, and it took four screens with it

**Character creation ran live against Gemini.** Four generations completed, four variations
each, ten credits charged each; two characters kept. The two most recent ran `photo-real`
against a three-segment shop. This is the first AI feature in the product to produce images
from a real provider, and the first time any of `IMAGE_PROVIDER` has been exercised.

**It was a dialog and the owner rejected it, for a reason that generalises.** A modal
implies one decision; this is five, two of which are prerequisites fixed on *other* screens.
A dialog that says "your shop profile is incomplete" and must be dismissed to go and fix it
is a dead end with a close button on it. It is now a gated flow at `/brand/character`.

**The shop profile is new data and a new gate.** `shops.trades`, `shops.bio` and
`shops.storePhotoKeys` (migrations `20260916120000`, `20260916130000`), edited in a new
section of shop settings. Until this the product knew a shop's name and its logo and nothing
else — a butcher's character is not an electronics shop's, and without it the only thing
that could be generated was four generic people somebody had paid for. `trades` is a list
capped at three: a grocery with a bakery counter is the common case here, and eight segments
describe no shop a model can draw.

**`photo-real` is a fifth style, and the likeness question is answered structurally.** The
generated person is invented and *cannot* resemble anyone in the uploaded photographs —
not because a prompt asks for that, but because those photographs are never in the drawing
request. A vision model reduces them to a sentence about clothing and that sentence is what
is drawn from. **Anyone changing `character.job.ts` should understand this is the property
being preserved**; forwarding the photograph to the image model would end it with no test
failing.

**Work that finished while nobody was looking used to be lost.** Every generation flow held
its `jobId` in React state and nothing else could reach a finished job, so closing the tab
spent the credits, left the images in R2 and left no route back. `ai_jobs.claimedAt`
(migration `20260916140000`), `GET /api/v1/ai/jobs` and a bell in the rail are the fix; the
dev database had six unclaimed jobs when it landed. **It is not a notification hub** — E12
is unstarted and this is one query over one table.

**Four screens' worth of chrome changed with it:**

- `/brand` is four tabs — logo, colours, type, character — rather than five cards.
- **The block library moved to `/blocks` and into the main rail.** A brand kit is an
  identity you set and leave; a library of sixty-five designs is a workspace.
- **Every dashboard screen got wider.** `max-w-3xl` was hand-written in thirteen files,
  which put the whole product at 768px on a 1900px display. `PageContainer` owns it now.
- Six components: `Textarea`, `RadioCards`, `CheckCards`, `PageContainer`, `ImageViewer`,
  and `Tabs` finally built. All but `ImageViewer` are in the inventory.

**Two bugs worth not repeating**, both found by looking at the screen rather than by a test:

- **`[hidden]` does not hide anything a `display` class is styling.** That rule is in the
  *user agent* stylesheet and any author rule beats it, so `/brand` rendered all four tab
  panels at once with one tab underlined.
- **`check:classes` missed a class that generates no CSS.** `w-pane` is not a token — the
  width scale is replaced, not extended — and the notification panel shipped with no width,
  clipped inside the rail's `overflow-y-auto`. The check is not the whole story.

---

### 1.8 The offer cards were redrawn from real cards — 19 September

The previous set was designed from a *description* of what a leaflet does. This one was
designed from seven photographed cards: a Gulf quick-commerce tile, two German discounter
leaflets, an electronics deal card, a Bahraini grocery tile, and two more from the same
two families. Every one of the twenty-five structures in `library-cards.ts` was rebuilt.

**What the references disagreed with, and what changed because of it.**

- **Sixteen of twenty-five cards ended the same way** — the price in a full-measure box at
  the foot — so the structures differed in the middle of the card and agreed on the
  ending, which is most of why they read as one card in costumes. §1.3 found the same
  class of problem in the *skins* and fixed that half. The price is now a property of the
  register: end-aligned on a half measure for the discounter card, a saturated block at the
  leading edge for the flyer, a pill with the compare price beside it for the delivery-app
  tile, a burst over the packshot for the lead deal. `endPrice` and `startPrice` are the
  two helpers, and they work through `recipe.align`, which has existed since the mark's
  interior opened and had no caller.
- **The brand was on three cards and is on nearly all of them.** Six of the seven
  references set it above the product name in small caps. `brand` has been bindable since
  E6; nothing was using it. It is one factory now — `brandLine` — rather than four lines
  repeated at each call site, which is the difference between a treatment the library has
  and one it remembers to apply.
- **The detail line was one 6%-tall caption and is now two or three clamped lines.** A
  discounter card gives variant, weight and pack count more room than anything but the
  photograph. Clamping rather than shrinking is what stops a long spec stealing the name's
  size.
- **A card carries a chip or the mark's attached tab, never both.** The quietest reference
  has no badge at all — the tier is a coloured flag welded to the price, which is what the
  default card does now. `duplicate-tier` is a warning and `library-source.ts` refuses a
  shipped block that draws any warning, so this is enforced rather than remembered.

**Three registers arrived and two retired.** In: `blk_top_ribbon` (a coloured bar across
the head naming the promotion, a solid price block at the foot), `blk_deal_frame` (bars at
head and foot, the price inside the foot bar), `blk_price_pill` (the quick-commerce tile —
tinted plate, filled pill, compare price beside it). Out: `blk_price_first`, which put the
price above the packshot for a reading-order gain no reference makes and no owner asked
for, and `blk_split_tint`, which was `blk_split_vertical` with one half coloured — exactly
the skin-only difference §1.3 cut sixteen cards for. **`pnpm db:seed` must be re-run**:
`pruneSeededBlocks` deletes a retired seeded block, or **archives** it if a page grid or a
pin still names it.

**What the gallery found that the 509 tests could not.** All four are the kind of defect
`validateBlock` has no opinion about, and all four are why the gallery exists:

- **The harness painter drew every chip as a rounded pill in white**, reading neither
  `shape` nor `ink` — so `topRibbon` and `dealFrame`, which ask for no badge because the
  bar behind the words *is* the badge, were reported with a pill inside the bar. The web
  painter has honoured both since E7. A renderer that ignores a field does not merely miss
  a feature; it reports a card the document does not describe, which is worse in the one
  renderer whose whole job is to be looked at. `harness/svg.ts` now goes through the same
  `CHIP_FIT`, `chipPathShape` and `drawsGround` that `draw.tsx` does.
- **`markOn` outlined a filled block in the tier's colour.** `tint` defaults to the promo
  tier's token, which is right for an outlined tag on a white card and wrong for every
  shape that factory draws — a price block in the brand blue came out ringed in gold.
- **The corner flag swung clear of the card's top edge** and sat on the page above it. The
  *box* was inside the block, which is all `validateBlock` measures; rotation is about an
  element's own centre, so a band whose box starts at the top sweeps past the trim once
  turned. Lowered, widened and rotated less, it overhangs the leading edge by a few pixels
  and reads as a sticker, which was the intent.
- **`nameBand` set its brand line in muted grey on a saturated band.** `brandLine` takes a
  colour now. Same failure as the tier pill in §1.3 — a colour that resolves against the
  card's ground when the element is not sitting on it.

**What the references ask for that this still cannot draw**, and it is data rather than
design: the unit-price line ("1 kg = 11.98"), the validity window on the card, the deposit
footnote and the star rating. `packLabel` and `unitPriceLabel` are already in
`@souqstudio/types` and `TextSource` already carries `packSize` and `origin` — what is
missing is `contentFor` in the two painters, which returns an empty string for both, and
`library.test.ts` holds the seed to the three fields both painters resolve. Wiring
`packSize` is the smallest change with the largest effect on how close these read to the
references; §3 has it. **Done — E14 Phase 1 wired both, and §1.9 is the record.**

---

### 1.9 E14 began, and the data map turned out to be full of holes — 20 September

`docs/E14-progress.md` is the record. What belongs here is what it changed about
the product rather than about the plan.

**Every binding in the vocabulary now draws, and there are twenty of them.**
`shop.address` and `shop.phone` were the two the plan named. The test that walks
the vocabulary found four more nobody had noticed — `product.origin`,
`product.packSize`, `offer.prefix` and `offer.unitPrice` — all declared, all
resolving to `''` in both painters. Seven are new: `offer.price`, both save
fields, `brand.name` and the three `book.*`. **One seeded block was working
around the hole with a static "Your phone number"**, and a test had the bug
written down as a rule.

**There is one resolver now.** `draw.tsx` and `harness/svg.ts` each carried their
own `switch` over `TextSource`, and they "agreed with each other and with nothing
else" — which is why testing one was never going to be enough. Both delegate to
`resolveTextBinding` in the engine and keep only their own adapter. Two tests
walk the vocabulary, one per painter.

**`logo` stopped being an element kind.** It is an `image` bound to
`brand.logo`, so every image property applies to it. The seeded library, all 38
stored blocks that carried one, *and* the palette that makes new ones. That last
one was missed on the first pass and every logo an owner added went on being the
dead kind.

**Shadows, outlines and outline-only shapes are real**, model and both painters,
with controls in the designer. A square with just a thin border could not be
drawn at any setting before; neither could a shadow.

**A block can be started from scratch**, which `composition-model.md` §3.6
deliberately forbade. The rule is right about *blank* and was wrong about *new* —
so a starter is the smallest block of its kind that already reads as one, held to
the shipped-block bar by `starter.test.ts`, and there is still no branch that
creates an empty one.

**Two columns landed and are applied on dev**: `offer_books.validFrom`/`validTo`
— the offer period a header prints, deliberately not `expiresAt`, which is when
the share *link* dies — and `blocks.identityPin`, §3.2's mode.

**What the tests could not find, looking did.** Nine defects came out of
rendering the real painter to an SVG and looking at the picture, with the suite
green throughout: the binding picker offering eleven of twenty, `shop.*` painting
white on white, the canvas having nothing to lay out, a shadow showing through an
unfilled shape. Every one was about what a sample contained or what a control was
wired to rather than about painter logic. **`static` text is still white on
white on a light card** — the same heuristic, 81 seeded call sites, not yet
unpicked.

---

## 2. Blocking, and what it blocks

These are cross-cutting. Each one stops or degrades work in epics that have not started
yet, so it is cheaper to clear the relevant one first than to work around it.

### The catalog is filled — this no longer blocks everything downstream

`offer_books` holds real books now — created, priced and edited through the product rather
than by a script — and `catalog_products` holds **2,140** — 2,041
real products sampled from the Open Food Facts run plus the 99 demo rows — against 970
brands. **The full 61,230-product catalog lives in `packages/db/data/catalog-off.csv`**,
deliberately not in the database: ninety thousand rows cost real money to host in dev and
prove nothing that two thousand do not. The file is what a production environment loads.

**The first run was wrong in a way no test caught**, and both defects are worth knowing
before trusting any earlier figure in this file. `isRelevant` substring-matched the joined
country list, so `"romania".includes("oman")` admitted every Romanian product — ~29,000
rows, a third of the catalog. And a product name was accepted with no letter in it, giving
636 products called things like `0012000057502`. Both are fixed with regression tests, and
the numbers above are from the corrected run. `E5-pending.md` §1 has the detail.

Historic note, kept because it shaped everything above: `pnpm --filter @souqstudio/db catalog:seed-demo` writes them and
`--clear` takes them out again; they exist so the screens and the engine can be *looked
at*, not as a catalog. The layout engine, the block library, the price mark, the fit
ladder and the first renderer are all built and were tested only against products
constructed inside a test. **Both halves of that have since been answered**: the harness
composes real catalog rows, and the editor composes real books. Neither the catalog nor the
editor is on the critical path any more — E9 export is.

**The reader over it now exists, and so does the first way in.** `/catalog` searches and
browses both collections, looks a barcode up, and lets an owner add a product the catalog
does not have — into their own collection, usable immediately, with the review queue as a
separate question. Every query was run against the dev database and executes cleanly; they
all returned zero rows, which is the point.

**The bulk path is built too.** `/catalog/import` takes a CSV, guesses what each column
means, resolves every row against both collections in two queries rather than two per row,
and puts the ones it could not place with confidence in front of the owner. It commits into
the catalog. **Carrying the sheet's prices into an offer book is done** — `/editor/new`
reads a committed import and creates a book already priced, which is the half E5-06 left
open because there were no offer books to carry them into.

**The Open Food Facts seed has been run** — 4,535,569 rows read, 61,230 mapped to
`data/catalog-off.csv`, 2,041 sampled into dev. Kept here because it nearly could not have
been: until 6 September `writeBatch` upserted on a compound unique key containing a null
`organizationId`, which the client rejects at runtime, so any real run would have died on
its first batch. Loading the full 61,230 into a production database is still a decision
rather than a step, and **no reader for that CSV exists yet** — the exporter was written,
the importer for our own format was not.

**The category mapping is done, and it lands 23.4% — not the 93.8% recorded here until
6 September.** `toCatalogCategory` resolves the OFF taxonomy onto the ten names
`pnpm db:seed` publishes, and it was built against a tally of 2.39M real rows rather than a
guess, which is what caught the largest category in the export — `Plant-based foods and
beverages`, 261,377 rows — being filed as a *drink*. But 93.8% was measured over the **top
120 category strings**, which is the well-formed head of a 14,618-value taxonomy and the
head the rules were written against. Counting the 61,230 rows the GCC filter actually kept
gives 14,315 with a category: **23.4%**. Worse, four tiles carry 99.3% of them and **two of
the ten get nothing at all** — Cleaning and Electronics are empty over the whole universal
catalog.

**Third time this epic that a proxy measured against its own head gave an answer four times
too good** — after the `594` barcode prefix (off by 3.7x) and `[[:alpha:]]` on Arabic names.
Counting the real file takes under a second; the expense was assumed, never measured.
Nothing is broken and no code changed — an unmatched row returns null rather than a wrong
category, and stays searchable by name, brand and tag. What changes is that category
browsing cannot be the way into the universal catalog at this coverage. `E5-pending.md` §1
has the per-tile numbers and the fix: read the deeper `categories_en` levels, not just
`firstValue`'s broadest one.

What is still missing: XLSX (a dependency decision, not effort), E5-07 phone capture, and
the camera half of E5-03. The import's match thresholds are unverified against real data.
**Search ranking now has rows to be judged against, and the fuzzy branch already fails
one**: a misspelling inside a longer product name scores under the trigram threshold and
returns nothing at all. Both are written up in `E5-pending.md` §3.

### `R2_ENDPOINT` carried the bucket on Railway — fixed on dev, 15 September

**Found and fixed locally on 6 September**, while attaching a placeholder image to the demo
catalog. `apps/web/.env.local` had
`R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com/souqstudio-dev` — the bucket as a
path segment — while the code also passes `Bucket: env.R2_BUCKET_NAME`. The SDK treats the
endpoint path as a prefix, so every write went to `souqstudio-dev/souqstudio-dev/…` and the
public URL the app builds (`R2_PUBLIC_URL` + the key it *thinks* it wrote) could never
resolve. `.env.example` documents the correct shape, without the bucket; the local file had
drifted.

Nothing about this is visible from the app: the upload succeeds, the PUT returns 200, and
only the rendered image is missing. It is why "nothing about the write path has been run
against a real upload" stayed true for so long without anyone hitting an error.

**Six objects are still stranded under the doubled prefix** — the logo uploads from two
organizations in August, `logo.png`, `logo-original.png` and `logo-upload` for each. They
were left in place rather than moved: no `brandKit` in the database references them, so
they are orphans either way, and deleting another account's data on a hunch is not this
change's business. Worth a decision.

`.env.local` is gitignored, so this fix is local only. **Check the Railway environment
before deploying** — if it carries the same shape, every logo and product image uploaded in
production is written where nothing can read it.

**It did carry the same shape, and it still does.** Confirmed 8 September from a presigned
URL the dev deployment handed out: `souqstudio-dev.<account>.r2.cloudflarestorage.com/`
`souqstudio-dev/<key>` — the bucket in the host *and* in the path. So the note above was
written, the local file was fixed, and the deployment was never checked. A note in a status
file is not a control.

`R2_ENDPOINT` is now validated at startup against `R2_BUCKET_NAME` — `lib/env.ts`,
`withEndpointCheck` — and refuses both shapes it can hide in: the bucket as a path segment
and the bucket as a host prefix. The app will not boot on the bad value rather than
uploading into the void. That was the intended trade, and it was the thing that finally
forced the variable to be corrected.

**Corrected on the dev environment on 15 September and uploads are reported working.**
Which also means the CORS policy below is applied there, because no browser upload survives
its absence. **Production is untouched on both counts** — a new environment needs the
variable set and the policy applied before it has a user, and neither is carried by a
deploy.

The startup check is what makes the endpoint half of this self-enforcing from here: a wrong
value stops the server instead of writing into the void. **Nothing enforces the CORS half**,
which is why the script exists and why it reads its own policy back.

### Every presigned upload URL carried a checksum for an empty body — fixed in code

**Found 8 September, in the same URL.** Since `@aws-sdk/client-s3` v3.729 the SDK adds a
CRC32 checksum to `PutObject` by default. On a normal request it computes that from the
body; on a *presigned* one there is no body yet, so it computes the checksum of nothing —
`AAAAAA==`, CRC32 of an empty payload — and bakes it into the query as
`x-amz-checksum-crc32`. The browser then PUTs real bytes against a URL asserting they hash
to empty, and R2 rejects it.

Fixed with `requestChecksumCalculation: 'WHEN_REQUIRED'` on the S3 client in `lib/r2.ts`.
Verified by signing the same command with and without it. The worker's client is untouched:
it never presigns, and a checksum computed from a body it actually has is correct.

**This is two independent faults on one path**, and they mask each other: the endpoint bug
stores the object where nothing can read it *silently*, the checksum bug fails the PUT
*loudly*, so fixing either alone still leaves a logo upload that does not work. Both are
also older than any test in this repo — nothing about the write path had ever been run
against a real upload, which §2 has said all along.

**One more thing came out of reading the signature:** `X-Amz-SignedHeaders` is
`content-length;host`. `ContentType` is passed to the command and **is not signed**, so a
client may PUT any type it likes — the comment in `lib/r2.ts` claiming both were pinned was
wrong and is corrected. It is survivable on the logo path only because the completion route
reads the object back and re-parses it with sharp. Any future presigned path that stores
what it is given does not inherit that.

### The R2 bucket had no CORS policy — applied for the dev origin only

**Found 8 September, after the two faults above were fixed and the upload still did not
work.** A preflight against the bucket answers:

```
403 Forbidden
<Error><Code>Unauthorized</Code><Message>CORS not configured for this bucket</Message></Error>
```

Every presigned upload in the product is a cross-origin PUT from a browser — the logo, a
product photo, artwork dropped on the designer canvas, all three doing the same
`fetch(uploadUrl, { method: 'PUT', body: file })` — so every one of them sends an `OPTIONS`
first and every one of them is refused. **A perfectly correct presigned URL cannot be used
by a browser against a bucket with no policy**, which is why the two fixes above changed
the URL and changed nothing else.

CORS appears nowhere in `docs/`, nowhere in `souqstudio-technical`, and nowhere in the code
— it was never configured, in any environment. That is the other half of "nothing about the
write path had ever been run against a real upload": the local path was equally broken and
equally unexercised.

`apps/web/scripts/r2-cors.mjs` applies it, reads it back rather than trusting the write, and
takes its origins from `APP_ORIGINS` so a new environment needs no code change. A script
rather than a dashboard click for the same reason the other two faults are now startup
errors — **a manual step nobody records is a manual step that is wrong in the next
environment.** Run it against the production bucket before production has a user.

**Three independent faults on one path in one afternoon**, and the order they were found in
is the lesson: the endpoint bug was silent, the checksum bug was loud, and the CORS gap was
invisible from everything except an actual browser request. Each one alone was enough to
break the feature; fixing two of them looked exactly like fixing none. **All three are
closed on dev as of 15 September** — the checksum in code, the endpoint in the Railway
variable, and CORS on the bucket. The feature working is the only evidence that could have
told you so, which is the other half of the lesson.

**Verified end to end on 16 September, and it found what was still missing.** The preflight
from `https://dev.souqstudio.com` answers `204` with `PUT, GET, HEAD`, and all three objects
of a real logo upload are publicly readable — the SVG at the staging key, and `logo.png` and
`logo-original.png` beside it, which means the completion route read the object back,
rasterised it through sharp and promoted it. That is the whole write path working for the
first time.

**`http://localhost:3000` is still refused**, with the same
`403 Unauthorized: CORS not configured for this bucket`. The policy was applied with one
origin, so **every upload fails on a developer's machine while working on dev** — the logo,
a product photo, and artwork dropped on the designer canvas. It is the most confusing shape
this class of bug can take: the feature demonstrably works, and does not work where it is
being written. `pnpm --filter @souqstudio/web r2:cors` sets both origins from `APP_ORIGINS`
and reads the result back; the dashboard is what applied one of them.

### A preview route with no auth check was committed — resolved, gone from the tree

Commit `b293829` captured a temporary harness: `apps/web/app/preview-brand/page.tsx` and a
`/preview-brand` entry in `PUBLIC_PATHS`. That route mounts the brand kit screen with **no
session check**. It was a scratch page for looking at the four cards without writing to the
live database, and it should never have been committed. **Resolved** — the route and its
`PUBLIC_PATHS` entry are gone from the tree; `apps/web/app/` has no `preview-brand`. The
warning stands for anything deployed from `b293829` itself.

### Promo-tier seeding is fixed — was breaking every new account

**Resolved 5 September.** `offers.promoTierId` is NOT NULL and the E5 migration seeded
tiers only for the organizations that existed then, so every account created afterwards
would have failed on its first offer with nothing the owner could do. `seedPromoTiers` now
runs inside the signup transaction, and `pnpm db:seed` backfills — it caught one live
organization. The data lives in `packages/db/src/promo-tiers.ts`, not in `apps/web/lib`,
because `tokenRef` is a `--sq-tpl-*` name and that is offer book content, not chrome.

### `pnpm typecheck` was lying — fixed, and worth knowing why

**Resolved 5 September.** `turbo.json` had `"typecheck": {}` with no `dependsOn`, so the
task was not topological: editing `packages/types` left every dependent's typecheck as a
**cache hit**. `pnpm typecheck` reported all green while the apps replayed stale logs, and
the error surfaced in the worker's build on Railway instead. That is exactly how a
`BrandKit` change shipped a broken worker. Now `dependsOn: ["^typecheck"]`.

Note that `pnpm check` is `typecheck + lint + stylelint` and still does not include
`build`. Railway runs `build`.

### Row-level security has no policy — blocks nothing, endangers everything

The baseline migration exists and `withOrg()` ships, but **not one policy has been
written.** Tenancy today rests on `apps/web/lib/authz.ts`, which is application filtering,
not a control. Every epic from here adds tenant tables and makes the gap wider.

Pick up at `E2-pending.md` §1, which has the three steps in order. The hazard to know:
`current_setting(…, true)` returns NULL when unset, so a missed call site returns *zero
rows* rather than an error — it fails closed, and a mistake looks like an empty screen in
production rather than a stack trace.

### Brands are an entity, and the admin half of it does not exist

**Built 6 September.** `product_brands` (migration `20260906113346_e5_product_brands`,
additive) with a normalised `slug` as the dedup key, 92 curated UAE brands seeded canonical
and bilingual, resolution wired into both the Open Food Facts importer and the
add-a-product route. `catalog_products.brandId` is nullable and `brandEn`/`brandAr` stay as
the fallback, so an unknown brand never blocks an owner. Detail in `E5-pending.md` §1.

**No logos, by licence.** E5's rule — images from licensed sources or direct brand
permission only — covers logos, which are also trademarks. `logoKey` and `logoSource` are
on the row and stay null until permissioned assets exist; cards fall back to the brand
name, which is what they render today.

**The curation side is unbuilt and this is where it bites.** `apps/admin` has seven route
directories and **zero `.tsx` files** — no screen to merge two spellings, write an Arabic
name, attach a logo, or promote a brand to canonical. Everything the importer creates
arrives `unreviewed`, and the Open Food Facts run will create thousands of them. They are
usable immediately, so nothing breaks; they simply accumulate uncurated until E13 / E5-08
builds the admin auth path against `admin_users` and the screens on top of it.

### The tsvector migration is applied — full-text search is unblocked

`catalog_products.search_vector`, its GIN index, the update trigger and `pg_trgm` are raw
SQL in `20260904000000_e5_offer_model_and_catalog_search`. It landed there rather than in
its own migration because the bilingual columns changed what the vector is built from, and
writing it twice would have meant writing it wrong once. The vector now spans `nameEn` and
`nameAr` at weight A, brand and category at B, spec and tags at C — `simple` dictionary,
never `english`, because the catalog is multilingual.

**Applied to the dev database on 4 September 2026.** `prisma migrate status` reports four
migrations and no pending work. Verified end to end against the live database: the trigger
populates the vector on insert, an English query and an Arabic query return the same row,
a tag hit ranks below a name hit, `pg_trgm` matches "Basmatti" to "Basmati" at 0.8, the
partial unique index rejects a duplicate universal barcode, and the organization's own row
outranks the universal one at equal rank — which is the two-collection precedence.

Two things that came out of applying it:

- **The tsvector column is now declared in the model too**, as
  `searchVector Unsupported("tsvector")?` with its three GIN indexes. Raw SQL alone was not
  enough: a model that does not mention the column makes `db push` and `migrate dev`
  generate a `DROP` for it, and losing the search index reads as slow search rather than as
  a missing index. Both places, not either.
- **The only schema drift left is the E2 leftover** — `user_shop_access.updatedAt` still
  carries a `DEFAULT` the model does not declare. The E3 migration header documented it and
  it is still there. It is harmless and it will keep appearing in every diff until someone
  clears it.

`prisma/migrations/migration_lock.toml` was missing and is now written. Without it
`prisma migrate diff --from-migrations` refuses to run at all, which is the tool anyone
would reach for to check a migration against the history.

### Two worker handlers throw — blocks E9, and most of E8

`apps/worker/src/workers/` has five workers. `email` and `bg` are implemented — `bg` now
for logos *and* catalog cutouts. **`ai` is implemented for one job**, E8-07's
`ai.magicBlock`; its other four names still throw, as do **`pdf` and `enrich`**.

- `pdf` blocks E9 export, and with it the editor's export button. **It is the only thing on
  the critical path now**: a book can be created, priced, adjusted, laid out, pinned,
  duplicated and designed for, and it cannot leave the product. Everything built since
  5 September has widened the gap between what an owner can make and what they can send.
- `ai` no longer blocks E8 entirely. `ai.magicBlock` is implemented and **credits are
  now actually spent** — `consumeCredits()` in `packages/db/src/credits.ts` has a caller
  at last, and two real charges against the dev organization to show for it. The four
  image jobs — character, pose, cover, prompt — still throw, and they are the ones that
  need a diffusion model rather than a vision one, which is a different provider decision
  that has not been made.
- `enrich` blocks E5's multilingual synonym pipeline **and, now specifically, every
  Arabic name in the universal catalog.** The Open Food Facts CSV export has no language
  variants in any of its 211 columns, so every seeded universal product has a null
  `nameAr`, and E5 §2 makes that a publish-time blocker for Arabic editions. Until this
  worker lands the shared catalog is English-only and cannot back an Arabic offer book.
  A shop's own products are unaffected: E5-04 and E5-06 both take `nameAr` from the owner.

**`bg` is now implemented for both.** The catalog branch of E5 §3 is written: a job
carrying `catalogProductId` and `sourceAssetId` produces a cutout, measures it, and writes
an `image_assets` CUTOUT row with `bboxTight` and a `quality` score, `APPROVED` above the
threshold and `PENDING` below it. `quality` is *derived* from the alpha channel — Rembg
reports no confidence — and `apps/worker/src/lib/matte.ts` carries the reasoning and 11
tests. Unverified against a real image: the analysis is tested on hand-built alpha
canvases, and no photo has been through Rembg.

Guidance is in `souqstudio-technical → references/background-jobs.md` and
`apps/worker/CLAUDE.md`. The rule that matters: **credits are deducted on completion,
never at queue time.**

### Billing has never touched a real Stripe account — blocks launch, not an epic

E3 is complete and untested against Stripe, because this environment has no key. Nothing
should be deployed assuming it works. `E3-pending.md` §1 lists the order to exercise it in.

### One organization has several brands — decide before E6

`organizations.brandKit` assumes one brand per organization. A GCC retail group holds
several trade licences, each with its own brand, so the level is wrong: a brand belongs to
a licence, not to the billing entity. Today three brands across fifteen branches means
`full` override on fourteen shops and no way to restyle one brand's branches together.

The fix is a `Brand` row between the two, and it is cheapest now — no RLS policy is
written yet, the editor does not exist, and every epic from here adds another reader of
the kit. `lib/brand-inheritance.ts` survives the change; only the level names move.
Full write-up and migration shape in `docs/E4-pending.md` §1.

### Token encryption key management is undecided — blocks E10

Where the key lives, how it rotates, what happens to stored tokens when it does. Also
decides whether `users.twoFactorSecret` gets encrypted; it ships plaintext behind a
version seam in `apps/web/lib/two-factor-secret.ts`, so that switch is one file plus a
backfill.

### Rate limiting is unspecified — blocks nothing, will hurt

No route has any, including the public tracking endpoints E11 will add, which are
unauthenticated and trivially floodable. `POST /api/v1/auth/2fa/enroll` runs bcrypt
unthrottled behind a valid session.

---

## 3. What to pick up next

The MVP epics, in the order that unblocks the most. Each entry says what has to be true
before it starts.

### E5 — Product catalog (MVP) — search and browsing are built

**E5-07 phone capture is the thing to build next here, and it is newly unblocked.** A price
list now creates an offer for every row, matched or not, so a book can be full of the shop's
own products drawing the placeholder packshot — and nothing in the product lets an owner put
a photograph on one. `CaptureSession` is already in the schema, token-hashed and shop-scoped;
what is missing is `app/capture/[code]`, the QR, and a per-offer upload in the editor. The
smaller half is the editor upload, which needs only the R2 path that started working on
15 September. `E6-create-flow.md` §19.4.

**E5-01, E5-02, E5-03, E5-04 and E5-06 ship.** `/catalog` is a search box over both
collections with the category tiles as its empty state, a barcode goes to its own lookup
rather than to full-text search, a search or scan that finds nothing offers to add the
product, and `/catalog/import` takes a CSV through mapping, matching and review.
`CATALOG_BUILT` is flipped and the rail carries the item again.

**The seed has been run.** 4,535,569 rows read, 61,230 products mapped, 2,041 sampled into
dev. What follows was written before that run and is kept for the reasoning: The write path
that would have killed any real run is fixed and proven on a fixture, the categories resolve
onto the ten at 93.8%, brands resolve into `product_brands` three queries per batch, and the
stream turns out to be far quicker than recorded — 2.39M rows in eight minutes, so the full
export is tens of minutes rather than hours. What remains is only the decision to write tens
of thousands of rows to the shared database. After that, E5-07 phone capture and the camera half of E5-03;
XLSX is a dependency decision waiting on a human.

Read `E5-pending.md` first: it carries the corrections building this produced, including
that `barcode` is not in `search_vector`, that `?lang=` does not exist, why the cutout job
must never be given the photo's own key, and where the import deliberately stops.

**The shape is settled and the schema is written.** `docs/E5-product-catalog.md` is v2:
one table with a nullable `organizationId` (null = universal, set = the organization's own
collection), bilingual name/brand/spec/origin columns, `image_assets` with a CUTOUT
variant, pack maths for the derived unit price, spreadsheet import with a review screen,
and a QR phone-capture handoff. All of it is in the schema and in the E5 migration.

**Needs first:** nothing structural. The work is routes and screens.

**This is the only thing on the critical path**, and it is now specifically the *ingest*
half of it. Everything downstream — the engine, the blocks, the price mark, the fit ladder,
the renderer, and now the catalog browser too — is built and idle because there are no
products to place. E6 is not thin without E5; it is impossible. **Both are built now**, and
what a book cannot do is leave the product — that is E9 and E10.

Of the three things E5 §9 says the migration does not carry, **promo-tier seeding is now
done** (§2). The `enrich` worker for synonyms and the cutout branch of the `bg` worker are
still open.

E5-08 catalog admin overlaps E13; build the shop-facing half first.

### E6 — Offer book editor (MVP) — the loop closes

**Read `docs/composition-model.md`, not E6 §2 or §5.** Those sections describe a page-type
grammar that no longer exists; the doc's banner says which parts still stand. Detail and
reasoning live in `docs/E6-pending.md`; this is the summary.

**Built, 7 September.** A shop owner can now:

- **Create a book** at `/editor/new` — **rebuilt 10 September, see §1.4 and
  `docs/E6-create-flow.md`.** Four steps: what you are making, which offer card, which
  products (search, or a price list dropped straight in), then a preview of the real book
  with Open editor or Discard. No name is asked for; the editor renames. The price-list
  path is the half E5-06 deliberately left open — it committed rows into the catalog and
  stopped, because there were no offer books to carry the prices into — except that it now
  matches without writing to the catalog at all.
- **See it drawn** at `/editor/[id]`. The artboard is inline SVG through the engine —
  `flowBook` pages it, `resolveBlock` places the elements, `compactBlock` reclaims what the
  content did not use at `balance`, and `components/blocks/draw` paints. `/brand` uses the
  same painter, so a card cannot look one way there and another here.
- **Price it** — price, was-price and promo tier in the properties panel, optimistic, saved
  per field on blur *and* autosaved two seconds after the last keystroke. The tier is the
  only control on the price mark, per E6 §3.
- **Change what is in it** — search and add, remove, reorder by dragging, and join a second
  product to an offer with `or`/`and`.

`EDITOR_BUILT` and `BOOK_CREATION_BUILT` are both true. `stores/editor-store.ts` exists.

**The feature list was closed out on 8 September.** Also built, all of it detailed in
`E6-pending.md` §8:

- **The rest of E6-03** — unit price (`AUTO` from pack maths, `MANUAL` frozen at publish,
  `HIDDEN`), chips, footnotes, extra charges, per-item name and spec overrides in both
  languages, and changing a connector or reordering the products on a card.
- **E6-04 bounded overrides.** `SlotOverride` is rekeyed to `regionId` + `offerId`,
  `packages/engine/src/override.ts` applies and clamps it, and the panel nudges, scales the
  photo and resets. **A nudge is never inherited by whatever moves into that region** next
  week — which is the whole reason the key carries the offer.
- **E6-06 undo and redo**, fifty logical steps, Cmd/Ctrl+Z, surviving a re-hydration of the
  same book; **E6-08 autosave**, debounced two seconds, with "Saved 14:32" in the header.
- **Drag to reorder** in the tray, with the up/down buttons kept as the tablet path.
- **The master grid**, editable — cards across and rows down, with the page count under it
  as feedback rather than as a second control. Density is derived, never chosen. **Since
  11 September it also carries the page margin, a running header and footer band, and the
  page background** — colour, gradient or image. One route, patched as a delta.
- **A cell can draw a block of its own** — `offer_book_pages.regionBlocks`, picked in the
  Page tab. A cell holding a block that does not repeat becomes static and **the products
  route around it**, the same rule pins follow, so nothing is ever dropped: an Anniversary
  band in the top-left cell pushes the tea onto the next page. The engine needed no change,
  because `Region.blockId` has been per region since the composition model was written;
  what was missing was somewhere to author it that a grid rebuild would not flatten.
  `E6-pending.md` §10.
- **A tool rail** on the start pane — Offers, Layout, Background, **Page**, Pins — **grouped
  by scope since 13 September**. Offers, Layout and Background are the book; Page is one
  page's own paper and its merged cells, with the active page named once and set by
  clicking any cell on the artboard. It was four tabs mixing content with design, and the
  two page-scoped controls had grown two different ways of asking which page. §1.4 and
  `E6-pending.md` §10.
- **Pins.** `book_pins` has a writer: pick a panel, a page and a shape rather than four
  coordinates. Only a block that does not repeat may be pinned.
- **Duplicating a book** — the control the design skill expects to be the most-used in the
  product. It copies everything except what makes a book public: fresh short code, no link,
  no views, status back to draft.
- **`fit-escalated`**, reported by the page that drew the card, through the same
  `fitTextElement` the painter runs — so the flag and the card cannot disagree.
- **Merging cells on the artboard**, which is composition model step 4's other half and
  the last thing the engine could do that the product could not. Click a cell, shift-click
  or drag to extend, Merge in the Page panel; rectangular only, same as a spreadsheet, and
  a selection that half-covers a merge grows to take it whole. **A merge belongs to the page
  it was made on** — `offer_book_pages.merges`, applied per page by `flowBook` while one
  product cursor runs through the whole book, so a page holding a hero holds one card fewer
  and the products carry on. It shipped for a day as a property of the *master*, which is
  what the composition model specified and what was rejected in use on sight, twice. A merge
  the track count can no longer hold is dropped rather than clipped. Not on the undo stack,
  for the same reason no other grid control is. `E6-pending.md` §10.
- **A page may have its own paper** — `offer_book_pages.background`, with three answers
  rather than two: absent inherits the book, a stored `null` is deliberately plain paper
  although the book has a ground, an object is the page's own. The value is wrapped because
  Prisma's two JSON nulls read back identically, so without it "inherit" and "none" would
  be the same value and a background could never be taken off one page. The preview and
  `duplicateBook` both had to learn it.
- **A cell can draw a block of its own** — `offer_book_pages.regionBlocks`, picked from a
  dialog of previews grouped by what a block is for. **A cell holding a block that does not
  repeat becomes static and the products route around it**, the same rule pins follow, so
  nothing is ever dropped: an Anniversary band in the top-left cell pushes the tea onto the
  next page. The engine needed no change, because `Region.blockId` has been per region
  since the composition model was written; what was missing was somewhere to author it that
  a grid rebuild would not flatten.
- **Three defects that only a browser found**, all of them in what the interface put in
  front of the owner rather than in the engine: cells a pin had taken were still offered,
  so the first merge anyone tried stored correctly and changed nothing on the page they
  were looking at; `useGridPatch` cleared `busy` on the *fetch* while `router.refresh()` is
  not awaited, leaving **nine seconds of unlit wait** after every press; and a `ghost`
  button read as a heading beside two outlined pills and was reported broken twice while
  working correctly. All fixed. The middle one is a seam **every** control in that panel
  still shares.

**What E6 still owns:**

- **Dragging track edges.** The `fr` sizes are uniform and only the count is editable, so a
  page is still rows of equal cards. `resolveTracks` has taken arbitrary `fr` values since
  it existed; what is missing is the drag and a writer for `cols`/`rows`. Merging, per-page
  paper and per-cell blocks are all built — see above.
- **Drag from the catalog onto a cell.** Adding is a button; a cell is not a drop target.
- **No book-wide "change the offer card".** `cardBlockId` is still only set at creation, in
  `POST /api/v1/offer-books`. The per-cell picker makes its absence stranger: an owner can
  change one cell's card and not all of them. Small, and the picker is the component.
- **The `busy`-versus-repaint seam, everywhere else in the Layout panel.** It was fixed for
  merge and for per-cell blocks, both of which now hold a pending state until the *new grid
  arrives*. Track count, margin, bands and the book's background still report `busy` against
  the fetch, which `useGridPatch` clears before `router.refresh()` has re-run anything. They
  hide it better only because a select keeps showing the value you chose while a page does
  not.
- **Pins still asks which page in its own words.** It keeps an "On page" select while
  everything else page-scoped now follows the Page tab's active page. Folding it in is the
  obvious next move; it was left because `PinsPanel` also *lists* every pin in the book,
  which is a different job from editing one page.
- **Two block element kinds.** The unit-price line and footnote markers are stored, shown in
  the panel, and **cannot be printed**, because a block's element vocabulary has no place to
  put them. Chips draw — a block already carries a `chip` element, and authored chips stack
  from it. The recommendation is `unitPrice` and `footnotes` element kinds in the block
  designer; it is an architecture decision, so it is raised rather than taken.
  `E6-pending.md` §8 has the write-up.

**No Fabric, and that is now a settled finding rather than a pending one.** The epic
assumes a canvas object model. Nothing has needed one — including dragging and nudging,
which were the two things named as the point at which it would earn its place, and
including E7's block designer, which does direct manipulation over the same painter through
`moveBox` and `resizeBox` in the engine. What Fabric would add is a **second painter**, and
the first thing to drift would be whether the card the owner designed is the card the PDF
prints. If it ever lands, two rules from `apps/web/CLAUDE.md` bite immediately:
`document.fonts.load()` for every family *and* weight before a single text object, and
`placeText` per text object, because a canvas text object takes its own direction and does
not inherit the artboard's.

**The risk E6 §10 names has been answered twice.** *"If the engine's output looks like a
real flyer with no manual adjustment, the product works."* Yes on invented data, and yes
again on real catalog rows — see §1.2. It is off the table.

**Needs first:** nothing on dev — `page_grids.background` is migrated and applied there.
Any *other* environment needs `pnpm db:migrate` before a book will open, because `loadBook`
selects the column. The `pdf` worker blocks *export*, which is E9.

### E9 — Output formats & export (MVP)

**Needs first:** the `pdf` worker. E6 and E7 are built, so this is the *only* thing on the
critical path — a book can be created, priced, laid out and designed for, and it cannot
leave the product.

**The written pipeline starts one step later than it needs to.**
`souqstudio-technical → references/export-pipeline.md` says canvas → `toSVG()` → HTML shell
→ Playwright, and that first arrow assumes a Fabric canvas to call `toSVG()` on. **There is
no canvas.** The artboard is inline SVG produced on the server by `components/editor/
BookPage.tsx` from engine geometry, so the worker can render the same component and skip
Fabric entirely — which also removes the font-loading hazard, because nothing measures text
in a browser to decide the layout. Confirm that before building to the document.

A warm browser pool is still mandatory; launching per request costs 400–600ms every time.

**What E7 added to this list.** The painter now draws rotation, opacity, strokes, ellipses,
lines, `cover` images and free type sizes, and resolves colours through `ColorValue` — a
role, a palette entry or a literal. The worker renders the same component, so it inherits
all of that for nothing *provided it keeps rendering the same component*. Two things it
must carry that a browser gives away free: the shop's palette, for `resolveColor` to have
anything to resolve against, and a URL for uploaded artwork, which `lib/block-assets.ts`
builds from `R2_PUBLIC_URL` and an object key.

**A third, added 13 September: the export must render each page's *own* values.** A page may
now carry its own paper and its own per-cell blocks, so a worker handing `BookPage` the
book's `layout.background` would print every page on the book's ground and silently lose
the ones an owner set. `loadBook` already returns `pageBackgrounds`, and the merges and
per-cell blocks are inside `flow.pages` — but it is one prop, and exactly the kind a worker
quietly does not pass. `BookPreview` had this bug for a few minutes and it is written up in
`E6-pending.md` §10.

Two things the export must not lose, both learned the hard way in E6:

- **`placeText` per text object.** A Latin pack label on an Arabic artboard prints backwards
  without it, and the failure is invisible to anyone checking the English edition.
- **`--sq-tpl-*` has no stylesheet in the PDF.** The tier colour on the chip and the price
  mark resolves through a CSS custom property in the browser. Playwright renders an HTML
  shell, so the tokens have to be inlined into it — see `E6-pending.md` §6. Note that an
  owner who styled a price mark or a chip in the designer has a `ColorValue` there instead,
  which resolves without a stylesheet; it is the *unstyled* ones that still need the token
  set.
- **Two element kinds do not exist yet**, so the unit-price line and footnote markers are
  stored, shown in the editor's panel, and cannot be printed. `E6-pending.md` §8 carries the
  recommendation. Export is where that stops being an inconvenience and starts being a
  missing line on a flyer.

### E10 — Sharing & publishing (MVP for link/QR/WhatsApp)

**Needs first:** the encryption key decision, for the Instagram half only — E6 is built. The
link, QR and WhatsApp share paths need neither and could go earlier if the public viewer
at `app/o/[code]` is worth having before export is.

### E12 — Notifications (MVP for transactional email and in-app)

**Partly there already.** The email queue and worker are built, and eight of the fourteen
templates in `EmailTemplate` exist. Missing: `plan-upgraded`, `plan-downgraded`,
`subscription-cancelled`, `offer-book-expiring`, `new-template-available`, and any
security-alert mail at all — enabling, disabling or resetting two-factor notifies nobody.

The `Notification` and `NotificationPreference` models exist; there is no in-app
notification UI and no `stores/notification-store.ts`.

### E13 — Admin panel (MVP for catalog and org management)

**Needs first:** E5, for anything to administer. `apps/admin` is scaffolded and empty.
Admin auth is a separate path against `admin_users` with its own session secret — never
the shop-owner session layer.

### E7 — Block designer — built 7 September, opened up 8 September

**The first version was too tight, and the owner said so.** It was a form with a
canvas attached: six colour slots and no picker, sizes from a fixed scale, no
shapes beyond a rectangle, no uploads, no rotation, one element selected at a
time. The verdict — *"fundamentally not what I want; the user is too stuck with
us, or we have to give hundreds of templates"* — was right, and "ship a hundred
templates" is the wrong answer to it.

What came out of separating the constraints that do real work from the ones that
were only caution is in `docs/E7-pending.md` §8. **Three rules stayed**: product
text is bound rather than typed, coordinates are fractions of the block, and the
*repeating* card reflows rather than being hand-placed — that last one is the
five-minute weekly reissue, and giving it up would be giving up the product.
**Everything else opened**: any colour, any size, circles and lines and strokes,
uploaded artwork, rotation and opacity, multi-select with marquee, group, align,
distribute, snapping with guides, a full keyboard, and a price mark whose colour,
ground and frame are the shop's — only its composition is still ours.

"No hex, ever" became "no hex in a block *we* ship", which is now enforced rather
than assumed. A block placed once — a cover, a brand panel, a message — is
designed at a page shape rather than at a card's, which is the "design a page,
not a card" half of the answer; it reaches a book as a pin.

**Then it was made to look like the tools it is competing with**, which was the
second round of the same feedback and a fair one: a labelled list of cards reads
as a form, and a form is what was rejected. A tool rail of conventional glyphs on
the start edge — pointer, `T`, paint bucket, square, circle, rule — with the two
that have no convention, a product field and a price mark, in their own tinted
group, because those exist in no other design tool and inventing glyphs for them
would be making up a vocabulary rather than borrowing one. Layers drag to
reorder, **front-most at the top** as all four of those applications list them,
which is the reverse of the array underneath. Icons only where a convention
exists: alignment, italics and case became buttons, weight stayed a list because
four named weights are four values a `B` would collapse to two.

The canvas opens **fitted**, which it did not before — see §1.0 for why that
silently did nothing until the shell was given a definite height.

**Then it was given something to design *from*.** The seeded gallery E7-pending
listed as owed is built. `pnpm --filter @souqstudio/engine gallery` draws every
block at every shape it claims, plus the worst-case Arabic name and an Arabic
edition, to `harness/out/gallery.html` — and it is the only check in the repo
that finds a *design* defect rather than a correctness one. It found four the
232 engine tests could not:

- **A block that declines to design a shape does not avoid it.**
  `pickArrangement` falls back to the nearest range, so the list row's two
  arrangements meant an owner dropping it into a portrait cell got the wide
  layout crushed into it — stretched thumbnail, two-character price, name
  escalated red. Refusing to design a shape only stops anyone deciding what it
  looks like.
- **A promo-tier pill draws in a brand colour, so a brand-coloured ground can
  swallow it.** A `primary` tier on a `primary` card.
- **`variant: 'line'` draws left to right in both painters**, so three vertical
  dividers rendered as two-pixel dashes.

**And the screen stopped being a page of both collections.** At four seeded
blocks, printing ours under theirs read as one screen with two halves; at
sixty-seven it read as a catalog with the shop's own work stranded at the top.
They are not peers — one is theirs and editable and the reason to open the
screen, the other is a shelf. `/brand/blocks` is their library alone now, and
"Add from library" opens `BlockImportDialog`: filtered by what a block is *for*,
multi-select, one action naming the count. `POST /api/v1/blocks` grew a `fromIds`
branch beside `fromId` — importing is not duplicating, so an imported block is
"Ramadan band" and not "Ramadan band copy".

**What E7 still owes:** ~~gradients, E7-03's seasonal scheduling~~ — both landed
later on 8 September, see `E7-pending.md` §9 — and the check that has found
something every time it has been run: *none of the library work has been opened
in a browser.* It was verified by mocking each surface at its
real dimensions against the rendered blocks, which caught two defects on its own
(a footer tile 22px tall beside a 240px card; a dairy packshot under a laundry
detergent's name). A mock cannot tell you how the filter row behaves on a phone,
and it cannot measure the dialog mounting 67 live previews at once on the
mid-range Android this product is for.


**The epic was rewritten before it was built**, against `docs/composition-model.md` §3, and
the rewrite is `docs/E7-pending.md` §1. Templates and grids are not objects any more, so
E7-01, E7-02 and E7-04 had nothing left to administer; what survived is the block designer
and the card designer addendum, and **E7-05 — owner-authored blocks, scoped V3 — shipped in
the MVP** because the composition model made it the same code path as a seeded block.

A shop owner can now duplicate a seeded block, move and resize its elements, change what
each one binds to, declare what an overlong string may suffer, undo, and restore a previous
version. The library is `/brand/blocks`; the designer is `/card-designer/[blockId]`.

**Still no Fabric, and this was the surface that was supposed to need it.** Direct
manipulation needs a hit target, a delta and somewhere to put the result; the engine already
owns the arithmetic in fractions and the painter already draws every element. Fabric would
mean a second painter, and the first thing to drift would be whether the card the owner
designed is the card the PDF prints. `E7-pending.md` §3 carries the reasoning and the list
of things that would justify revisiting it.

The rule that did not move: **the price mark's composition.** Its colour, ground, frame and
badge are the shop's now — refusing those is what made it feel like somebody else's
component sitting in the middle of an owner's card — but the raised minor digits, the
attached tier tab, the three-decimal branch and LTR-in-Arabic are still ours, and the digits
are never separate text boxes.

**Not built:** dragging a *new* element from the palette (tapping adds it, which is the
tablet-safe equivalent the design system asks for anyway), the composer's half of E7-03, and
the overlay asset library.

~~Gradients~~ and ~~E7-03~~ were built later the same day — `E7-pending.md` §9. The estimate
recorded here was wrong in an instructive way: the `ColorValue` arm really is four lines, but
`resolveColor` returning a `string` is the seam, and SVG will not take a gradient as an
attribute value. Seasonal scheduling turned out to be blocked on a premise rather than on
work — the picker it needed had already been built, and the moving-calendar problem is
answered by computing the window instead of storing it.

**The thing to build next here is not code.** A blank canvas is now the weakest part of a
tool that is otherwise good enough: fifteen to twenty-five real seeded designs across
grocery, pharmacy, electronics and the seasons would do more for a shop's first ten minutes
than any control left on the list. It is design work, and `library.ts` is where it lands.

**`pnpm db:seed` was re-run on 8 September** and the block library is on the new shape —
element ids, `fill` as a `ColorValue`. Reading the rows back through the real parser is what
caught two more defects; `E7-pending.md` has them.

### E8 — AI features — eight of nine built, and what that left open

**Image generation is live; the *reading* provider is the one still on a placeholder.**
E8-01 has run against Gemini four times — see §1.7. What has never run is the Claude path
for the features that read a picture, because `ANTHROPIC_API_KEY` is still the placeholder
described below.

**`docs/E8-pending.md` is the working note, written 15 September.** It carries the list
below plus the two defects the live run found, the deliberate compromises, and the fact
that **magic block fails every attempt on dev right now.** `MAGIC_BLOCK_PROVIDER` is unset,
unset means Anthropic, and that key is the literal placeholder `sk-ant-` — which passes the
`startsWith` check and 401s at use. A real Anthropic key was deferred on 15 September. The
DashScope key was moved into `apps/worker/.env` the same day, so `MAGIC_BLOCK_PROVIDER=qwen`
is a one-line fix — but which provider receives shop owners' uploaded images is a decision
the epic says to make deliberately, so it is left unset rather than flipped.

**Two more features were specified and built on 16 September.** `E8-08` proposes a brand
palette and a type mood for a shop with no logo to quantize, from a storefront photo or a
sentence; `E8-09` generates the logo mark E4-01 assumes an owner already owns, by matching
one of four hand-drawn SVG structures and skinning it from the shop's palette. Both are
shaped as magic block is — a closed vocabulary, a structured answer, a result a person
accepts — so **neither needs the diffusion provider that blocks E8-01 to E8-04**, and E8-09
sends no image in either direction. Both ship route, queue, worker, poll and UI, with 34 new
engine tests over the two vocabularies. **Neither has been run against a live model**, for
the same reason magic block has not: the default provider is Anthropic and that key is a
placeholder. What building them corrected is `E8-pending.md` §2a — including one defect a
test caught, where the "same colour twice" check was written as a contrast ratio and read a
dark green and a dark red as the same colour.

**E8-01 to E8-04 were built on 16 September, after the provider question was answered:**
Gemini as the default and Qwen as the second, behind a new `IMAGE_PROVIDER`, with uniform
photographs allowed to leave the platform under explicit consent. **Unset means off**, which
is every environment today — the routes refuse rather than queueing something that fails
later. Characters, poses, described poses and covers all ship route, queue and worker; only
E8-01 has a UI, and its first screen is the consent. The photograph reaches one vision
provider once and is not stored; what goes to the image model is a description of the
clothing, which is enforced by a schema with no field a face could go in. `E8-pending.md`
§3 and §3a.

**E8-05 is now complete and finding it turned up a rendering bug.** The manual background
removal the spec asked for — one credit, on the product whose cutout failed — existed
nowhere; `background_removal` was priced and never charged. Building it surfaced the real
problem: the editor picked a product's image with `orderBy: { kind: 'asc' }` on a Postgres
enum, which sorts by declaration order, so **every product with a good cutout was drawn
with its background on** and flagged in the panel. The catalog screen disagreed with the
artboard about the same product. `E8-pending.md` §2b.

`E8-07` ships (§1.3). What it leaves on the table, cheapest first:

1. **Finish looking at the renders.** The inset change touched 97 boxes across all four
   arrangement shapes and only the tall ones have been reviewed, with the friendliest
   product. The wide and banner arrangements, the worst case and the Arabic edition are
   193 unreviewed renders in `harness/out/gallery.html`. Twice now that check has found
   something nothing else could.
2. **Let magic block choose a ground.** The model picks a structure and inherits whatever
   that structure ships with, so an uploaded card with a starburst price still comes back
   with the structure's default. Adding `ground` to `magicChoiceSchema` is one enum, a
   line of prompt, and the assembly already handles it.
3. **Run `magic:check` against Claude.** Two providers were built to be compared and the
   comparison has never been made — `ANTHROPIC_API_KEY` is a placeholder in both `.env`
   files. It now carries a still case as well as three card ones, which is the stricter
   half: a footer fed back under "footer" either comes back as itself or it does not.
4. **Look at the eight square posts.** `social-post` is a new category and its designs are
   new drawings — rendered in both directions and checked against `validateBlock`, but the
   gallery's worst-case pass over them has not been read by a person.
5. **Nothing matches against a design that only exists in R2.** The magic vocabulary is
   `SEED_BLOCKS`, the arm compiled into the worker, because reaching the loaded library
   would put a network call inside the vision path. True of everything published today,
   and not true the first time a design ships to a bucket and not to the repo.

The four image jobs — character, pose, cover, prompt — are a separate decision: they need
a diffusion model, and which one has not been chosen. `OPENAI_API_KEY` is declared and
unused.

### Static blocks still carry a repeating card's leash

Not an epic, and the largest remaining piece of the freedom argument. **Forty of the
sixty-five blocks are static** — headers, covers, panels, footers, square posts, seasonal
bands — with **one arrangement each** and three element kinds between them: shape, logo, text. No
product in scope, no reflow, nothing the constraints are protecting. They carry the
identical restrictions as the repeating card: no shadow, no text on a path, forty
elements.

A static block is a poster and should get an artboard. The repeating card is a component
and its bindings and reflow are the contract. The dial belongs per block kind rather than
globally, and `docs/composition-model.md` §3.3 already half-says so about arrangements
without extending it.

### E11 — later

E8 is AI features, V2, and needs the `ai` worker. E11 is analytics, V2, and needs the
public viewer from E10 to have something to track.

---

## 4. Open decisions

These are waiting on a human, not on effort. Each one changes what gets built.

| Decision | Blocks | Where |
| --- | --- | --- |
| **`Brand` entity** — one org, several licences | E6 | `E4-pending.md` §1 |
| **Typefaces and Arabic coverage** | the design calibration pass | the type scale splits Host Grotesk from Plex Sans Arabic purely on coverage |
| **`font-display text-heading`** used for section headings across the settings screens | nothing | contradicts the type scale and consistency check #6 — Host Grotesk has no Arabic, so those headings fall back in an AR interface. `/brand` was moved to `font-ui`; the rest is a sweep and a decision, not a bug fix |
| **How many typefaces to offer** — the catalog is ten curated families | nothing | every Google Fonts family with Arabic coverage is ~30. Widening is a data change in `lib/brand-fonts.ts`; the full library is the version to refuse, because most of it has no Arabic |
| **Palette and style ceilings** — 8 colours, 12 text styles | nothing | product judgements, not architecture. `MAX_PALETTE` and `MAX_STYLES`, one constant each. Nothing breaks at twenty; twenty is not an identity |
| **Per-level control in the typography UI** | nothing | the model lets any text style bind to any face slot and carry its own size and weight, and there is a test for it. The picker exposes the four slots and the per-style dialog, not arbitrary re-binding |
| **`Select` has no `size` prop** | any row pairing a select with an `lg` input | the inventory raised it at E2 and it has now bitten twice. `ColorField` got the prop; `Select` still has not |
| **Forcing an incomplete owner into the wizard** from anywhere in the dashboard | nothing | `E4-pending.md` §2 |
| **`StatusPill` enum** — no value for active/paused/pending/expired | the pill, and three screens using plain text instead | `E2-pending.md` §6 Q1 |
| ~~**What a CSV row that matches no product should do**~~ | — | **Decided 15 September**: it goes into the shop's own collection as the book is created, with no image and no contribution row, and with nothing asked. Matching is how an offer finds its *photograph*, not a gate on what a shop may promote. `E6-create-flow.md` §16 and §19 |
| **A browser driver** — Playwright plus a Chromium binary, or nothing | every UI change from here | §1.0. Three defects in two days were found by a person opening a screen; `curl` proves structure and cannot prove behaviour or contrast. It is a dependency install, so it is a decision rather than a task |
| **Cards have no `SQUARISH` arrangement** — add one to the twenty-five, or keep constraining grids to `TALL`/`WIDE` | posters and any hand-built grid | `E6-create-flow.md` §7 and §10.4. `pickArrangement` falls back silently, so the failure is a stretched card and not an error. The shipped defaults dodge it; the editor's layout panel can still reach it, and warns |

---

## 5. Before writing any code

1. Read the epic in `docs/`.
2. Read the `CLAUDE.md` of the app you are working in.
3. `souqstudio-design` before any UI, `souqstudio-technical` before any server work,
   `project-structure` before creating any file.
4. Check `references/component-inventory.md` before building a component — build to the
   signature there or raise it; never invent a second API for the same thing.
5. `pnpm typecheck` after each meaningful change, `pnpm lint` and
   `references/consistency-checklist.md` before calling UI work done.
6. **`pnpm build` before anything reaches Railway.** `pnpm check` is typecheck, lint and
   stylelint — it does not build, and Railway does.
7. **`pnpm --filter @souqstudio/web check:classes`, after that build.** It reports every
   sized utility in the source that generates no CSS. The scales here are *replaced*, so an
   off-system class name is a valid string that styles nothing, and nothing else in the
   toolchain can see it — §1.0 has the four times that has cost a screen.
8. **Open it.** Not "look at the code" — open the page. Consistency check #9 asks for the
   screen rendered in Arabic with real strings, and it is the one check that keeps finding
   what the others cannot: a ratio that read `12 of 8` in RTL, a colour field whose shell
   was half the border weight of the input beside it, type that collapsed in a wide short
   block, an artboard that was not on the page at all. For artboard work,
   `pnpm --filter @souqstudio/engine harness` renders sample pages in both directions; for
   a screen behind the session gate, a headless browser and a minted dev session take about
   ten minutes to set up and found four defects the first time they were used. For a
   *block* rather than a page, `pnpm --filter @souqstudio/engine gallery` draws all
   sixty-five at every shape they claim; it found four defects no test could,
   and looking at them all at once found a fifth thing no single render can.
9. **Check the environment the code will run in, not the one on your machine.** The
   `R2_ENDPOINT` fault in §2 was found locally on 6 September, fixed in `.env.local`,
   written up here with the words "check the Railway environment before deploying" — and
   the deployment still carried it two days later, because a note in a status file is not a
   control. Where a variable has a shape that can be silently wrong, validate it in
   `lib/env.ts` so the app refuses to boot instead of writing into the void.

The design system is enforced mechanically: Tailwind's default palette, spacing and radius
scales are replaced rather than extended, so an off-system value does not resolve. Lint
errors on physical properties, raw hex, shadows, italics, blue fills and template tokens
in chrome.

**Two of those are worth knowing precisely, because both have bitten.** "Does not resolve"
means *generates no CSS*, not *fails the build* — see step 7. And the raw-hex rule governs
**our chrome, never what a shop produces**: a colour an owner picked is data on their block
or their brand kit, which is why `ColorValue` exists and why a handful of files are exempt
by path in `packages/config/eslint.design.cjs`.
