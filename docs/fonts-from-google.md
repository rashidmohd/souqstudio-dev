# Fonts, from Google into R2

*A design note and a plan of record. Written 21 September 2026.*

**The proposal:** open the font picker to almost the whole Google Fonts library
instead of ten hand-picked families. When an owner chooses a face, pull it from
Google once, put the files in R2, record it in a table, and serve every surface
from R2 from then on. Mirror each family once for the whole platform, never
per shop and never twice.

This note says why that is right, what it retracts from the design currently
written into `apps/web/lib/brand-fonts.ts` and the design skill, and the order
to build it in. **Part A moves the bytes and ships alone** — it unblocks E14 and
E9 without changing the picker at all. **Part B opens the library** and is the
product change.

---

## 1. The constraint everything must respect

**One set of font bytes answers for every surface.** Four things draw or measure
the shop's typefaces, and all four must agree:

| Consumer | Needs | Today |
| --- | --- | --- |
| The picker specimen — `TypographyFields` | a CSS link | `fonts.googleapis.com` |
| The Fabric artboard — `BlockArtboard`, `draw.tsx` | faces resolved *before* text objects exist | nothing |
| The export worker — Playwright → PDF | real files, no external network | nothing |
| The `hug` measurer — HarfBuzz, E14 | font **bytes**, server-side | nothing |

E14 Phase 0.1 is what makes this a constraint rather than a preference.
Word-segmented HarfBuzz matches Chromium's canvas at **0.000% through p99** over
1.1M measurements — but that is a statement about two programs reading *the same
file*. Let chrome read Google's `Cairo v28` while the shaper reads a snapshot of
`v27` and the number stops being true. It does not fail loudly; it decays as
Google ships releases, and it surfaces as *"the preview is off by a hair from the
PDF"* — the exact defect class §0.1's word-segmentation rule was introduced to
eliminate.

So the split written into `brand-fonts.ts` today — CDN for chrome, R2 for the
render path — is not an acceptable end state. It was written before Phase 0.1
measured anything.

---

## 2. Mirror once, for the platform

The R2 key `fonts/cairo/400.ttf` is global. It is not a per-shop asset and must
not become one. The first shop anywhere to pick Cairo pays for the fetch; every
shop after gets a hit. If four hundred shops pick Cairo that is one registry row,
one set of files, and four hundred brand kits holding the string `"Cairo"`.

**The font is shared. The choice is per shop.**

| | Holds | Scope |
| --- | --- | --- |
| `fonts` registry — new | family, Google version, subsets, category, variants, R2 keys, licence | one row per family |
| Brand kit — exists | `fontHeadline`, `fontDisplay`, `fontPrice`, `fontBody`, `typeScale` | one row per shop |

### 2a. Once means never re-fetching

A mirrored family is never refreshed on a schedule. Shops have published offer
books and PDFs built against those exact outlines, and silently swapping them
under a live document is the failure this whole design exists to prevent.

Taking a newer Cairo is therefore a deliberate, rare migration to a *new* key,
with the old one left in place for everything already built on it. The registry
records Google's `version` at mirror time so that decision can be made on
evidence rather than guessed at.

**This retracts a version-in-key scheme argued for earlier in the design.** The
objection was that `max-age=31536000, immutable` on a key a re-mirror overwrites
is a lie. With no re-mirror the key is genuinely immutable and the plain path is
correct.

### 2b. Take the whole family, not the weights in use

An earlier version of this design mirrored only the weights `resolveScale()`
binds. That is wrong under "once is enough."

Mirror Cairo at 400/700 because one shop bound those, and the next shop binding
600 gets a *partial* hit — after which the specimen, the artboard, the shaper and
the worker each have to test presence per weight instead of per family. That
conditional would live in eight places.

**Measured, 22 September 2026** — `fonts:mirror --dry-run` over the ten, against
Google, with the uploads discarded:

