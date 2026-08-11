# Database

PostgreSQL 15+ on Neon. Prisma 5 as the ORM. Schema lives at
`packages/db/prisma/schema.prisma` — one file, never split.

---

## Multi-tenancy

Every table holding tenant data carries `organizationId`. Isolation is enforced by
PostgreSQL row-level security, not by application code.

**Why this is not optional.** A missing `where` clause in one query is a cross-tenant
data leak. Application filtering is a convention; RLS is a control.

### The pattern

The org context is set inside the transaction that runs the query. Use `withOrg` from
`@souqstudio/db` — never write the raw statement at a call site:

```typescript
const shops = await withOrg(session.user.organizationId, (tx) =>
  tx.shop.findMany({ where: { archivedAt: null } })
)
```

**`SET app.current_org_id = ${organizationId}` does not work.** It appeared in this file
until E2 and was never run. Two independent reasons:

- `SET` is a utility statement, so PostgreSQL will not accept a bind parameter in it and
  Prisma's prepared statement errors at runtime.
- `SET` is *session*-scoped. On a pooled connection the value outlives the request, and
  the next request to borrow that connection inherits the previous tenant's id — a
  control that silently authorizes cross-tenant reads, which is worse than no control.

`set_config(name, value, true)` fixes both: it is an ordinary function call, so the value
binds, and the third argument scopes it to the current transaction.

Each tenant table carries a policy:

```sql
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops FORCE  ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON shops
  USING       ("organizationId" = current_setting('app.current_org_id', true))
  WITH CHECK  ("organizationId" = current_setting('app.current_org_id', true));
```

Three details, each of which decides whether this does anything at all:

- **`FORCE` is required.** Policies do not apply to the table owner, and the app connects
  as the owner. Without it the policies exist and enforce nothing.
- **`WITH CHECK` is not optional.** `USING` filters reads; without `WITH CHECK` an INSERT
  or UPDATE can still write another tenant's `organizationId`.
- **The columns are camelCase and quoted.** No Prisma field in this schema carries an
  `@map`, so only *tables* are snake_case (via `@@map`). A policy written against
  `organization_id` will not run.

`current_setting(…, true)` returns NULL when unset, so the comparison is NULL and the row
is filtered: it **fails closed**. That is the behaviour to want, and also the hazard — a
call site that forgets `withOrg` returns an empty result rather than an error.

**Never trust an `organizationId` sent from the client.** Read it from the session.

### Tables exempt from RLS

- `plans` — global reference data
- `catalog_products`, `product_synonyms`, `catalog_categories` — shared master catalog
- `templates`, `grids`, `seasonal_assets` — published globally, gated by plan tier
- `admin_users`, `admin_audit_logs` — separate access path entirely

---

## Full-text search

Catalog search runs on a PostgreSQL `tsvector` column with a GIN index. Prisma does not
manage tsvector columns — this is raw SQL in a migration.

### The column and index

```sql
ALTER TABLE catalog_products ADD COLUMN search_vector tsvector;

CREATE INDEX idx_catalog_fts ON catalog_products USING GIN(search_vector);
```

### The trigger

Weighted so the product name outranks the category, which outranks tags:

```sql
CREATE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.canonical_name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER catalog_search_vector_update
  BEFORE INSERT OR UPDATE ON catalog_products
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

**Use the `simple` dictionary, not `english`.** The catalog is multilingual — English
stemming applied to Arabic, Hindi and Urdu transliterations produces wrong matches.
Language-specific handling happens through the synonym table instead.

### Fuzzy matching

`pg_trgm` handles typos and near-misses:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_catalog_trgm ON catalog_products USING GIN (canonical_name gin_trgm_ops);
```

### Query shape

Full-text match, unioned with synonym hits, ranked:

```sql
SELECT cp.*, ts_rank(cp.search_vector, q) AS rank
FROM catalog_products cp,
     plainto_tsquery('simple', $1) q
WHERE cp.search_vector @@ q
   OR EXISTS (
     SELECT 1 FROM product_synonyms ps
     WHERE ps.catalog_id = cp.id AND ps.synonym ILIKE $2
   )
ORDER BY rank DESC
LIMIT 10;
```

