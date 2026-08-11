# Export pipeline

One canvas, two export paths. Images leave from the browser instantly. PDFs go through
the worker as vector.

```
FABRIC.JS CANVAS
      │
      ├── canvas.toDataURL()  ──→  PNG / JPG        client-side, instant
      │                             ├── Instagram post   1080 × 1080
      │                             ├── Instagram story  1080 × 1920
      │                             └── WhatsApp image     800 × 800
      │
      └── canvas.toSVG()  ──→  worker  ──→  Playwright  ──→  PDF
                                                 ├── Digital leaflet  A4 landscape
                                                 ├── Multi-page catalog  A4 portrait
                                                 ├── A3 poster
                                                 └── Print-ready (CMYK, bleed, marks)
```

---

## Why SVG is the bridge

The alternatives were rejected for concrete reasons:

- **html2canvas** rasterises. Text stops being text, becomes pixels, and pixelates when
  printed at A3.
- **A parallel server-side HTML template** means two renderers that drift. The owner
  designs against one and prints from the other.
- **react-pdf** is a PDF *viewer* wrapping PDF.js, not a generator. It was proposed
  early and is wrong for this.

SVG keeps everything vector. Text stays selectable and searchable in the output, and
scales to A3 or a roll-up banner without loss. What the owner saw is what prints,
because it is literally the same document.

---

## Image export — client side

The canvas is set to the target output dimensions internally. Do not design at 400×400
and scale up on export — that is where blurry output comes from.

```typescript
// Canvas is already 1080×1080 for an Instagram post
const dataUrl = canvas.toDataURL({ format: 'png' })
```

WhatsApp exports as JPG at 90% quality. WhatsApp recompresses regardless, so shipping a
larger PNG only costs the shop upload time on a poor connection.

No server round trip. The download is immediate.

---

## PDF export — worker side

```
1. Client POSTs to /api/v1/export/pdf with { offerBookId, format, printReady }
2. Route writes an export_jobs row, enqueues, returns { jobId }
3. Worker loads canvas state, produces SVG per page
4. Each SVG is wrapped in a minimal HTML shell:
     <html><body style="margin:0">{svg}</body></html>
5. Playwright (from the warm pool) renders it
6. page.pdf({ width, height, printBackground: true })
7. Multi-page: render each, then merge
8. Print-ready: Ghostscript post-process for CMYK, bleed, crop marks
9. Upload to R2, write a 24-hour signed URL to the job row
10. Client polls, gets the URL, downloads
```

---

## Browser pool

Mandatory. `generic-pool`, min 2, max 10 warm Playwright instances.

Warm render is roughly 3ms. Launching a browser per request costs 400–600ms every time —
that is the difference between the 5-second single-page target and missing it on every
request.

```typescript
const browser = await pool.acquire()
try {
  const page = await browser.newPage()
  await page.setContent(html)
  const pdf = await page.pdf({ width: '210mm', height: '297mm', printBackground: true })
  await page.close()
  return pdf
} finally {
  await pool.release(browser)
}
```

Always release in a `finally`. A leaked browser is a permanently lost pool slot.

---

## Fonts

The worker has **no access to `fonts.googleapis.com`** and must not depend on external
network on a critical path. Brand kit fonts are mirrored into R2 and referenced from the
HTML shell as embedded `@font-face` with the real font file.

PDF embedding needs the actual font file, not a CSS link. A missing font silently falls
back and the output does not match what the owner designed.

---

## Print-ready specifics

| Requirement | Value |
| --- | --- |
| Raster resolution | 300 DPI minimum for product photos |
| Colour | CMYK, converted post-render |
| Bleed | 3mm all sides |
| Crop marks | Corner marks for cutting |
| Fonts | Embedded, subset |
| Compliance target | PDF/X-1a |

**Effects rasterise.** Blur, drop shadow and blend modes force the renderer to produce
pixels. Print exports apply a print-safe filter that removes or simplifies them before
rendering. Product photos inside the SVG remain raster and that is fine — everything
else (text, badges, borders, brand colours, layout) stays vector.

**Status:** the Ghostscript CMYK step is specified but not implemented or benchmarked.
The 60-second target is an estimate, not a measurement.

---

## Format reference

| Format | Dimensions | Path | Epic priority |
| --- | --- | --- | --- |
| Instagram post | 1080 × 1080 | client | MVP |
| Instagram story | 1080 × 1920 | client | MVP |
| WhatsApp image | 800 × 800 | client | MVP |
| Digital leaflet | A4 landscape | worker | MVP |
| Multi-page catalog | A4 portrait, ≤20 pages | worker | MVP |
| A3 poster | 297 × 420mm | worker | V2 |
| Print-ready | any + 3mm bleed | worker | V2 |

Story format only works with the Story Strip grid — grid/format compatibility is
declared in the grid config, not hardcoded. See E7.

---

## Canvas parity

Both the offer book editor and the card designer produce SVG through the same path. They
must use identical padding, zoom controls, selection outline and handle treatment. See
"Design surfaces" in the design skill — divergence here makes the product feel assembled
from parts.