| Family | Version | Faces | Files | Size | Fetch | Subsets |
| --- | --- | --- | --- | --- | --- | --- |
| Lalezar | v16 | 1 | 6 | 0.3 MB | 0.5s | ar · latin · latin-ext · vi |
| Almarai | v19 | 4 | 13 | 0.8 MB | 0.5s | ar · latin |
| Reem Kufi | v28 | 4 | 21 | 0.6 MB | 0.5s | ar · latin · latin-ext · vi |
| Tajawal | v12 | 7 | 22 | 0.5 MB | 0.6s | ar · latin |
| Baloo Bhaijaan 2 | v21 | 5 | 26 | 1.4 MB | 0.7s | ar · latin · latin-ext · vi |
| Changa | v29 | 7 | 29 | 0.9 MB | 0.8s | ar · latin · latin-ext |
| Readex Pro | v27 | 6 | 31 | 1.1 MB | 0.8s | ar · latin · latin-ext · vi |
| Cairo | v31 | 8 | 33 | 1.3 MB | 1.2s | ar · latin · latin-ext |
| Noto Sans Arabic | v33 | 9 | 55 | 3.8 MB | 1.7s | ar · latin · latin-ext · math · symbols |
| Rubik | v31 | 14 | 99 | 4.5 MB | 1.6s | ar · cyrillic(+ext) · he · latin(+ext) |

**65 faces, 335 files, 15.1 MB, every family OFL-1.1.**

**The file count is faces × subsets, not faces × 2.** An earlier draft of this
note said "~9 weights × 2 formats is 18 fetches"; Rubik is 99 files, because
woff2 is split per script and Rubik carries six. At 1.5 MB a family, three
hundred families ever chosen is ~450 MB — still nothing, and still cheaper than
a per-weight presence check in eight call sites.

**The coverage claim in `brand-fonts.ts` is confirmed against Google's own
metadata** rather than against the picker's assertion about itself: all ten carry
`arabic` and `latin`. That is the first time the entry requirement for the
curated catalog has been checked by anything but a person reading a table.

Taking every variant also makes `hasItalic` a fact read from Google's metadata
rather than a boolean typed by hand in the catalog, where it can already be
wrong.

**First-pick latency holds at under 2s** — the number the blocking save in B2
depends on. `mirror-fonts.mjs` did these sequentially, which was the 8–10s
problem; at a concurrency cap of 6 the worst family in the recommended ten is
1.7s and the median is 0.75s. The measurement covers the fetch from Google only:
the uploads were discarded, so a real cold pick adds up to 99 PUTs at the same
cap and the figure to trust for B2 is whatever the first real run prints.

---

## 3. The catalog opens — a filter, not a curation

Ten families is the wrong number. The *reason* for ten is right and must survive.

Most of Google Fonts has no Arabic. An owner who picks a Latin-only display face
and then flips a book to Arabic gets tofu or a silent fallback that destroys
their grid. That is why `brand-fonts.ts` refuses to expose the library.

But hand-curation was always a stand-in for a filter nobody had built.
`references/brand-kit-fonts.md` already states the real rule — *"the picker
filters by the shop's languages, not by the library"* — and the Developer API
returns `subsets` per family, so the rule is now buildable:

> **A family is offered only if its subsets cover every language the shop sells
> in.**

An English-only shop sees ~1,500 families. A bilingual shop sees ~30. Both
listings are honest and neither can produce tofu.

**Keep the ten.** They stay as `DEFAULT_FONTS` and as a *Recommended* group
pinned above the search box. The editorial notes are the part a subset filter
cannot reproduce — *"narrow enough for a long price in a tight cell"* is not
derivable from metadata — and a picker that opens on 1,500 names with no opinion
serves a shop owner worse than one that opens on nine good ones.

### 3a. The Developer API replaces the scraping

