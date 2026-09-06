# packages/db

Shared Prisma schema and generated client. Used by all apps.
This package is the single source of truth for the database schema.

---

## Directory structure

```
packages/db/
├── prisma/
│   ├── schema.prisma          # Single schema file — all models here
│   ├── migrations/            # Prisma migration history
│   └── seed.ts                # Reference data: plans, blocks, catalog categories, promo tiers
├── scripts/
│   ├── import-off.ts          # E5 — stream the Open Food Facts export into the universal catalog
│   ├── seed-catalog-demo.ts   # E5 — 99 hand-written demo products, so the screens can be looked at
│   └── export-harness-products.ts  # Real rows for the engine's render harness. JSON, so the
│                              #   engine keeps its zero database imports. Prices are invented.
├── src/
│   ├── index.ts               # Re-exports PrismaClient singleton
│   ├── client.ts              # PrismaClient with RLS middleware
│   ├── credits.ts             # E3-03 AI credit accounting (shared between web + worker)
│   ├── off-mapping.ts         # E5 — the pure half of the OFF import. Tested; no Prisma.
│   ├── promo-tiers.ts         # E5 — seeded per organization inside the signup transaction
│   └── queue-client.ts        # BullMQ queue producers (shared between web + worker)
└── package.json
```

**`prisma/seed.ts` is reference data; `scripts/` is bulk data.** The seed is small,
idempotent, and every environment needs all of it. A script is a one-off run against a
dataset that lives elsewhere, is measured in gigabytes, and is nobody's dependency. They
are separated so `pnpm db:seed` stays something you can run without thinking.

**The package now has tests.** `pnpm --filter @souqstudio/db test` covers the pure
modules — the OFF mapping today. Anything needing a connection is checked by running it,
not here.

---

## Schema rules

- One `schema.prisma` file. Never split the schema.
- Every model with tenant data has `organizationId String` field.
- RLS enforced at DB level via `SET app.current_org_id`. Never rely on app-level filtering alone.
- Use `cuid()` for all IDs. Never auto-increment integers as primary keys.
- All timestamps: `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`.
- JSONB fields: use `Json` type in Prisma. Document the shape in a comment above the field.
- `search_vector` on `catalog_products` is a raw PostgreSQL `tsvector`. Its type, its GIN
  index and its trigger are raw SQL in the E5 migration — **and it is also declared in the
  model** as `searchVector Unsupported("tsvector")?` with the three GIN indexes. Both, not
  either. A model that does not mention the column makes `db push` and `migrate dev`
  generate a `DROP` for it, and losing the search index reads as slow search rather than as
  a missing index. `Unsupported` fields are excluded from the generated client, so it can
  only be queried raw — which is what you want.
- Postgres enums appear **only** in the offer and catalog model added by E5. Everything
  older spells closed sets as `String // a | b | c` and stays that way. The reasoning is
  in the comment above `enum PackUnit` in the schema; do not convert the older columns.
- `catalog_products` is the one tenant table whose RLS predicate is not a flat equality:
  a null `organizationId` is the universal catalog and must be readable by everyone.

---

## PrismaClient singleton

```typescript
// src/client.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Always import `prisma` from `@souqstudio/db`, not from `@prisma/client` directly.

---

## RLS pattern

Use `withOrg` from this package. Never write the raw statement at a call site:

```typescript
const shops = await withOrg(organizationId, (tx) => tx.shop.findMany())
```

**Not `SET app.current_org_id = ${organizationId}`.** That form appeared here until E2
and was never run: `SET` refuses a bind parameter, and it is session-scoped, so on a
pooled connection the value leaks into the next request. `withOrg` uses
`set_config(..., true)`, which binds and is transaction-scoped.

Middleware cannot do this. It runs on the Edge runtime and cannot reach Prisma — see
apps/web/middleware.ts.

Full reasoning and the policy shape: `souqstudio-technical` -> `references/database.md`.

---

## Queue client (shared)

`src/queue-client.ts` exports queue producer functions used by both `apps/web` and `apps/worker`.
Web uses it to add jobs. Worker uses it to define job handlers.
This keeps queue names and job payload types in sync — defined once, used everywhere.

```typescript
// src/queue-client.ts
export const queues = {
  pdf: new Queue('pdf', { connection }),
  ai: new Queue('ai', { connection }),
  bg: new Queue('bg', { connection }),
  email: new Queue('email', { connection }),
  enrich: new Queue('enrich', { connection }),
}

