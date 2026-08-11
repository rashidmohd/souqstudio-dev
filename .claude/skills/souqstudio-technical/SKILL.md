---
name: souqstudio-technical
description: The SouqStudio technical architecture — the stack and why each piece was chosen, multi-tenancy and row-level security, the Prisma data model, API route conventions and response shapes, the BullMQ background job system, the Fabric.js to SVG to Playwright export pipeline, Stripe billing architecture, AI credit accounting, and environment variable handling. Use this skill whenever writing or reviewing any server-side SouqStudio code — API routes, database queries, Prisma schema changes, migrations, background job handlers, PDF or image export, Stripe or webhook handling, AI job orchestration, authentication, or deployment configuration. Also use it before proposing any change to the stack, because the major choices here were made deliberately against alternatives.
---

# SouqStudio Technical Architecture

Read this before writing server-side code. The major stack choices were made against
specific alternatives for specific reasons — reversing one without reading the reasoning
will break something downstream.

Deeper detail lives in `references/`:

| File | Covers |
| --- | --- |
| `references/database.md` | Multi-tenancy, RLS, tsvector search, migrations, model map |
| `references/auth.md` | Sessions, passwords, lockout, verification tokens, 2FA, OAuth boundary |
| `references/api-conventions.md` | Route structure, response shapes, auth, pagination, webhooks |
| `references/background-jobs.md` | BullMQ queues, worker process, credit accounting, retries |
| `references/export-pipeline.md` | Canvas → SVG → Playwright → PDF, image export, browser pool |
| `references/environment.md` | Env vars per app, Zod validation, secret handling |

---

## The shape of the system

Three deployable units. Two are Next.js apps, one is a plain Node process.

```
apps/web      Next.js 14   Vercel     Shop owner UI + every API route
apps/admin    Next.js 14   Vercel     Internal team panel
apps/worker   Node.js      Railway    BullMQ workers — never Vercel
```

Plus one external microservice:

```
rembg         Python/FastAPI          Background removal. Separate because Rembg is Python-only.
```

The web app never does long-running work. It queues a job and returns a job ID. The
worker process does the work and writes the result back to the database. The client
polls for status.

---

## Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Next.js (App Router) | 14 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS + shadcn/ui | 3.4 |
| Canvas | Fabric.js | 6 |
| Drag and drop | dnd-kit | latest |
| State | Zustand + Immer | latest |
| Data fetching | SWR (client), fetch (server components) | latest |
| Charts | Tremor | latest |
| Auth | Own session layer; next-auth for Google OAuth only | 5 |
| ORM | Prisma | 5 |
| Database | PostgreSQL (Neon serverless) | 15+ |
| Jobs | BullMQ + Redis (Upstash) | latest |
| PDF | Playwright | latest |
| Images | Sharp | latest |
| Background removal | Rembg (Python microservice) | latest |
| Storage | Cloudflare R2 | — |
| Email sending | Resend | latest |
| Email templates | React Email | latest |
| Payments | Stripe | latest |
| Monorepo | Turborepo + pnpm workspaces | — |
| Monitoring | Sentry + PostHog | — |

---

## Decisions that must not be silently reversed

Each of these was chosen against a named alternative. If a change seems to require
reversing one, raise it rather than working around it.

### Fabric.js, not Konva.js

Fabric exposes `canvas.toSVG()`. Konva does not. SVG export is the entire basis of the
print pipeline — without it there is no vector PDF, and text stops being selectable and
stops staying sharp at A3. Konva is faster and more React-native; it loses on the one
capability that matters here.

**Consequence:** do not manage canvas internals in React state. The Zustand store holds
logical state (which products, what prices, layout config). Fabric holds visual state.
They sync on save.

### SVG as the bridge to PDF, not HTML templates

The alternatives were html2canvas (raster, flattens everything, loses text) and
maintaining a parallel server-side HTML template (two renderers that drift apart).

Canvas → `toSVG()` → wrap in a minimal HTML shell → Playwright → PDF. One source of
truth. What the owner saw in the editor is what prints. Text stays selectable and
searchable in the output.

**Consequence:** heavy CSS effects rasterise. Print exports apply a print-safe filter
that removes or simplifies blur, drop shadow and blend modes.

### Playwright, not Puppeteer

Warm render is roughly 3ms against Puppeteer's higher per-render overhead, and output
files are meaningfully smaller for the same input. For a new project in 2026 there is no
argument for Puppeteer.

**Consequence:** a persistent warm browser pool is mandatory — min 2, max 10, managed by
`generic-pool`. Launching a browser per request costs 400–600ms every time.