`https://www.googleapis.com/webfonts/v1/webfonts` returns `family`, `variants`,
`subsets`, `category`, `version` and a `files` map of direct TTF URLs. That is
every field `mirror-fonts.mjs` currently obtains by requesting the CSS API with a
`Mozilla/4.0` user agent and regexing the reply. **The script gets simpler.**
Needs `GOOGLE_FONTS_API_KEY`; the list is ~1 MB of JSON, cached server-side and
refreshed daily.

The woff2 side still comes from the CSS API with a modern user agent, because
that is the only place the `unicode-range` blocks are published.

---

## 4. Two formats, and what each is for

**woff2, script-split — the browser and Fabric.** Cairo 400 is 36 kB of woff2
against 91 kB of TTF. A four-slot kit at TTF is ~1.1 MB on a mid-range Android,
which is the user the type scale is otherwise rationed for. The `unicode-range`
blocks must be preserved verbatim so an English page never downloads Arabic.

**TTF, static instances — the shaper and the PDF.** A shaper cannot read woff2
without a brotli decompressor, and PDF embedding needs the real file. Statics
rather than the variable face, because Phase 0.1's parity was measured against
statics and there is no reason to re-open a settled number.

**Subsetting is not owed.** Chromium subsets on embed — a bilingual page of Cairo
carries a 9 kB font program out of a 91 kB face — and Google's per-script split
already answers the download side. The note about "shipping every Arabic glyph
twice" was about the wire, not the PDF.

Each family's `@font-face` rules are stored on its own registry row, with
Google's `unicode-range` verbatim and the URLs pointed at R2. `googleFontsHref()`
and the stale-link bookkeeping in `useGoogleFonts` are deleted rather than
ported — the rules are already in the database by the time anything needs them.

**A single `fonts/brand.css` holding every family does not survive Part B**, and
the measurement above is why: Rubik alone is 33 kB of CSS and Cairo 12.6 kB, so
the recommended ten come to well over 100 kB and a lazily-grown library of two
hundred families would be megabytes on a file every page links. It is written
today because ten families is 100 kB and A1 needs *something* for the specimen
to link. What it becomes is per-shop: the four rows the kit resolves to, emitted
into the document head from data the app has already loaded. No extra request,
no file to keep in step, and it does not grow with the library. §8.

---

## 5. Licensing

`mirror-fonts.mjs` hardcodes `ofl/` in the GitHub path. The full library is OFL,
Apache 2.0 and UFL. All three permit hosting and embedding, so nothing is
blocked — but the **correct** licence file must travel with each family, and
which one it is comes from the family's metadata, not from an assumption.

Nothing renames a family, which is what OFL's reserved font name clause asks for.

**Custom font upload** — the higher-plan feature with a licence attestation at
upload — reuses this registry with a different provenance and no Google fetch.
That feature cannot be served from Google's CDN under any design, which is an
independent reason the render path has to be file-and-manifest based before it
arrives. Built after, it is a second code path.

---

## 6. Part A — move the bytes · ships alone

**Unblocks E14 Phase 2 and E9 without touching the picker.** The ten curated
families simply stop being served from Google's CDN. If Part B is never built,
this still ships and is still worth it.

### A1. The registry and the mirror module · **M**

`scripts/mirror-fonts.mjs` becomes a module the app can call, not only a CLI.
Whole family, parallel with a cap, both formats, licence chosen from metadata,
Google's `version` recorded. The `fonts` table is written in the same
transaction as the upload completing.

Delete `readCatalog()` — parsing `brand-fonts.ts` as text to recover a literal
array stops being necessary once the registry exists.

- **Exit:** a real pre-warm run over the ten families completes against R2, and
  every row in `fonts` names files that exist. `fonts:mirror` has never been run
  for real; this is the first time.

### A2. The read sites · **L**

`findFont()` goes from scanning a static array to a registry lookup — small. The
volume is everything that depends on the array: `resolveScale`, `draw.tsx`,
`BlockPreview`, `BlockArtboard`, `BookPage`, `brand-store`, `PATCH /api/v1/brand`
and the two logo routes.

