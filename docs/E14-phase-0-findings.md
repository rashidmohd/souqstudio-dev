# E14 Phase 0 — the three risky things, answered

The gate in `docs/E14-implementation-plan.md`. Three questions, none of which
ships a feature, all of which decide whether the rest is buildable.

**All three are answered and the gate is passed.** 0.1 came out better than the
plan expected — there is a measurer, so the fallback of shipping numbers from
the server is not needed. 0.2 came out worse than it looks — the nesting
expresses every case, but only through a magic number that rots. 0.3 reproduced
§2.4 and corrected one row of it.

---

## 0.1 Text measurement parity — **a measurer exists**

### What was measured

Every string in the catalog that a `hug` would ever measure: **20,492 catalog
rows → 20,501 distinct Latin strings and 15,576 Arabic**, taken from `nameEn`,
`nameAr`, `specEn`, `specAr`, `brandEn`, `brandAr`, `originEn`, `originAr`.
Against **all 31 face-and-weight combinations** the brand-kit catalog ships
(`apps/web/lib/brand-fonts.ts`), with the real font files pulled from Google
Fonts — 1.1 million measurements per measurer.

Four measurers, compared against Chromium's canvas as ground truth, because
Chromium is what Playwright drives and therefore what the PDF will agree with.

### The distribution, not the mean

Relative disagreement against Chromium's canvas. The number that matters is the
tail, because the tail is what moves a box.

| Measurer | Latin p50 / p99 / max | Arabic p50 / p99 / max |
| --- | --- | --- |
| `estimateWidth` — today's | 4.0–21.8% / 22.3–39.4% / 41–121% | 4.8–39.0% / 23.0–71.5% / 42–104% |
| Font metrics, no shaping (`hmtx` sum) | 0.0–0.4% / 0.0–2.7% / 13–66% | 19.3–99.2% / 36.8–166.9% / 64–278% |
| HarfBuzz, whole string | 0.00% / 0.00–0.69% / 13–66% | 0.00% / 0.00–0.29% / 15–25% |
| **HarfBuzz, word-segmented** | **0.000% / 0.000% / 0.000%** | **0.000% / 0.000% / 0.000–1.82%** |

**`estimateWidth` is not off by a little.** It is off by 5–40% at the *median*.
The plan says it "already disagrees" and that today that costs a slightly wrong
wrap; what it actually costs is that no `hug` built on it could be trusted at
any tolerance. That is settled and it is not a close call.

**Font metrics without a shaper are worse than the estimator on Arabic.** Summing
isolated advance widths ignores joining, so `ليز` measures 183 units against
Chromium's 87 — 110% wrong. Reem Kufi, which ligates heavily, runs at 97–99%
disagreement at the *median*. Any Node-side measurer that opens a font file and
adds up glyph widths is this row, and it fails.

**HarfBuzz matches Chromium exactly**, once two things are itemized correctly.

### The two itemization rules, both of which were found by measuring

**Shape word by word, not string by string.** Chromium's canvas caches shaped
words, so a kern pair straddling a space is never applied. HarfBuzz shaping the
whole run applies it, and comes out narrower. On Rubik that is a 0.12% median
and a 1.44% tail — small, systematic, and exactly the size of defect that ships
as *"the preview differs from the PDF by a hair"*. Shaping each whitespace-
delimited run separately and summing takes Rubik from p99 0.671% / max 1.440%
to **0.000% at every quantile including max**, over 3,000 strings.

**Itemize by bidi run.** The entire residual Arabic tail is mixed-direction
tokens — `برنجلز Xاكس لارج` at 1.76%, `X2400-B5` at 0.57%. Chromium splits a
string into directional runs and shapes each; a measurer that guesses one
direction for a token containing both scripts does not. **This repository
already has the module for it** — `direction.ts` and `placeText` exist because
every Arabic pack label printed backwards, and the same itemization that fixes
the drawing fixes the measuring.

With both rules, the worst disagreement anywhere across 1.1M measurements is
**0.000% on Latin and a residual on two mixed-direction strings**.

### The decision

**Build the measurer. Do not ship numbers from the server.**

