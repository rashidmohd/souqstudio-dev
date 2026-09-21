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

**Measured, 21 September 2026**, running `mirrorFamily()` against Google with the
uploads discarded:

| Family | Variants | Subsets | Files | Size | Fetch |
| --- | --- | --- | --- | --- | --- |
| Lalezar | 1 | 3 | 6 | 0.33 MB | 0.5s |
| Cairo | 8 | 3 | 33 | 1.32 MB | 0.9s |
| Rubik | 14 | 6 | 99 | 4.03 MB | 1.8s |

**The file count is variants × subsets, not variants × 2.** An earlier draft of
this note said "~9 weights × 2 formats is 18 fetches"; Rubik is 99 files,
because woff2 is split per script and Rubik carries six. Three hundred families
ever chosen is closer to 600 MB than the 350 MB guessed at — still nothing, and
still cheaper than a per-weight presence check in eight call sites.

Taking every variant also makes `hasItalic` a fact read from Google's metadata
rather than a boolean typed by hand in the catalog, where it can already be
wrong.

**First-pick latency holds at under 2s** — the number the blocking save in B2
depends on. `mirror-fonts.mjs` did these sequentially, which was the 8–10s
problem; at a concurrency cap of 6 the worst family in the recommended ten is
1.8s. The measurement covers the fetch from Google only: the R2 uploads were
discarded, so a real cold pick adds 99 PUTs at the same cap and the figure to
trust for B2 is whatever A1's first real run prints.

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

### A4. The worker and the shaper read files · **M**

Manifest pinned at boot, faces read from R2 as bytes. Neither Playwright nor
HarfBuzz touches Google.

- **Exit:** export runs with outbound access to `fonts.googleapis.com` blocked
  and the PDF is byte-identical to one produced with it open.

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

## 8. What is still not true

- **A fallback policy is owed.** 19 to 125 catalog strings per face are in
  scripts the face does not cover, found by E14 Phase 0.1. Opening the library
  widens that, and it is the same decision as font loading: what is drawn when
  the chosen face cannot draw the string. It should be settled in this pass,
  not bolted on.

- **A shop that adds a language after picking its fonts breaks its own kit.**
  The coverage filter runs at pick time. An English-only shop that picks four
  Latin-only faces and later enables Arabic now holds a kit that cannot render
  its own catalog. Adding a language must re-check the four slots against the
  registry and force a re-pick on any that fail — refusing the language change
  is the wrong answer, and warning-only reproduces the tofu this design set out
  to make impossible.

- **`fonts/brand.css` is a stopgap and is known to be one.** It works at ten
  families and not at two hundred; §4 says what replaces it. A1 ships it because
  the specimen needs a stylesheet to link; B1 should not ship on top of it.

- **The upload half of a cold mirror is still unmeasured.** The fetch from
  Google is 1.8s at worst across the recommended ten, but the R2 PUTs were
  discarded in that run — 99 of them for Rubik. A1's first real run is what
  settles whether B2's blocking save is tolerable.

- **Google's version moves and the plan's examples are already stale.** Cairo
  was `v28` when the earlier draft of this note was written and is `v31` today.
  That is the argument for §1 rather than a problem with it, but it means no
  version string in this document should be read as current.

- **Nothing here has been run.** `fonts:mirror` has never executed against a
  real bucket, and the parity in §1 was measured in a harness rather than
  through the app.

---

## 9. Related

- `docs/E14-phase-0-findings.md` §0.1 — the measurement parity this rests on
- `docs/E14-progress.md` — "the brand-kit fonts are still not mirrored to R2"
- `docs/E4-brand-setup.md`, `docs/E4-pending.md` — the picker and the kit
- `docs/E9-output-formats-export.md` — the export path that needs the files
- `docs/block-library-from-r2.md` — the same shape of pipeline, already built
- `.claude/skills/souqstudio-design/references/brand-kit-fonts.md` — needs
  updating for §3; it currently describes three slots and a curated list
