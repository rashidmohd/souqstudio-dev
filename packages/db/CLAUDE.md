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
│   └── seed.ts                # Reference data: the 5 grids and 5 templates
├── src/
│   ├── index.ts               # Re-exports PrismaClient singleton
│   ├── client.ts              # PrismaClient with RLS middleware
│   ├── credits.ts             # E3-03 AI credit accounting (shared between web + worker)
│   └── queue-client.ts        # BullMQ queue producers (shared between web + worker)
└── package.json
```

---

## Schema rules

- One `schema.prisma` file. Never split the schema.
- Every model with tenant data has `organizationId String` field.
- RLS enforced at DB level via `SET app.current_org_id`. Never rely on app-level filtering alone.
- Use `cuid()` for all IDs. Never auto-increment integers as primary keys.
- All timestamps: `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`.
- JSONB fields: use `Json` type in Prisma. Document the shape in a comment above the field.
- `search_vector` on `catalog_products` is a raw PostgreSQL `tsvector` — managed via SQL migration,
  not Prisma field. Add as `Unsupported("tsvector")` or manage via raw SQL migration.
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

# Reference data — the five grids and five templates of E4-03 and E4-04.
# Idempotent: every row is upserted against a hand-written id, so running it
# twice changes nothing and running it after an edit restores the defaults.
# Ids are not cuid() for exactly that reason.
pnpm db:seed

# View and edit data
pnpm db:studio
```

Never use `db:push` in production. Always use `db:migrate`.
