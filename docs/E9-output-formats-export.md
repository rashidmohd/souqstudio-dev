# E9 — Output Formats & Export

## Overview

The same offer book exports to multiple formats without redesigning. The canvas adapts to each format's dimensions, and the export pipeline produces the correct file type. Social images are generated client-side; PDFs are generated server-side via Playwright.

**Priority:** MVP (core formats), V2 (print-ready PDF)

---

## Export Architecture

```
FABRIC.JS CANVAS
      │
      ├── toDataURL() ──────────────────→ PNG/JPG
      │   (client-side, instant)            │
      │                                     ├── Instagram Post
      │                                     ├── Instagram Story
      │                                     └── WhatsApp Image
      │
      └── toSVG() ──→ Node.js backend ──→ Playwright ──→ PDF
          (server-side)                                    │
                                                           ├── Digital PDF
                                                           ├── Multi-page Catalog
                                                           └── Print-Ready PDF
```

**Why SVG as the bridge layer:**
- SVG is vector — text stays sharp at any print size
- One source of truth — editor output = PDF output (no drift)
- Text remains selectable in PDF
- Scales to A3, roll-up banners without quality loss

---

## Output Formats

### E9-01 Instagram Post (1080 × 1080px)

- Square format, RGB color
- Fabric.js canvas set to 1080×1080 internally
- Export: `canvas.toDataURL('image/png')` at 1x (already at target resolution)
- Download as PNG
- Also used for WhatsApp feed sharing
- **Priority:** MVP

### E9-02 Instagram Story (1080 × 1920px)

- Portrait format, RGB color
- Story Strip grid only (defined in E7 grid config)
- Export: `canvas.toDataURL('image/png')`
- Download as PNG
- Also used for WhatsApp Status
- **Priority:** MVP

### E9-03 WhatsApp Image (800 × 800px)

- Square format, RGB, optimized for WhatsApp compression
- Exported at 800×800 but with content scaled for WhatsApp's compression algorithm
- Download as JPG (90% quality — WhatsApp recompresses anyway)
- **Priority:** MVP

### E9-04 Digital Leaflet — A4 Landscape

- A4 landscape dimensions (297 × 210mm at 96dpi for screen)
- Single page
- SVG → Playwright → PDF pipeline
- PDF optimized for screen viewing (RGB, compressed)
- Download as PDF
- **Priority:** MVP

### E9-05 Multi-Page Catalog — A4 Portrait

- A4 portrait (210 × 297mm)
- Multiple pages (up to 20)
- Each page is a separate Fabric.js canvas → separate SVG
- All SVGs sent to backend → Playwright renders each → pages merged into single PDF
- Download as PDF + generates shareable link
- **Priority:** MVP

### E9-06 A3 Poster

- A3 (297 × 420mm)
- Single page, large format grid
- SVG → Playwright → PDF
- Suitable for in-store display / shop window
- **Priority:** V2

### E9-07 Print-Ready PDF

Upgraded version of any PDF format with professional print specifications.

- **Resolution:** All raster elements (product photos) at 300 DPI
- **Color:** CMYK color profile (converted from RGB post-render)
- **Bleed:** 3mm on all sides
- **Crop marks:** Corner marks for professional cutting
- **Font embedding:** All fonts embedded in PDF
- **Compliance:** PDF/X-1a for commercial print houses

**Important constraint:** Heavy CSS effects (blur, drop shadow, blend modes) are avoided in print-ready exports — they cause rasterization. Print export applies a "print-safe" filter that removes or simplifies these effects.

- Available on Pro plan and above
- **Priority:** V2

### E9-08 SVG → Playwright PDF Pipeline

Server-side PDF generation infrastructure.

**Flow**
```
1. Client calls POST /export/pdf with { offer_book_id, format, print_ready }
2. Backend fetches canvas SVG(s) from offer book record
3. SVG(s) wrapped in HTML shell:
   <html><body style="margin:0">{svg}</body></html>
4. Playwright (warm browser pool) renders HTML
5. page.pdf({ width, height, printBackground: true })
6. For multi-page: each SVG rendered separately, pages merged
7. For print-ready: CMYK post-processing via Ghostscript
8. PDF stored in Cloudflare R2 with 24hr signed URL
9. Signed URL returned to client → download triggered
```

**Browser Pool**
- Persistent Playwright browser pool (min 2, max 10 instances)
- Pool managed by `generic-pool`
- Warm render time: ~3ms per page
- Cold start avoided by keeping min 2 instances alive

**Performance targets**
- Single page PDF: < 5 seconds end-to-end
- 10-page catalog: < 30 seconds end-to-end
- Print-ready PDF (CMYK): < 60 seconds end-to-end

---

## Format Selector UX

In the editor header, a format selector allows switching formats:

- Switching format: canvas reflows to new dimensions
- Product layout re-adapts to new grid constraints
- Warning shown if current grid is incompatible with selected format
- Last used format per shop remembered

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Export button in editor header → dropdown showing available formats
- Image exports trigger browser download directly (no server round-trip)
- PDF exports show a progress indicator while server generates
- "Generating PDF..." state with estimated time shown
- Print-ready PDF shows upgrade prompt if on Starter plan

---

## Backend Notes

- Playwright installed as a dependency: `playwright` + `chromium`
- Browser pool initialized on server start
- PDF jobs queued via BullMQ for multi-page catalogs (async)
- Single-page PDFs handled synchronously (fast enough)
- Ghostscript used for CMYK conversion on print-ready exports
- R2 signed URLs expire in 24 hours — regenerate on demand if expired

---

## Database Tables

```
export_jobs
  id, offer_book_id, format, status, file_url,
  print_ready BOOLEAN, created_at, completed_at
```

---

## Out of Scope

- Video / animated GIF export
- HTML embed code (interactive web version) — V3
- Roll-up banner format (850×2000mm) — V3
- Direct upload to Google Drive / Dropbox — V3