`TextMeasurer` gains a HarfBuzz-backed implementation, `harfbuzzjs` (wasm),
which runs **identically in Node and in the browser because it is the same
wasm binary**. That removes the hydration risk at its root rather than routing
around it: the server and the first client paint do not merely agree, they run
the same code over the same font bytes.

The plan's fallback — solve on the server, ship the boxes — stays available and
is still worth doing for §5.2's reason (one solve per block definition rather
than one per placement). It is now an optimisation rather than a correctness
requirement, which is a much better place for it to be.

### What this makes blocking that was not

**Self-hosted fonts.** CLAUDE.md carries this as a known gap owed to E9's
export: *"Brand kit fonts are pickable but not self-hosted… Mirroring the files
into R2 is still required before export ships."* A HarfBuzz measurer needs the
font **file**, not a CSS link, so this is now **on E14's critical path too**. It
is the one dependency Phase 2 has outside its own package.

Two smaller things fall out of the same requirement:

- **A fallback policy, declared rather than discovered.** Between 19 and 125
  strings per face are in scripts the face does not cover — Cyrillic
  (`Молочные Сосиски`), Devanagari (`वामा oil`). Chromium silently falls back to
  a system font and measures *that*; HarfBuzz returns `.notdef` and cannot. Since
  the export worker has no system fonts either, today's behaviour is already
  undefined in the PDF. This is a real hole in the catalog's assumptions that
  `hug` merely makes visible.
- **The measurer must be told the weight.** Already true and already fixed once —
  `measureText` had the bug where the weight was left out of the font shorthand —
  and every number above was collected with the weight set.

### Reproducing it

The harness is throwaway per the plan and was not moved into the repo. It is in
the session scratchpad: `corpus.ts` (read-only catalog dump), `ttf.mjs` (a
dependency-free `cmap`/`hmtx` reader), `hb2.mjs` (word-segmented HarfBuzz),
`build-page.mjs` (inlines every font as a data URI so nothing can silently fall
back) and a headless-Chrome run that measures and reports.

---

## 0.2 Grid in nested frames — **it expresses, and the weights rot**

Worked as arithmetic against the geometry a real 3-track grid gives.
`W = 1200`, 3 tracks, `gap = 24`, so `track = 384`.

**Case 1 — the plan's case: a 3-up band, one card spanning two cells.**

Expressible **exactly**, but only at weight `2 + g/t = 2.0625`. The obvious
weights `2 : 1` put the card 8 units narrow and its neighbour 8 units wide — one
third of a gap, at every gutter on the page.

**Case 2 — two rows whose spans break at different tracks.** Row 1 splits after
track 1, row 2 after track 2. Compensated independently, **both rows land on the
grid exactly** and the column edges align across rows. This is better than
feared: nested rows can hold a spanning grid, and the design does not need a
third `Layout` mode to draw the library.

**Case 4 — and here is the trap.** The compensated weight is only correct for
the gap it was authored at. Authored at `gap: 24` and then edited:

| gap | wanted | got | error |
| --- | --- | --- | --- |
| 0 | 800.0 | 808.2 | +8.2 |
| 12 | 796.0 | 800.1 | +4.1 |
| **24** | **792.0** | **792.0** | **0.0** |
| 48 | 784.0 | 775.8 | −8.2 |

An author who nudges a gutter silently un-aligns every span on the page, and
nothing reports it. That is the same class of defect as the compass: a control
that lets you say where something sits and not what happens when the parameters
change.

### The decision

**Do not add a third `Layout` mode.** Add a way to say *span*, and let the
solver do the gap arithmetic:

```ts
type Sizing =
  | { kind: 'fixed'; value: number }
  | { kind: 'hug' }
  | { kind: 'fill'; weight?: number }
  /** `span` of the parent's `tracks`. The solver computes the gap. */
  | { kind: 'fill'; tracks: number; span: number }
```

The solver resolves `t = (width − (tracks − 1) × gap) / tracks` and gives the
child `span × t + (span − 1) × gap`. That is about five lines, it is exact at
every gap, and it survives an edit to the gap because the gap is no longer baked
into an authored number.

§8's note that *"the union is shaped so that adding [grid] does not touch
`Frame`"* holds, and this is smaller than grid: `Layout` keeps two modes, and
`Frame` is untouched. **Phase 2.2 should build this**, and §5's rules gain one.