`resolveFont()`'s fallback improves in the move. *"A family not in the catalog
falls back"* becomes *"a family whose files are missing falls back"* — which is
the condition that actually matters at render time.

- **Exit:** no module imports `BRAND_FONTS`, and the specimen renders from
  `fonts/brand.css`.

### A3. Fabric loads fonts before it draws · **S**

`await document.fonts.load()` for every family *and weight* the kit resolves to,
before a single text object is constructed. Fabric caches metrics at creation; a
face that resolves afterwards leaves every bounding box measured against the
fallback.

Required by `apps/web/CLAUDE.md` and called nowhere in the repo today.

- **Exit:** re-measure on font change, and an artboard that switches families
  mid-session lays out identically to one loaded with that family from cold.

### A4. The export path reads files · **M**

**Scoped down on contact with the repo, and the reason matters.** This phase was
written as "the worker and the shaper read files from R2", which assumed both
existed. Neither does: `apps/worker/src/workers/pdf.worker.ts` is a stub that
throws `Not yet implemented`, and the HarfBuzz measurer is E14 Phase 2, which is
unstarted. There was no export to point at R2.

So A4 builds the substrate they will both take, and proves the property they
exist to guarantee:

- `apps/worker/src/lib/fonts.ts` — faces loaded from R2 as bytes, cached on disk
  between jobs (safe because the keys are immutable, §2a), nearest-weight
  resolution for a kit that binds a weight a family does not ship, and
  `@font-face` rules pointing at `file://` rather than at the network.
- `pnpm --filter @souqstudio/worker fonts:check` — renders each mirrored family
  to PDF through real Chromium **with DNS blackholed**, and reads the PDF back.

The engine stays free of database imports, as `packages/db`'s rules require: the
measurer will take font bytes as an argument the way `measure` is already
injected, and the worker is what loads them.

- **Exit:** every mirrored family embeds a font program, draws as text rather
  than a picture, and rasterizes nothing — with no name resolution available.

---

## 7. Part B — open the library

### B1. The picker · **M**

Developer API list cached server-side, filtered by the shop's languages, search
over the remainder, *Recommended* group pinned on top. The list must virtualize
and must not load 1,500 specimen webfonts at once.

Specimens preview from **Google's CDN**, and that is fine: it is a browse
surface. Nothing renders, measures or exports from it, so §1's constraint does
not reach it.

- **Exit:** a bilingual shop cannot see a family without Arabic coverage.

### B2. Mirror on select · **S**

`PATCH /api/v1/brand` checks the registry. Present → write the family name,
instant, no network. Absent → mirror the whole family, then write. Google
unreachable → **refuse the save with a sentence.**

The blocking behaviour is the point. If the mirror were a background job and the
kit stored the name immediately, there is a window in which an export runs
against a face that is not in R2 — and that returns a PDF in the fallback,
silently. A spinner is a cheap price for never testing this at render time.

- **Exit:** the invariant holds unconditionally — *a family named by a brand kit
  is a family present in R2* — and nothing downstream checks.

---

## 7a. What Part B actually cost, as built

**B1 and B2 are in.** The picker offers all 57 families, mirror-on-select is
blocking and scoped, a `fonts` queue finishes each family, and
`familiesNotExportable()` is the single gate. Four defects were found by running
it rather than by reading it, and all four were silent:

1. **The weight scope matched everything.** The route passed `WEIGHTS`, the seven
   weights the editor offers, so a cold Rubik still mirrored all fourteen faces.
   57 files instead of 17 — a fifth of the intended saving. `weightsInPatch`.
2. **`complete` was inferred, not measured.** It asked whether a filter had been
   *passed*, not whether it excluded anything, so a family that happened to ship
   exactly the required scripts registered as incomplete — queueing a job that
   could only be a no-op and blocking export until it ran.
3. **The blocking path downloaded the whole catalog** — ~1 MB of JSON to read one
   family. `fetchGoogleFamily` uses the API's `family` parameter instead.
