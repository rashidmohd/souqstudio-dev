# Background jobs

BullMQ over Redis (Upstash). Producers live in `packages/db/src/queue-client.ts` so the
web app and the worker share one definition of every queue name and payload type.
Consumers live in `apps/worker`.

**The worker is not a web server.** It has no routes beyond a health check. It is a job
consumer that runs as an always-on process on Railway. It must never be deployed to
Vercel — Playwright needs a persistent process and a warm browser pool, and serverless
execution limits make multi-minute AI jobs impossible.

---

## Queues

| Queue | Job name | Payload | Concurrency |
| --- | --- | --- | --- |
| `pdf` | `pdf.render` | `{ offerBookId, format, printReady }` | 3 |
| `ai` | `ai.character` | `{ shopId, jobId, uniformImageUrl, nationality, gender, style }` | 2 |
| `ai` | `ai.pose` | `{ shopId, jobId, characterId, poseType }` | 2 |
| `ai` | `ai.cover` | `{ shopId, jobId, offerBookId, campaignType }` | 2 |
| `bg` | `bg.remove` | `{ imageUrl, targetPath, shopId? \| organizationId? \| catalogProductId?, sourceAssetId?, jobId? }` | 5 |
| `email` | `email.send` | `{ template, to, props }` | 5 |
| `enrich` | `catalog.enrich` | `{ catalogProductId }` | 2 |

`bg.remove` serves two callers and the payload says which. A **logo** carries `shopId`
or `organizationId`, and the worker writes the outcome onto that brand kit. A **catalog
cutout** carries `catalogProductId` and `sourceAssetId`, and the worker writes an
`image_assets` row of kind `CUTOUT` derived from the source, with `bboxTight` and a matting
`quality` score.

`bboxTight` is the trimmed content box, and the layout engine needs it: cards are scaled to
optical weight, so a cutout with 30% transparent padding renders visibly smaller than its
neighbours without it. A `quality` below the review threshold leaves `reviewState` at
`PENDING` and keeps the cutout off a printed page. **Both branches are now implemented.**

Three things about the catalog branch worth knowing before changing it:

- **`quality` is derived, not reported.** Rembg returns a PNG and no confidence at all, so
  the score is computed from the alpha channel in `src/lib/matte.ts`: it catches a matte
  that removed everything, one that removed nothing, and one with a wide soft halo. It
  cannot catch a clean-edged cutout of the wrong thing — only the E5-05 review queue does.
- **The score decays asymptotically rather than clamping to zero**, so badly haloed mattes
  still sort against each other and a reviewer can work worst-first. A linear score gave
  every bad matte the same 0.
- **The canvas is never trimmed and never resized.** `bboxTight` is recorded in the
  cutout's own pixels, so any resize silently invalidates it. The handler also refuses a
  job whose `targetPath` equals its source key — writing a cutout over its own original
  leaves the ORIGINAL row pointing at a cutout with nothing left to re-run against.

AI concurrency is deliberately low. These call external image models with their own rate
limits, and each job holds memory for the duration.

---

## Job lifecycle

Every long-running operation writes a row before it queues, so the client always has
something to poll:

```
Route validates input
      ↓
Check credit balance — reject early if insufficient
      ↓
INSERT ai_jobs / export_jobs  (status: queued)
      ↓
enqueue to BullMQ
      ↓
return { jobId }                          ← route ends here
      ↓
Worker picks it up   → UPDATE status: processing
      ↓
Work happens
      ↓
Success → upload to R2, UPDATE status: complete, result: {...}
          deduct credits, INSERT usage_events
Failure → UPDATE status: failed, errorMessage
          refund credits (they were never deducted), notify user
```

**Credits are deducted on completion, never on queue.** A shop must not pay for a job
that failed. Because deduction only happens on success, failure needs no refund logic —
just make sure nothing deducts early.

---

## Retries

BullMQ defaults per queue:

| Queue | Attempts | Backoff |
| --- | --- | --- |
| `pdf` | 3 | exponential, 5s base |
| `ai` | 2 | exponential, 10s base |
| `bg` | 3 | fixed, 2s |
| `email` | 3 | exponential, 5s base |
| `enrich` | 3 | exponential, 5s base, priority 10 (low) |

AI gets fewer attempts because each one costs real money at the provider.

Jobs that exhaust retries move to a dead-letter queue (`{queue}-failed`) and the job row
is marked `failed` with the error message. Monitor via Bull Board in the admin panel.

---

## Worker-specific rules

### PDF worker

Owns the Playwright browser pool. Full pipeline in `export-pipeline.md`.

Fonts must be available locally — the worker has no access to `fonts.googleapis.com` and
must not depend on external network on a critical path. Mirror brand kit fonts from R2
and reference them from the HTML shell.

### AI worker

API keys are server-side only and never reach the client. Character consistency across
poses uses ControlNet with the base character image as reference — regenerating a pose
from the text prompt alone produces a different person.

Generated images go to R2 under `/{orgId}/{shopId}/characters/`.

### Background removal worker

Calls the Rembg microservice over HTTP with an image URL or base64, receives a
transparent PNG. Target under 3 seconds. This worker does no image processing itself.

### Email worker

Every email goes through the queue. Nothing sends synchronously from a route handler.

The worker receives `{ template, to, props }`, imports the matching React Email component
from `@souqstudio/email`, renders it to HTML, and sends via Resend. Non-2xx from Resend
retries with backoff.

### Enrich worker

Cron: `0 2 * * *`. Fetches `catalog_products` where `enrichedAt IS NULL` in batches of
50, calls Claude to generate Arabic, Hindi and Urdu synonyms plus tags, writes to
`product_synonyms` and `catalog_products.tags`.

Low priority so it never competes with user-facing jobs. Failures after three attempts
are flagged for manual review rather than retried indefinitely.

---

## Graceful shutdown

Railway sends `SIGTERM` on deploy. The worker must drain in-flight jobs before exiting,
or a shop gets a PDF job stuck in `processing` forever.

```typescript
process.on('SIGTERM', async () => {
  await Promise.all([pdfWorker.close(), aiWorker.close(), /* ... */])
  process.exit(0)
})
```

`worker.close()` waits for active jobs to finish and stops accepting new ones.

---

## Health check

The worker exposes a minimal HTTP server on port 3001 returning
`{ status, workers: [...] }`. This exists for Railway's health check, not for
application use. Do not add business routes to it.

---

## Current state

**All five worker handlers are stubs that throw.** They are correctly wired — queue
names, connection, concurrency, event handlers and shutdown are in place — but the job
bodies are not implemented. Implement against this file and `apps/worker/CLAUDE.md`.
