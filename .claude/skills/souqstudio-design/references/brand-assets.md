# Brand assets

What exists, which variant goes where.

**Nothing in this file is a design instruction.** The logo and icon were designed
elsewhere; this records where the files live and how they are used, so nobody
regenerates or approximates them.

Files live in `apps/web/public/brand/`.

---

## The mark

A blue `S` monogram with a four-pointed star counter, paired with the wordmark in
charcoal. Two colours only:

| Element | Token | Value |
| --- | --- | --- |
| Monogram | `--sq-blue` | `#143CD2` |
| Wordmark | `--sq-charcoal` | `#323232` |

Both match the token file exactly. **The `#153CD0` discrepancy is resolved** — the
source files carried it, and everything committed here has been corrected to `#143CD2`.
If a new export arrives from design tooling, check the blue before committing.

---

## Inventory

| File | Format | Use |
| --- | --- | --- |
| `logo.svg` | SVG | Full wordmark. Nav rail, onboarding, marketing. |
| `logo-mono.svg` | SVG, `currentColor` | Single colour. Inherits from CSS `color`, so it works on any ground. |
| `icon.svg` | SVG, square | Collapsed nav rail, app icon source |
| `favicon.svg` | SVG | Browser tab, modern browsers |
| `favicon.ico` | ICO, 16/32/48/64 | Legacy fallback |
| `apple-touch-icon.png` | PNG 180×180, white ground | iOS home screen |
| `icon-192.png` `icon-512.png` | PNG, transparent | PWA manifest |
| `og-default.png` | PNG 1200×630 | Default Open Graph card |
| `og-offer-book.png` | PNG 1200×630 | Fallback for a shared book with no cover |
| `email/logo-dark.png` | PNG 560×97 (@2x of 280×49) | Email header |

Rasters were generated from the SVGs with cairosvg. Regenerate rather than hand-editing
if the source mark changes.

---

## Details that matter

**The iOS icon carries a 16% safe zone and a white ground.** iOS rounds corners and does
not honour alpha — a full-bleed transparent mark gets clipped and renders on black. The
PWA icons stay full-bleed and transparent because Android applies its own mask.

**`logo-mono.svg` uses `currentColor` on every path.** Set `color` on the parent and the
whole mark follows. Use it anywhere the ground is not guaranteed light — a dark surface,
a print stylesheet, a partner context.

**The email logo is raster and must be absolute.** Email clients do not reliably render
SVG, and relative paths do not resolve in an inbox. The file is committed here as the
source of truth, but `packages/email` references it at
`https://assets.souqstudio.com/email/logo-dark.png` — **upload it to R2 at that path
before sending anything**, or every email renders with a broken image.

**The OG cards are provisional.** Logo centred on `--sq-stone-50`, no gradients or
shadows per the system. That is a safe default, not a designed card — a real one would
likely carry a tagline or product imagery. Replace when design has time.

---

## Which variant, where

| Surface | Mark |
| --- | --- |
| Nav rail, expanded | `logo.svg` |
| Nav rail, collapsed (<1024px) | `icon.svg` |
| Onboarding | `logo.svg` — the only nav-like element permitted in that flow |
| Editor / card designer | none — chrome is minimal, the artboard gets the attention |
| Email header | `email/logo-dark.png` via absolute R2 URL |
| Public viewer header | none — the shop's logo goes there, not ours |
| Public viewer footer | wordmark, small. Removable on Business and above. |
| Admin panel | `icon.svg` — the wordmark is unnecessary internally |
| Dark surfaces | `logo-mono.svg` with `color` set |

**The viewer is the shop's surface, not ours.** SouqStudio appears once, small, in the
footer. A customer receiving a WhatsApp forward should see their grocer's brand, not the
tool that made it.

---

## Open question: wordmark casing

The wordmark reads **Souqstudio** — lowercase `s` in `studio`. Every document, code
identifier and string in this repository writes **SouqStudio**, camel case.

This has not been changed anywhere, because a logo's visual treatment does not
automatically dictate prose casing and plenty of brands differ deliberately. But the two
should be reconciled before launch copy, the App Store listing, or anything with a
trademark filing attached.

The mark also carries a **®**, which implies a registered trademark. Confirm the
registration covers the territories SouqStudio operates in, and check whether the symbol
is required in the viewer footer and email templates.

---

## Typefaces

Chrome fonts load through `next/font/google` in `apps/{web,admin}/lib/fonts.ts` and are
self-hosted at build time.

| Role | Family | Weights |
| --- | --- | --- |
| `--sq-font-display` | Host Grotesk | 500, 600 |
| `--sq-font-ui` | IBM Plex Sans Arabic | 400, 500, 600 |
| `--sq-font-figure` | IBM Plex Mono | 400, 500 |

Only the weights the type scale uses. **No italic axis is loaded** — Host Grotesk ships
italics and the system forbids them, so not loading the axis makes the rule unbreakable.

These are separate from the shop owner's brand kit fonts. See `brand-kit-fonts.md`.

---

## If the source mark changes

1. Check the blue is `#143CD2`, not `#153CD0`
2. Strip Illustrator metadata — `id="Layer_*"`, `data-name`, the XML prolog
3. Replace `logo.svg` and `icon.svg`
4. Regenerate every raster from the new SVGs, do not edit PNGs by hand
5. Re-upload `email/logo-dark.png` to R2