4. **BullMQ rejects a job id containing `:`**, and the rejection failed the entire
   save — a font that had just been mirrored successfully came back as
   `font_not_available`. The id is slugged now, and a queue failure no longer
   fails a save: the face is in R2 and drawable, which is what was asked for.

---

## 8. What is still not true

- **A fallback policy is owed.** 19 to 125 catalog strings per face are in
  scripts the face does not cover, found by E14 Phase 0.1. Opening the library
  widens that, and it is the same decision as font loading: what is drawn when
  the chosen face cannot draw the string. It should be settled in this pass,
  not bolted on.

- ~~**A shop that adds a language after picking its fonts breaks its own kit.**~~
  **This cannot happen, and the premise was wrong.** There is no per-shop
  language column, and that is not an omission: the block document schema refuses
  a static string carrying `textEn` without `textAr`, so **every shop's book is
  bilingual** whether or not its owner thinks of it that way. There is no
  language to add later. The coverage filter is therefore a constant —
  `REQUIRED_SUBSETS` — rather than a per-shop lookup, which is simpler than §3
  assumed and removes this whole failure mode.

- **The library is 57 families, not fifteen hundred.** Measured against the
  Developer API: 1,955 families in Google Fonts, **57 covering both Arabic and
  Latin** (28 sans-serif, 15 serif, 13 display, 1 handwriting). §3 reasoned about
  an English-only shop seeing ~1,500 and needing search and virtualization; with
  every shop bilingual, the filtered list is small enough for a plain control
  with the ten pinned on top. It is still a **5.7× widening** of what a shop can
  choose from.

- **`fonts/brand.css` survives, as a link rather than an inline.** It was
  written off as a stopgap on a size argument, and looking at a real page
  corrected that. Inlining all ten families into the typography screen measured
  **148 kB that arrived twice** — React serializes a server component's markup
  into the RSC flight payload as well as the HTML — taking the page to 480 kB.
  Linking the stylesheet instead brought it to 182 kB, and it is cached across
  navigations besides. So the split is: the layout **inlines** the four faces a
  shop draws in, because four is small and a link is a round trip before first
  paint; the browse surface **links** the whole sheet.

  What remains true is that the sheet grows with the library, so **B1 must not
  assume it stays linkable** — at two hundred families it is megabytes and the
  picker needs specimens fetched per visible row instead.

- **The layout's inline is duplicated too**, for the same RSC reason — ~70 kB on
  every dashboard page for a four-family kit. Under the cap where a link would
  cost more than it saves, but it is not free, and a per-shop stylesheet in R2
  would remove it.

