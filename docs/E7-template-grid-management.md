# E7 — Template & Grid Management

## Overview

An internal admin capability that allows the SouqStudio team to create, manage, and publish templates and grid layouts without developer involvement. This is what enables fast seasonal content — a Ramadan template can be built, scheduled, and published without a deployment.

**Priority:** MVP (admin tooling), V3 (shop owner custom templates)

---

## Two Levels

**Level 1 — Admin Managed (MVP)**
SouqStudio team builds and publishes templates and grids. Shop owners choose from what is published.

**Level 2 — Shop Owner Custom (V3)**
Power users save modified templates as custom presets. Not in scope for MVP.

---

## Features

### E7-01 Template Admin

**Create Template**
- Template name and internal description
- Background: solid color / gradient / pattern / image
- Typography: heading font, body font, size hierarchy
- Price tag style: shape (rectangle, circle, starburst), color, position (top-right, bottom-left etc.)
- Discount badge style: shape, color, font, size
- Border and shadow style
- Header layout (logo left / center / right, with or without shop name)
- Footer layout (address / phone / logo combinations)
- Color zones: define where Primary / Secondary / Accent brand color applies
- Preview with sample products and brand color injection

**Edit Template**
- All fields editable
- Changes apply to new offer books only — existing published offer books using this template are unaffected

**Duplicate Template**
- Clone as starting point for a new template
- Useful for creating seasonal variant of an existing template

**Publish / Unpublish**
- Published: visible to all eligible shop owners in template selector
- Unpublished: hidden from shop owners, editable by admin

**Plan Gating**
- Set template availability by plan: All / Pro+ / Business+ / Enterprise only
- Locked templates shown with padlock in shop owner UI with upgrade prompt

**Archive**
- Retired templates hidden from new offer books
- Existing offer books using archived template are unaffected

**Version History**
- Each save creates a version record
- Admin can view and restore previous versions

### E7-02 Grid Admin

**Create Grid**
- Grid name and internal description
- Define column count (1–6) and row count (1–6)
- Set cell size ratios (equal / hero-left / hero-top / sidebar)
- Define which cells are mergeable
- Define hero cell positions (which cells can be featured/highlighted)
- Set minimum and maximum products per grid
- Map grid to compatible output formats (some grids only work on Story, not A4)

**Edit Grid**
- All fields editable
- Published grids editable — changes apply to new offer books

**Publish / Unpublish**
- Same pattern as templates

**Preview Grid**
- Preview with sample products at each compatible output format size

### E7-03 Festive & Seasonal Management

**Create Seasonal Variant**
- Based on an existing template
- Add overlay assets: patterns, borders, icons, decorative elements
- Asset library: Ramadan crescents, Eid lanterns, Diwali lamps, Christmas elements, UAE National Day motifs
- Overlay opacity and positioning configurable

**Schedule Activation**
- Set active date range (e.g. 15 Mar – 20 Apr for Ramadan 2026)
- During active period: seasonal template appears at top of template selector with "Seasonal" badge
- Outside active period: hidden automatically
- Schedule in advance — set next year's Eid template now

**Manage Asset Library**
- Upload seasonal overlay assets (SVG preferred for scalability)
- Tag by occasion and region
- Assets reusable across multiple seasonal templates

### E7-04 Output Format Mapping

Each template and grid must declare compatible output formats:

| Format | Notes |
|---|---|
| Instagram Post (1080×1080) | Most grids compatible |
| Instagram Story (1080×1920) | Story Strip grid only |
| WhatsApp (800×800) | Most grids compatible |
| A4 Portrait | Multi-page catalog grids |
| A4 Landscape | Digital leaflet |
| A3 Poster | Large format grids only |

Templates auto-adapt typography scale and element sizing per format — defined in template config, not hardcoded.

### E7-05 Shop Owner Custom Templates (V3)