### No separate backend framework

Next.js API routes handle all HTTP. There is no Fastify or Express server.

A separate backend would add a second deployment, CORS configuration, and a second
codebase, in exchange for nothing at this scale. The two things that genuinely need a
long-lived process — the Playwright pool and multi-minute AI jobs — live in
`apps/worker`, which is a job consumer, not a web server.

### Resend, not AWS SES

SES starts every account in sandbox and requires written approval with bounce-handling
strategy before production access; approval without AWS billing history is unreliable.
Resend gives instant production access and native React Email integration.

The cost difference is roughly $15/month at 50K emails — not worth 4–8 hours of AWS
configuration plus ongoing deliverability management. **Revisit above 500K/month**, at
which point SES saves real money and the migration is straightforward.

### RLS at the database level, not application filtering

Every tenant table carries `organizationId` and a PostgreSQL row-level security policy.
Middleware sets `app.current_org_id` on the connection.

A missing `where` clause in one query is a cross-tenant data leak. Application-level
filtering alone is not an acceptable control for a multi-tenant SaaS.

### Zustand, not Redux or Context

Redux is too much ceremony for this. React Context re-renders too broadly for
canvas-level update frequency. Zustand with Immer gives immutable updates and a clean
undo/redo stack.

### Organization → Shop → User, not a flat model

Billing attaches to the organization. Operations attach to the shop. Login attaches to
the user. A retail group pays one invoice while fifty branches operate independently.

This is load-bearing. Flattening it — billing per shop, or merging org and shop — breaks
the multi-branch customer, which is the highest-value segment.

### Rembg as a Python microservice

Rembg is Python-only. Running it out of process keeps the Node runtime clean and lets it
scale independently. It takes an image URL or base64 and returns a transparent PNG.

---

## Conventions

- **TypeScript strict.** No `any`. No type assertions without a comment explaining why.
- **Never read `process.env` directly.** Import the validated `env` object. See
  `references/environment.md`.
- **Never import `@prisma/client` directly.** Import `prisma` from `@souqstudio/db`.
- **All migrations through Prisma Migrate.** Never touch the database directly.
  `db:push` in development, `db:migrate` in CI and production.
- **Shared types live in `packages/types`.** Never duplicate a type definition across apps.
- **Every API route gets a test.** Use Next.js route handler testing or Vitest.
- **Cursor-based pagination**, never page numbers.
- **ISO 8601 UTC** for every timestamp crossing a boundary.
- **Conventional Commits**: `feat:` `fix:` `chore:` `docs:` `refactor:` `test:`.

---

## Performance targets

| Operation | Target |
| --- | --- |
| Catalog search response | < 200ms |
| Social image export (PNG) | Instant — client-side, no server round trip |
| Single-page PDF | < 5 seconds end to end |
| 10-page catalog PDF | < 30 seconds end to end |
| Print-ready PDF (CMYK) | < 60 seconds end to end |
| Playwright warm render | ~3ms per page |
| Analytics dashboard load | < 1 second |
| Public viewer first paint | < 1.5 seconds on 4G |
| First offer book from signup | < 30 minutes |

The public viewer target is the one that matters commercially. It is seen thousands of
times per book, on mid-range Android over poor connections, by people who have never
heard of SouqStudio.

---

## Build commands

```bash
pnpm dev           # All apps in development
pnpm build         # Build all
pnpm lint          # ESLint across packages
pnpm typecheck     # tsc --noEmit across packages
pnpm test          # Vitest across packages

pnpm db:generate   # Prisma generate
pnpm db:push       # Push schema — DEVELOPMENT ONLY
pnpm db:migrate    # Apply migrations — CI and production
pnpm db:studio     # Prisma Studio
```

---

## Known gaps

Raise these rather than inventing an answer:

- **Worker handlers are stubs.** All five throw. Implement against
  `references/background-jobs.md` and `apps/worker/CLAUDE.md`.
- **CMYK conversion for print-ready PDF** is specified as a Ghostscript post-process but
  not implemented or benchmarked. The 60-second target is an estimate.
- **tsvector migration is not written.** The `search_vector` column, its GIN index and
  the update trigger are raw SQL that Prisma does not manage. See
  `references/database.md`.
- **Analytics aggregation is query-time.** No materialised views. This will need
  revisiting before roughly 10M page-view rows; ClickHouse is the fallback, not the
  starting point.
- **Rate limiting** is not specified on any route, including the public tracking
  endpoints which are unauthenticated and trivially floodable.
- **Access token encryption** for Meta OAuth is specified as AES-256 at rest but the key
  management approach is undecided.