Two-dimensional grid stays deferred rather than rejected, on the same terms §8
sets. Nothing in the 83 blocks needs it; Phase 4's band is Case 1 and Phase 6
will say whether anything else is Case 2.

---

## 0.3 The export harness — **in the repo, and §2.4 needs one correction**

`pnpm --filter @souqstudio/engine export:check`, beside the gallery, on demand
rather than in CI because it needs a browser. Ten cases: the nine §2.4 tested,
plus a ringed shadow on a twelve-point burst.

The original scratch harness was gone by the time this ran, which is the whole
argument for moving it in.

```
case                  what                              expected        found           raster px       page dpi  text
  plain-shape         filled rect                       vector          vector          —               —         gone
  plain-text          text, no effects                  vector          vector          —               —         text
  opacity             opacity alone                     vector          vector          —               —         text
  text-stroke         text + stroke + paint-order       vector          vector          —               —         text
  fe-drop-shadow      feDropShadow on a shape           element-raster  element-raster  678×415 ×2      —         text
  fe-gaussian-blur    feGaussianBlur                    element-raster  element-raster  676×413 ×2      —         text
  filter-on-text      filter: drop-shadow() on text     element-raster  element-raster  714×278 ×2      —         gone
  gradient-alpha      gradient with alpha stops         page-raster     page-raster     270×210 ×2      54        text
  rings-rect          concentric rings, rounded rect    vector          vector          —               —         text
  rings-burst         concentric rings, 12-point burst  vector          vector          —               —         text
```

**Nine of ten reproduce §2.4 as written**, including the disqualifying one: a
`filter: drop-shadow()` on text emits **zero `BT` blocks and one image draw** —
the price stops being text, exactly as recorded.

### The correction

**§2.4's gradient row overstates the damage, and the ban still stands.**

Recorded as *"the whole page, 72dpi"* and called *"the worst option available"*,
which *"had it shipped, would have quietly destroyed every page carrying one."*
What current Chromium actually emits is a **PDF shading pattern — vector — plus
a page-sized soft mask** to carry the alpha. The mask is the page-sized raster,
at 54 dpi here. **The page's text survives as text**: one `BT` block, `/F4 44 Tf`,
real glyph codes.

So the gradient is resolution-limited by a mask nothing in the document can size,
which is reason enough to keep it banned on the export path. It is not the
page-destroying case. The row that genuinely disqualifies itself is
`filter-on-text`, and that one is confirmed.

**This also corrects the harness's own first attempt**, which is worth recording
because it is the same mistake in miniature: it tested whether a font was
*embedded*. A PDF can carry a font it never draws with, and `filter-on-text`
does exactly that. The harness now counts text-drawing operators in the
inflated content stream.

### §8's ring-count question, closed

> *Whether the ring count needs an authored ceiling… at 300 dpi on a large burst
> is a few hundred paths. Cheap individually, unmeasured across a 24-card page.
> Measure before deciding.*

Measured. A booklet page of **24 ringed bursts at the 300 dpi ring count** —
83 rings each, **1,992 paths** — is **274 kB, zero rasters, one second to
render**.

**No cap.** Add one when something measures worse than this, not before.

---

## What Phase 0 changes in the plan

- **0.1's fallback is not needed.** Phase 2 builds a HarfBuzz `TextMeasurer`.
  Remove "or a written decision to measure once on the server" as the expected
  outcome; keep server-side solving as §5.2's optimisation.
- **Self-hosting the brand-kit fonts moves onto E14's critical path.** It was
  E9's. Phase 2 cannot measure without the files.
- **Phase 2.2 gains `span`/`tracks` on `fill`.** Five lines, and it is what keeps
  the gap from being baked into an authored weight.
- **A font fallback policy is owed.** Between 19 and 125 catalog strings per face
  are in scripts the face does not cover, and the answer today is undefined.
- **§2.4's gradient row should be amended** in `E14-layout-frames.md` at its next
  revision, and the ring-count open question in §8 struck.
- **Phase 3.3 is partly done.** `packages/engine/src/shadow.ts` and its 15 tests
  landed here, because 0.3's ringed-shadow case needed the same expansion Phase 3
  specifies and a second copy is what that section exists to prevent.