- Modify an existing template's colors within brand kit constraints
- Save as "My Template" — visible only to that organization
- Duplicate and customize further
- Share custom template across shops in same organization
- Cannot share custom templates with other organizations

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Admin template builder uses a visual form with live preview panel
- Preview panel renders a mini Fabric.js canvas with sample products
- Template config stored as structured JSON — no freeform CSS
- Seasonal template calendar view shows scheduled activations on a timeline

---

## Backend Notes

- Templates and grids stored as JSONB config in `templates` and `grids` tables
- Seasonal schedule checked at render time — active template list computed dynamically
- Plan gating checked against organization's current plan on template list endpoint
- Template versioning: each edit creates a row in `template_versions` table

---

## Database Tables

```
templates
  id, name, description, config JSONB, status,
  plan_tier, is_seasonal, active_from, active_to,
  created_at, updated_at

template_versions
  id, template_id, config JSONB, created_at

grids
  id, name, config JSONB, compatible_formats TEXT[],
  min_products, max_products, status

seasonal_assets
  id, name, occasion, url, type (SVG/PNG)
```

---

## Out of Scope

- Shop owner can build template from scratch (not just customize)
- Template marketplace (sell/share between organizations)
- AI-generated templates

---

## Addendum — The template grammar moved to E6

E6 v2 replaced free canvas composition with a layout engine, and the engine places into a
**template grammar** that is now specified as `OfferTemplate` in `@souqstudio/types`:
page types, a grid of spanning slots, slot groups with tinted surfaces, and density
profiles. Read `docs/E6-offer-book-editor.md` §2 and §5 before touching E7-01 or E7-02.

What that changes here:

- **E7-01 and E7-02 merge in substance.** A grid is no longer a separate row that a
  template is paired with — it is `PageType.grid` inside the template. The `grids` table
  and the five seeded presets survive because E4's setup wizard offers them, but the admin
  builder should target `OfferTemplate` and not grow new capability on the old shape.
- **The price mark is not a template field any more.** E7-01 lists "price tag style" and
  "discount badge style" as template config. Those are now the `PriceMark` component plus
  org-scoped `promo_tiers` — one authoring control, `tierId`, and everything else derived.
  See E6 §3. Template config sets shape and rotation bounds; it does not compose a price.
- **Colour zones become tokens.** `surfaceToken`, `borderToken` and `tokenRef` are
  design-system token names. The builder must never write a hex into template config.
- **A new page type per campaign shape.** Priceless campaign pages, cross-sell pages and
  covers are page *types* in the grammar, not styling flags on an offer grid.
- **Migration is E7's.** `templates.config` still holds the E4 `TemplateConfig` shape.
  Moving the seeded presets onto `OfferTemplate` is this epic's work, and `offer_books`
  already carries `templateId` pointing at the same table, so the seam is the config
  column alone.

E7-03 (seasonal) and E7-04 (format mapping) are unaffected in substance. Format mapping
now lives on the template's page types rather than on a separate `grids` row.

---

## Addendum — Card designer surface

The design system defines a **card designer** as its own layout family, distinct from
both this epic's admin template builder and from the offer book editor (E6).

Route: `apps/web/app/(dashboard)/card-designer/[templateId]`

It is where a shop builds the offer card that every product pours into — one card on a
canvas, no page grid, no product selection, no pagination. Three panes: component
palette (start), card canvas (centre), properties (end).

Requirements that are not yet specified as sub-features above:

- **Bound vs static components** must be distinguishable at a glance, marked in three
  places: canvas outline, layer list indicator, palette grouping.
- **Bound components render sample data**, never field names.
- **Stress preview** — a persistent, always-visible panel rendering the card under
  worst-case catalog data at the same scale as the canvas.
- **Overflow policy per bound component** — shrink-to-fit with a floor, clamp to N
  lines, or truncate. A first-class control in the properties panel.
- **Template language binding** — set at creation. Direction is a segmented control in
  the designer chrome, defaulting from that language. Numerals are never affected.

Full specification: "Design surfaces" in `.claude/skills/souqstudio-design/SKILL.md`.
This addendum needs expanding into proper sub-features (E7-06 onward) before build.
