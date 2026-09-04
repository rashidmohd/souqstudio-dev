# apps/worker

Standalone Node.js process. BullMQ job workers. Runs separately from Next.js.
This is not a web server. It has no HTTP routes. It only processes jobs from Redis queues.

---

## Why a separate process

Next.js serverless functions have execution time limits and are not suitable for:
- Playwright PDF generation (needs a persistent warm browser pool)
- AI image generation (can take 10–60 seconds)
- Nightly catalog enrichment batches (runs for minutes)
- Playwright must not run inside Next.js — it needs a persistent process

The worker process runs on Railway (or any always-on Node.js host).
Next.js API routes add jobs to the queue. This process consumes them.

---

## Directory structure

```
apps/worker/
├── src/
│   ├── index.ts              # Entry point — starts all workers
│   ├── lib/
│   │   ├── env.ts            # Zod-validated env vars
│   │   ├── redis.ts          # Upstash Redis connection
│   │   ├── playwright.ts     # Warm browser pool (generic-pool)
│   │   └── r2.ts             # Cloudflare R2 client
│   ├── workers/
│   │   ├── pdf.worker.ts     # PDF generation (Playwright)
│   │   ├── ai.worker.ts      # AI character + cover generation
│   │   ├── bg.worker.ts      # Background removal (calls Rembg microservice)
│   │   ├── email.worker.ts   # Email sending (Resend)
│   │   └── enrich.worker.ts  # Nightly catalog metadata enrichment (Claude API)
│   └── jobs/
│       ├── pdf.job.ts        # Job type definitions + handlers
│       ├── ai.job.ts
│       ├── bg.job.ts
│       ├── email.job.ts
│       └── enrich.job.ts
└── package.json
```

---

## Job types

| Queue | Job type | Payload |
|---|---|---|
| `pdf` | `pdf.render` | `{ offerBookId, format, printReady }` |
| `ai` | `ai.character` | `{ shopId, uniformImageUrl, nationality, gender, style }` |
| `ai` | `ai.pose` | `{ characterId, poseType }` |
| `ai` | `ai.cover` | `{ shopId, offerBookId, campaignType }` |
| `bg` | `bg.remove` | `{ imageUrl, targetPath }` |
| `email` | `email.send` | `{ template, to, props }` |
| `enrich` | `catalog.enrich` | `{ catalogProductId }` |

---

## PDF worker rules (critical)

- Playwright browser pool: min 2, max 10 warm instances. Managed by `generic-pool`.
- Never launch a browser per request. Always acquire from the pool.
- PDF flow:
  1. Compose each page with the layout engine — offers plus the book's template, with
     `offer_book_pages.slotOverrides` applied — then serialise to SVG. `canvas_state` is
     gone: E6 v2 made the engine the source of a page, not a stored Fabric dump. **The
     engine is the same implementation the editor runs**, shared from `packages/`; two
     would drift and drift here means the PDF does not match the screen.
  2. Wrap each SVG in a minimal HTML shell: `<html><body style="margin:0">{svg}</body></html>`
  3. `page.setContent(html)`
  4. `page.pdf({ width, height, printBackground: true })`
  5. For multi-page: render each SVG separately, merge pages
  6. For print-ready: post-process with Ghostscript for CMYK + bleed + crop marks
  7. Upload to R2, write signed URL to `export_jobs` table
  8. Update job status to `complete`
- Fonts must be self-hosted — worker has no access to fonts.googleapis.com
  Mount font files from R2 or embed in the HTML shell
- Performance targets:
  - Single page: < 5 seconds
  - 10-page catalog: < 30 seconds
  - Print-ready: < 60 seconds

---

## AI worker rules

- API keys (OpenAI, Anthropic) are server-side only. Never in Next.js client code.
- Deduct credits on job completion, never on queue.
- Refund credits automatically on job failure.
- Write to `ai_jobs` table: status transitions `queued → processing → complete/failed`.
- Rembg calls: POST to `REMBG_SERVICE_URL` with image URL or base64. It returns a PNG.
- Character consistency across poses: use ControlNet reference image (base character URL).
- Store all generated images in R2 under `/{orgId}/{shopId}/characters/`.

---

## Email worker rules

- All emails go through the queue. Never send synchronously from an API route.
- Template is identified by name string. Worker imports the React Email component
  from `packages/email` and renders it to HTML before sending via Resend.
- If Resend returns a non-2xx, retry up to 3 times with exponential backoff.
- Log delivery status to `notification_log` table.

---

## Enrich worker rules

- Runs nightly via BullMQ cron: `0 2 * * *` (2am UTC)
- Fetches products where `enriched_at IS NULL` in batches of 50
- Calls Claude API to generate synonyms in Arabic, Hindi, Urdu + tags
- Writes results to `product_synonyms` and updates `catalog_products.tags`
- Retries failed enrichments up to 3 times, then flags for manual review
- Never blocks the main queue — runs on a separate low-priority worker

---

## Error handling

- All workers catch errors and write `status: 'failed'` + `error_message` to the job table
- BullMQ default retry: 3 attempts with exponential backoff
- Dead letter queue: jobs that exhaust retries move to `{queue}-failed` queue
- Monitor failed queues via Bull Board (internal admin panel, not public)

---

## Deployment

Full procedure: `docs/deployment-railway.md`. Service config: `railway/worker.json`.

- Runs on Railway as an always-on Node.js service
- Not a Vercel function — must never be deployed to Vercel
- Single process starts all workers in parallel
- Graceful shutdown: drain queues before exit (handle `SIGTERM`)
- Health check: a minimal HTTP server returning `{ status: 'ok', workers: [...] }`, bound
  to `env.PORT` — Railway assigns it, 3001 locally
- **One replica.** The enrich worker runs on a BullMQ cron; a second container would run
  the nightly batch twice.

### `start` is `tsx src/index.ts`, not `node dist/index.js`

Do not "fix" this back. The shared packages publish `main: src/index.ts`, so compiled
output emits `require("@souqstudio/db")` and Node cannot load the `.ts` file behind it.
The Next.js apps escape this because their bundler transpiles workspace sources; a plain
Node process has no bundler. Reasoning and the alternatives are in
`docs/deployment-railway.md`.

`build` is `tsc --noEmit` for the same reason — it type-checks and emits nothing, because
a `dist/` that looks runnable and is not is worse than no `dist/` at all.
