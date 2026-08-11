---
name: brand-kit-fonts
description: Which typefaces the brand kit picker offers, how they load, and how Fabric measures them.
---

## Brand kit fonts

**Scope exception — this section is about the shop owner's typography, not ours.** It governs which families the picker offers and how they load and measure. It says nothing about how the owner's flyer should look.

Shop owners pick their own typefaces. **Never expose the full Google Fonts library.** Most of it has no Arabic, and an owner who picks a Latin-only display face then flips to Arabic gets tofu or a silent fallback that destroys their grid.

**Store roles, not fonts.** A brand kit holds three slots — `display`, `price`, `body` — and each resolves to a validated set covering every language that shop sells in. The picker filters by the shop's languages, not by the library.

Candidate families, all OFL, all needing glyph-coverage verification before shipping:

| Family | Scripts | Role |
| --- | --- | --- |
| Cairo | EN · AR | Display, body |
| Tajawal | EN · AR | Body |
| Almarai | EN · AR | Body, dense |
| Readex Pro | EN · AR | Display |
| Rubik | EN · AR | Display |
| Changa | EN · AR | Price — narrow enough for tight cells |
| Lalezar | EN · AR | Heavy promo bursts |
| Reem Kufi | EN · AR | Display |
| Baloo Bhaijaan 2 + Baloo 2 | EN · AR · HI | Rounded, one superfamily |
| Noto Sans set | EN · AR · HI · UR | Universal fallback |

**Self-host, never fetch from `fonts.googleapis.com` at render time.** Mirror curated files into R2. The Playwright worker must not depend on external network on a critical path, PDF embedding needs the real font file, and self-hosting lets you subset to the two or three weights each role actually uses.

**Fabric.js caches text metrics at object creation.** If a webfont resolves afterwards, every bounding box is wrong — text overflows cells, centring drifts, and the exported SVG does not match what the owner saw. `await document.fonts.load()` for every family and weight in the brand kit *before* instantiating text objects, and re-measure on font change. Pair with shrink-to-fit on product names and prices, because Arabic strings routinely run longer than their English equivalents.

**Custom font upload** sits behind a higher plan with an explicit licence attestation at upload. SouqStudio embeds whatever is provided into a commercial PDF, so the liability question is identical to the image-sourcing boundary.