export async function enqueuePdfRender(payload: PdfRenderPayload) {
  return queues.pdf.add('pdf.render', payload)
}

// ... other typed enqueue functions
```

---

## Key models summary

Model map and conventions: `souqstudio-technical` skill, `references/database.md`.

| Model | Purpose |
|---|---|
| `Organization` | Billing entity. Stripe customer. |
| `Shop` | Operational unit. Brand kit. Belongs to org. |
| `User` | Individual login. Role: owner/manager/editor/viewer. |
| `UserShopAccess` | Maps users to specific shops with optional role override. |
| `Plan` | Subscription tier config. |
| `CatalogProduct` | Both collections. `organizationId` null = universal. Bilingual. tsvector search. |
| `ImageAsset` | ORIGINAL / CUTOUT / THUMB per product, with tight bbox and matte confidence. |
| `ProductSynonym` | Multilingual synonyms per product. |
| `CatalogImport` / `CatalogImportRow` | Spreadsheet upload and its per-row match result. |
| `CaptureSession` | QR phone-capture handoff. Token-scoped and expiring. |
| `OfferBook` | Created campaign. Template, density, language, shareable link. |
| `OfferBookPage` | One page: page type and its bounded `slotOverrides`. |
| `Offer` | N products at one price — what the layout engine places. |
| `OfferItem` | One product within an offer, with per-book name and spec overrides. |
| `PromoTier` | Org-scoped badge tier. Colour token, never a hex. |
| `OfferChip` / `OfferFootnote` / `OfferShopOverride` | Card metadata, notes, per-shop price and availability. |
| `PageView` | Analytics — viewer opened a shareable link. |
| `ProductClick` | Analytics — viewer clicked a product. |
| `UsageEvent` | AI credit consumption tracking. |
| `CreditBalance` | E3-03. The one billing number that is not a Stripe cache. |
| `CreditTopup` | A credit purchase. Granted by the `invoice.paid` webhook. |
| `ShopCreditAllocation` | Per-shop credit ceiling. Business plan and above. |
| `StripeEvent` | Every Stripe event seen, by id. Webhook idempotency. |
| `AiJob` | AI generation job status tracking. |
| `Character` | Generated AI character. Belongs to shop. |
| `CharacterPose` | Individual poses for a character. |
| `Template` | Offer book visual template config. |
| `Grid` | Offer book grid layout config. |
| `SocialConnection` | Instagram/Facebook OAuth token (encrypted). |
| `SocialPost` | Published/scheduled social media post. |
| `AdminUser` | Separate from User — internal SouqStudio staff. |
| `AdminAuditLog` | Every admin action logged. |

---

## Migration workflow

```bash
# Development: push schema changes without a migration file
pnpm db:push

# Create a migration for a schema change
pnpm db:migrate:dev --name add_character_poses

# Apply migrations in production (CI)
pnpm db:migrate

# Reference data — plans, the four seeded blocks, the ten catalog categories,
# and the promo-tier backfill. (The five grids and five templates this line used
# to name are gone with their tables; see docs/composition-model.md.)
# Idempotent: every row is upserted against a hand-written id, so running it
# twice changes nothing and running it after an edit restores the defaults.
# Ids are not cuid() for exactly that reason.
pnpm db:seed

# View and edit data
pnpm db:studio

# E5 — fill the universal catalog from Open Food Facts (ODbL, commercial use
# permitted; no images are taken). Streams a 1.28GB gzipped export, so start
# with the dry run. Idempotent: rows upsert against the universal barcode index,
# and it never touches an organization's own rows.
pnpm catalog:import-off -- --url --dry-run --limit 500
pnpm catalog:import-off -- --url

# E5 — 99 demo products so /catalog and the engine can be looked at with rows in
# them. NOT a substitute for the import above: `source = 'demo'` marks them and
# `--clear` removes exactly those. `--images` points every one at a single
# placeholder object in R2 — read the note on DEMO_IMAGE before concluding
# anything from a populated grid.
pnpm catalog:seed-demo
pnpm catalog:seed-demo --images
pnpm catalog:seed-demo --clear

# Real catalog rows for the engine's render harness — four sets: a page spanning
# the table, the longest names, the rows with a real nameAr, and the rows with a
# name and nothing else. Writes gitignored JSON into packages/engine/harness/,
# because the engine must never import Prisma. Prices and promo tiers in that
# file are INVENTED — a catalog row has no price. Then run the harness.
pnpm catalog:harness-export
pnpm --filter @souqstudio/engine harness
```

Never use `db:push` in production. Always use `db:migrate`.
