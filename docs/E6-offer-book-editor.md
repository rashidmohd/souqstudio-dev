# E6 — Offer Book Editor

## Overview

The editor is the core of SouqStudio. It is where shop owners build their offer books. The MVP uses a **structured grid editor** — products snap to grid cells, layout is constrained. A free-form canvas (drag anywhere) is a V3 feature. This approach ships faster and covers 90% of real shop owner needs.

**Priority:** MVP

---

## Editor Architecture

```
Zustand Store (editor state)
      │
      ├── Fabric.js Canvas (visual rendering)
      │     ├── Product cells
      │     ├── Price badges
      │     ├── Discount badges
      │     ├── Brand elements (logo, colors)
      │     └── Character / cover elements
      │
      └── Auto-save → PostgreSQL (debounced 2s)
```

The Fabric.js canvas is the single source of truth for visual output. It exports to:
- `toDataURL()` → PNG for social image formats
- `toSVG()` → SVG sent to backend → Playwright → PDF

---

## Features

### E6-01 Editor Canvas & State Management

- Editor loads with brand kit pre-applied (colors, template, grid)
- Zustand store holds: selected products, grid layout, page list, selected cell, undo stack
- Canvas re-renders reactively when store changes
- Fabric.js renders the visual output
- Auto-save every 2 seconds (debounced) — no manual save button needed
- "Saved" / "Saving..." indicator in header

**Editor Layout (Desktop)**
```
┌─────────────────────────────────────────────────────┐
│  Header: title | format selector | share | export   │
├──────────────┬──────────────────────┬───────────────┤
│              │                      │               │
│  Left Panel  │    Canvas (center)   │  Right Panel  │
│  Product     │                      │  Properties   │
│  Search &    │   [offer book grid]  │  (selected    │
│  Catalog     │                      │   product or  │
│              │                      │   cell)       │
└──────────────┴──────────────────────┴───────────────┘
```

Mobile: catalog panel slides up from bottom. Properties panel is a bottom sheet.

### E6-02 Product Selection & Grid Placement

- Left panel: product search (E5 catalog)
- Click product → placed in next available cell
- Drag product from search results → drop onto specific cell
- Each cell shows: product image, name, original price, offer price, discount badge
- Empty cell shows: "+" placeholder with "Search product" hint
- Maximum products per grid enforced by grid definition

### E6-03 Price Entry & Discount Calculation

Per product, in the right properties panel:

- Original price input (numeric, currency formatted)
- Offer price input (numeric, currency formatted)
- Discount auto-calculated and displayed:
  - Percentage: `((original - offer) / original) * 100`
  - Absolute saving: `original - offer`
- Currency defaults to AED; changeable per shop

**Badge auto-style by discount magnitude:**

| Discount | Badge Style |
|---|---|
| < 20% | "SPECIAL PRICE" — subtle styling |
| 20–49% | "GREAT OFFER" — prominent styling |
| 50%+ | "MEGA DEAL" — high-impact styling |

### E6-04 Product Controls

Per-product controls in the right properties panel when a cell is selected:

**Highlight Product**
- Enlarges the cell to span 2 grid cells (hero mode)
- Applies "Featured" or "Hot Deal" overlay badge
- Only one highlight per grid (enforced)

**Font Size Adjustment**
- Product name font size: Small / Medium / Large
- Price font size: Small / Medium / Large / XLarge
- Applied to that cell only

**Badge Text Override**
- Default: auto-calculated ("30% OFF", "Save AED 5")
- Override to: "Best Price", "New Arrival", "Clearance", "Limited Stock", or custom text
- Custom text max 20 characters

**Product Image Swap**
- Replace catalog image with custom uploaded photo
- Background removal runs on upload
- Reverts to catalog image with one click

**Remove Product**
- Removes product from cell, cell returns to empty state

### E6-05 Layout Controls

**Drag to Reorder**
- Products draggable between cells within the grid
- Uses dnd-kit for accessible drag and drop
- Visual drop target indicator on hover

**Cell Merging**
- Select two adjacent cells → merge into one wide/tall cell
- Used for hero products or section headers
- Unmerge available on merged cells

**Section Divider**
- Add a horizontal divider between rows
- Label the divider: "Fresh Produce", "Electronics", "Today's Deals" etc.
- Divider color follows brand accent color

**Banner Text**
- Add a full-width banner at top or bottom of page
- Text input + background color picker
- Examples: "Valid till Sunday only!", "While stocks last!"

**Footer**
- Toggle footer on / off per page
- Footer fields: shop name, address, phone number, logo
- Defaults pulled from shop settings

### E6-06 Undo / Redo

- Full undo / redo stack (max 50 steps)
- Keyboard shortcuts: Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
- Undo/redo buttons in editor header
- Stack cleared on page navigation

### E6-07 Multi-Page Management

For catalog format (A4 multi-page):

- Add new page
- Duplicate existing page
- Reorder pages (drag)
- Delete page (with confirmation)
- Page thumbnail strip shown below canvas
- Each page is an independent Fabric.js canvas instance

### E6-08 Auto-Save

- Debounced save: 2 seconds after last change
- Saves serialized Fabric.js JSON + product data to `offer_books` + `offer_book_products` tables
- "Saved [time]" shown in header
- On reconnect after offline: conflict resolution — last-write-wins with a "Restored from [time]" notification

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Canvas: Fabric.js — do not use React state for canvas internals, use Fabric.js object model directly
- Editor state: Zustand with Immer for immutable updates
- Drag and drop: dnd-kit (for product grid reorder, not Fabric.js drag)
- All canvas interactions (select, resize, drag within canvas) handled by Fabric.js natively
- Mobile: structured grid only — no drag-and-drop on touch for MVP

---

## Backend Notes

- Auto-save endpoint: `PATCH /offer-books/:id` — accepts partial update
- Canvas state stored as JSONB in `offer_books.canvas_state`
- Product list stored in `offer_book_products` table (normalized, for analytics queries)
- Offer book status: `draft` | `published` | `archived`

---

## Database Tables

```
offer_books
  id, shop_id, title, format, status,
  canvas_state JSONB, shareable_link, expires_at,
  created_at, updated_at

offer_book_products
  id, offer_book_id, catalog_id, original_price, offer_price,
  discount_pct, discount_abs, position, is_highlighted,
  badge_override, custom_image_url, font_size_name, font_size_price
```

---

## Out of Scope (MVP)

- Free-form canvas (drag elements anywhere) — V3
- Collaboration (multiple users editing simultaneously) — V3
- Version history / named snapshots — V3
- Comments / annotations — V3