**Status: not yet written.** The migration containing the column, index, trigger and
extensions does not exist. This is a blocking dependency for E5.

---

## Model map

Full definitions in `packages/db/prisma/schema.prisma`.

| Model | Purpose | Tenant-scoped |
| --- | --- | --- |
| `Organization` | Billing entity. Stripe customer. | root |
| `Shop` | Operational unit. Holds the brand kit. | yes |
| `User` | Individual login. | yes |
| `UserShopAccess` | Maps users to shops, optional per-shop role override. Carries `organizationId`. | yes |
| `Invite` | A pending team member. Hashed token, 48h. E2-03. | yes |
| `Session` | Database-backed sessions, revocable. Hashed token, rotation family. | no — read before org context exists |
| `VerificationToken` | Email verification and password reset. Hashed, single-use. | no — read before login |
| `TwoFactorBackupCode` | Single-use TOTP recovery codes. Hashed. | no — read during login |
| `Plan` | Subscription tier limits and feature flags. | no |
| `CatalogProduct` | Master catalog. tsvector search. | no |
| `ProductSynonym` | Multilingual synonyms. | no |
| `CatalogCategory` | Category tree. | no |
| `ProductContribution` | Shop-submitted products awaiting review. | yes |
| `OfferBook` | A campaign. Canvas state, share link. | yes |
| `OfferBookProduct` | Products in a book with prices and layout. | yes |
| `Template` | Offer book visual template config. | no |
| `TemplateVersion` | Version history per template. | no |
| `Grid` | Grid layout config. | no |
| `Character` | AI-generated shop character. | yes |
| `CharacterPose` | Poses for a character. | yes |
| `AiJob` | AI generation job status. | yes |
| `UsageEvent` | AI credit consumption ledger. | yes |
| `ExportJob` | PDF/image export job status. | yes |
| `PageView` | Analytics — viewer opened a link. | yes |
| `ProductClick` | Analytics — viewer clicked a product. | yes |
| `SocialConnection` | Meta OAuth token, encrypted. | yes |
| `SocialPost` | Published or scheduled social post. | yes |
| `Notification` | In-app notification. | yes |
| `NotificationPreference` | Per-user channel opt-ins. | yes |
| `AdminUser` | Internal staff. Separate from `User`. | no |
| `AdminAuditLog` | Every admin action, before and after. | no |

---

## Schema conventions

- **`cuid()` for all IDs.** Never auto-increment integers — they leak row counts and
  make cross-environment data movement painful.
- **`createdAt` / `updatedAt` on every model** that represents a real entity.
- **`@@map` to snake_case table names.** Prisma models are PascalCase, tables are
  snake_case, and the mapping is explicit.
- **JSONB fields carry a `///` comment** documenting their shape. `canvasState`,
  `brandKit`, `config`, `features`, `metadata`, `result` are all JSONB.
- **Money is `Decimal`**, never `Float`. Prices, discounts, plan pricing.
- **Never delete catalog products** — archive them. Published offer books reference
  them and must not break.

---

## Migration workflow

```bash
pnpm db:push                              # Development — no migration file
pnpm db:migrate:dev --name add_something  # Create a migration
pnpm db:migrate                           # Apply in CI and production
pnpm db:studio                            # Inspect and edit data
```

`db:push` is never run against production. Raw SQL that Prisma cannot express — the
tsvector column, its trigger, RLS policies, extensions — goes into migration files by
hand, alongside the generated Prisma DDL.

---

## Connection handling

Neon is serverless, so connection count matters. `PrismaClient` is a module-level
singleton, cached on `globalThis` in development so hot reload does not open a new pool
on every change. See `packages/db/src/client.ts`.

The worker process holds its own long-lived client — it is a persistent process and does
not share the web app's pool.
