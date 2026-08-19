# E4 — Brand Setup

## Overview

Brand setup is the foundational step that makes every offer book feel unique to each shop. Done once, applied everywhere. Shop owners set their logo, colors, grid preference, and template — and every offer book they create is automatically on-brand from that point forward.

**Priority:** MVP

---

## The Brand Kit

Everything saved under Brand Setup lives in the **Brand Kit** — a per-shop configuration that drives the entire visual output of the editor.

```
Brand Kit
├── Logo (background-removed PNG)
├── Brand Colors
│   ├── Primary
│   ├── Secondary
│   └── Accent
├── Grid Style preference
├── Template preference
├── Font (auto-selected or manual)
└── Character Library (populated by E8 — AI Features)
```

---

## Features

### E4-01 Logo Upload & Background Removal

- Accepts PNG, JPG, SVG, WebP — max 10MB
- Background removal runs automatically on upload (Rembg)
- Preview shows logo on white and dark backgrounds
- User can re-upload if result is unsatisfactory
- Transparent PNG stored in Cloudflare R2
- Logo used in: offer book header, footer, cover page, brand kit thumbnail

### E4-02 Auto Color Extraction & Brand Colors

- On logo upload: extract 3–5 dominant colors using color quantization
- Suggest them as Primary, Secondary, Accent
- Live preview — entire editor UI theme updates instantly as colors change
- Manual override via color picker (hex input + visual picker)
- Contrast check — warn if primary + white text fails WCAG AA (important for price readability)
- Colors stored as hex values in brand kit

### E4-03 Grid Style Selection

5 grid options shown as visual previews with sample products:

| Grid | Structure | Best For |
|---|---|---|
| 2×2 | 4 equal cells | Small weekly offers |
| Hero + Grid | 1 large + 3 small | Featured product campaigns |
| 3×2 | 6 equal cells | Grocery / FMCG promotions |
| Story Strip | 4 horizontal | Instagram Story / banner |
| Sidebar | 1 tall left + 2 right | Premium / lifestyle |

Each grid option previewed in the user's brand colors. Selection saved as default but overridable per offer book.

### E4-04 Template Selection

5 templates shown in the user's actual brand colors:

| Template | Style | Best For |
|---|---|---|
| Clean & Minimal | White bg, subtle shadows | Pharmacy, premium grocery |
| Bold & Sale | Bright colors, big badges | Electronics, promotions |
| Premium | Dark bg, gold accents | Luxury, lifestyle retail |
| Festive | Seasonal patterns, borders | Eid, Diwali, National Day |
| Supermarket | Dense, price-forward | Hypermarkets, bulk retail |

Template previewed with real sample products and the user's brand colors. Selection saved as default but overridable per offer book.

### E4-05 Brand Kit Management

**View Brand Kit**
- Dashboard card showing logo, color swatches, grid, template, character (if created)

**Edit Brand Kit**
- Any element editable at any time from settings
- Changes apply to new offer books only — existing published offer books unaffected

**Shop-Level Override**
- Each shop inherits organization brand kit by default
- Shop can override: logo only / colors only / full override
- Override level set in shop settings (E2)

**Reset to Organization Defaults**
- Available if shop has overridden brand kit
- One-click restore to org-level settings

---

## Build status

**Built.** E4-01 to E4-04 are reached through the E1-04 setup wizard; E4-05 is
the brand kit screen at `/brand`.

Three notes on what E4-05 actually shipped:

- **The shop-level override was already built, by E2-05** — `shops.brandOverride`,
  the resolution rule in `lib/brand-inheritance.ts`, and the owner-only control
  in `components/shop/BrandOverrideField.tsx` on shop settings. An earlier
  version of this section claimed otherwise. `/brand` shows where each facet
  resolved from and links across to that control; it deliberately does not offer
  a second one.
- **"Reset to organization defaults" is destructive**, and is the half E2
  deliberately left here. Switching a shop back to `inherit` on shop settings is
  the reversible version — the shop's own kit stays and stops being read.
  `POST /api/v1/brand/reset` deletes it. The two writes cannot be split: because
  `resolveBrandKit` is facet-level with no per-field fallback, a cleared kit on a
  shop still set to `full` resolves to *no brand at all*, so the reset sets
  `brandOverride` back to `inherit` in the same statement.
- **The dashboard card is the top of `/brand`**, not a card on home. Home is the
  offer books list, deliberately — there is no dashboard to put it on.

Not built, and out of scope for E4-05:

- **Fonts.** `BrandKit` carries `fontDisplay`, `fontPrice` and `fontBody`, and in
  `lib/brand-inheritance.ts` they sit in the `layout` facet, but nothing reads or
  writes them and there is no picker. A real one needs the curated OFL families
  mirrored and subsetted into R2 first — see `souqstudio-design →
  references/brand-kit-fonts.md`. There is no placeholder section on `/brand`.
- **Character library.** E8, unbuilt, so it is absent from the kit card rather
  than shown empty.

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Brand setup flow uses step-based layout with live preview panel on the right (desktop) or below (mobile)
- Color extraction result shown as clickable swatches — user taps to assign to Primary / Secondary / Accent
- Live preview updates via Zustand brand store — no API call needed for preview rendering
- ~~Grid and template previews rendered as mini Fabric.js canvases with sample data~~
  **Deviation, deliberate:** the previews are inline SVG
  (`components/brand/OfferPreview.tsx`), not Fabric canvases. Fabric plus its
  font loading and ten canvas contexts would land in the onboarding bundle —
  the flow the whole product depends on for a first impression, on a mid-range
  Android over 4G. SVG paints immediately and scales to any box.

  This note still holds for the **admin template builder** in E7, where fidelity
  to the artboard is the point and the audience is internal.

  The risk it accepts is a second renderer drifting from the artboard. It is
  contained by reading the same `GridConfig` cell fractions and `TemplateConfig`
  the editor will, and by showing only layout and colour — which is the entire
  decision on those two steps.

---

## Backend Notes

- Background removal: Rembg running as a microservice or via Sharp + custom model
- Color extraction: run server-side using `sharp` + `node-vibrant` or `colorthief`
- Brand kit stored as JSONB in `shops` table — no separate table needed
- Logo stored in Cloudflare R2 under `/{org_id}/{shop_id}/logo.png`
- Color contrast check run server-side and returned with extraction result

---

## Database Tables

```
shops (brand_kit JSONB field)
organizations (logo_url, brand_kit JSONB for org-level defaults)
```

---

## Out of Scope

- Custom fonts upload (use curated font list for now)
- Brand guidelines enforcement (e.g. block certain color combinations)
- Brand kit sharing across organizations