- **Measured, and it is worse than B2 assumed.** The first real run went in on
  22 September 2026 — 335 objects, 15.1 MB, 10 rows. With the uploads included a
  family costs **1.6s to 7.8s**, against 0.5–1.7s for the fetch alone:

  | Family | Fetch only | With uploads | Files |
  | --- | --- | --- | --- |
  | Lalezar | 0.5s | 1.6s | 6 |
  | Cairo | 0.9s | 3.1s | 33 |
  | Noto Sans Arabic | 1.7s | 5.5s | 55 |
  | Rubik | 1.6s | 7.8s | 99 |

  **The uploads dominate, and concurrency barely helps.** `CONCURRENCY` is now
  `FONT_MIRROR_CONCURRENCY`, and raising it was measured rather than assumed:
  Cairo goes 3.3s → 2.6s → 2.4s at 6 / 16 / 32. Diminishing immediately, because
  the cost is per-object round trips to R2 rather than bandwidth. Tuning alone
  does not rescue a blocking save.

  **A 7.8s blocking save is not acceptable, and neither proposed rescue works.**
  Both were measured on 22 September 2026 and both failed:

  *Raising concurrency does nothing.* Rubik is 7.2s / 7.0s / 7.3s at 6 / 16 / 32.
  The cost is per-object round trips to R2, not bandwidth, and 32 is marginally
  worse than 16.

  *Blocking on woff2 only was backwards.* An earlier draft of this note proposed
  waiting for the woff2 and finishing the TTFs in the background, on the reasoning
  that the browser needs only woff2 while the TTFs serve the shaper and the PDF.
  But woff2 is split **per script**, so Rubik's 99 files are 14 TTF, 84 woff2 and
  one licence — the woff2 *are* the bulk. That split saves about 15%.

  **The real lever is object count, and it is subsets and weights rather than
  formats.** Built and measured on 22 September 2026:

  | Family | Whole family | Scoped to what the kit draws with |
  | --- | --- | --- |
  | Cairo | 33 files · 2.6s | **9 files · 1.2s** |
  | Noto Sans Arabic | 55 files · 5.1s | **9 files · 1.6s** |
  | Rubik | 99 files · 7.7s | **17 files · 2.6s** |

  Rubik is the outlier because it carries six scripts; a typical family lands
  near 1.2–1.6s. An intermediate run pins where the saving comes from — Rubik
  scoped by subset but with all seven scale weights is 57 files and 6.1s, barely
  better than taking it whole.

  **That intermediate run is the trap the first implementation fell into.** The
  route passed `WEIGHTS` — the seven weights the editor *offers* — which matches
  every face a family ships, so only the subset filter bit and the saving was a
  fifth of what it should be. Scoping to the weights the kit's text styles
  actually bind is what makes it 3×. Corrected in `weightsInPatch`.

  The 1.5s an earlier draft estimated turns out to be right for a typical family
  and optimistic for the worst one. All of it measured from a laptop rather than
  from a server beside the bucket.

  **This is the decision, and it is not ours to make by default.** It weakens
  B2's invariant from *"a family in a kit is fully in R2"* to *"a family in a kit
  is drawable in this shop's languages at the weights it binds"* — and that
  reintroduces exactly the per-weight, per-subset presence question §2b set out
  to kill, now on the export gate. The alternative is accepting a spinner of up
  to ~8s on a font change. Both are defensible; one of them has to be chosen
  before B1 ships, because a picker that offers families the render path cannot
  load is the failure this whole document exists to prevent.

- **Google's version moves and the plan's examples are already stale.** Cairo
  was `v28` when the earlier draft of this note was written and is `v31` today.
  That is the argument for §1 rather than a problem with it, but it means no
  version string in this document should be read as current.

- **Part A is built through A3 and `/brand` has been rendered against it.**
  The migration is applied, the ten families are mirrored, and the page serves
  670 `@font-face` rules with **zero references to `gstatic` or
  `fonts.googleapis.com`** — every byte from R2. What has *not* been done is
  looking at it with human eyes: this was verified by fetching the HTML and
  reading it, so nothing has confirmed the faces actually paint correctly, only
  that they are declared and served. The parity in §1 also remains measured in a
  harness rather than through the app.

- **A4's substrate is built and its property is proven; the consumers do not
  exist.** `fonts:check` renders all ten families to PDF through real Chromium
  with DNS blackholed, and every one embeds a subset font program (7–11 kB out of
  a ~90 kB face), draws as text, and rasterizes nothing. That is §1's claim
  demonstrated rather than argued. But `pdf.worker.ts` is still a stub and the
  HarfBuzz measurer is still E14 Phase 2 — **nothing in the product exports a PDF
  yet**, so what is proven is that the bytes are correct and loadable, not that a
  shipping export uses them.

---

## 9. Related

- `docs/E14-phase-0-findings.md` §0.1 — the measurement parity this rests on
- `docs/E14-progress.md` — "the brand-kit fonts are still not mirrored to R2"
- `docs/E4-brand-setup.md`, `docs/E4-pending.md` — the picker and the kit
- `docs/E9-output-formats-export.md` — the export path that needs the files
- `docs/block-library-from-r2.md` — the same shape of pipeline, already built
- `.claude/skills/souqstudio-design/references/brand-kit-fonts.md` — needs
  updating for §3; it currently describes three slots and a curated list
