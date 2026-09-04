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

Weighted so the name outranks brand and category, which outrank spec and tags. **Both
name columns feed weight A** — an Arabic query has to hit the same row an English one
does.

Written and shipped in `20260904000000_e5_offer_model_and_catalog_search`. This is the
version in the migration:

```sql
CREATE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('simple', COALESCE(NEW."nameEn", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW."nameAr", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW."brandEn", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."brandAr", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."category", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."specEn", '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW."specAr", '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW."tags", ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER catalog_search_vector_update
  BEFORE INSERT OR UPDATE ON "catalog_products"
  FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

The Arabic string is indexed exactly as stored. **Nothing normalises or strips diacritics**
— the import resolver has to round-trip it unchanged, and an index built on a normalised
form would quietly disagree with the column.

**Use the `simple` dictionary, not `english`.** The catalog is multilingual — English
stemming applied to Arabic, Hindi and Urdu transliterations produces wrong matches.
Language-specific handling happens through the synonym table instead.

### Fuzzy matching

`pg_trgm` handles typos and near-misses:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_catalog_trgm_en ON "catalog_products" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX idx_catalog_trgm_ar ON "catalog_products" USING GIN ("nameAr" gin_trgm_ops);
```

Spreadsheet import resolves rows by name as well as by barcode, so this is on the **import**
path too, not only on search.

### Query shape

Full-text match, unioned with synonym hits, ranked:

```sql
SELECT cp.*, ts_rank(cp."search_vector", q) AS rank
FROM catalog_products cp,
     plainto_tsquery('simple', $1) q
WHERE (cp."organizationId" = $3 OR cp."organizationId" IS NULL)
  AND cp."archivedAt" IS NULL
  AND (
    cp."search_vector" @@ q
    OR EXISTS (
      SELECT 1 FROM product_synonyms ps
      WHERE ps."catalogId" = cp.id AND ps.synonym ILIKE $2
    )
  )
ORDER BY (cp."organizationId" IS NOT NULL) DESC, rank DESC
LIMIT 10;
```

Two clauses carry the two-collection rule. The `WHERE` admits the organization's own rows
and the universal ones; the leading `ORDER BY` term puts the organization's first at equal
rank. **That ordering is the precedence, not a nicety** — a chain that has corrected a bad
public record needs its own row to win, and it wins here rather than in a merge written
twice in application code.

**Status: applied and verified.** The column, index, trigger and extensions are in
`20260904000000_e5_offer_model_and_catalog_search`, along with the rest of the E5 delta.
This exact query was run against the live database with three seeded rows: English and
Arabic queries return the same product, and the organization's own row leads.

The column is **also declared in the Prisma model** as `searchVector Unsupported("tsvector")?`
with the three GIN indexes, on top of the raw SQL. Raw SQL alone leaves Prisma believing
the column should not exist, so `db push` and `migrate dev` generate a `DROP` for it.

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
| `CatalogProduct` | Both collections. `organizationId` null = universal, set = private to that org. tsvector search. | partly — see below |
| `ImageAsset` | ORIGINAL / CUTOUT / THUMB per product, with `bboxTight` and matte confidence. | via product |
| `ProductSynonym` | Multilingual synonyms. | no |
| `CatalogCategory` | Category tree. Bilingual labels. | no |
| `ProductContribution` | Shop-submitted products awaiting promotion to the universal catalog. | yes |
| `CatalogImport` | A spreadsheet upload and its match run. | yes |
| `CatalogImportRow` | One row of that sheet, its raw form and what it resolved to. | via import |
| `CaptureSession` | QR phone-capture handoff. Token-scoped, hashed, expiring. | yes |
| `OfferBook` | A campaign. Template, density, language, share link. | yes |
| `OfferBookPage` | One page: its page type and its `slotOverrides`. | via book |
| `Offer` | N products at one price. The unit the layout engine places. | via book |
| `OfferItem` | One product within an offer, with per-book name and spec overrides. | via offer |
| `PromoTier` | Org-scoped badge tier. Label, colour token, emphasis. | yes |
| `OfferChip` | Non-price metadata on a card. May overhang the card boundary. | via offer |
| `OfferFootnote` | Page- or book-scoped note. Carries no marker number. | via offer |
| `OfferShopOverride` | Per-shop price and availability. The per-shop billing mechanic. | yes |
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

**`CatalogProduct` is the one table RLS cannot filter flat.** A universal row has a null
`organizationId` and must be visible to everyone; a private row must be visible to one org
only. The policy is therefore `organizationId IS NULL OR organizationId = current_org`,
not the usual equality. Writes are the opposite — an org may only write rows carrying its
own id, and clearing `organizationId` (promotion to universal) is an admin action, never a
tenant one.

---

## Schema conventions

- **`cuid()` for all IDs.** Never auto-increment integers — they leak row counts and
  make cross-environment data movement painful.
- **`createdAt` / `updatedAt` on every model** that represents a real entity.
- **`@@map` to snake_case table names.** Prisma models are PascalCase, tables are
  snake_case, and the mapping is explicit.
- **JSONB fields carry a `///` comment** documenting their shape. `slotOverrides`,
  `brandKit`, `config`, `features`, `metadata`, `result`, `bboxTight`, `columnMap`, `raw`
  and `candidates` are all JSONB. (`canvasState` was one until E6 v2 dropped it.)
- **Money is `Decimal`**, never `Float`. Prices, discounts, plan pricing.
- **Never delete catalog products** — archive them (`archivedAt`). Published offer books
  reference them and must not break.
- **Enums exist only in the offer model.** Everything written before E5 spells closed sets
  as `String // a | b | c`, and that stands. The offer and catalog enums — `PackUnit`,
  `PriceMode`, `Connector`, `ChipKind`, `ChipAnchor`, `FootnoteScope`, `ImageKind`,
  `ReviewState`, `UnitPriceMode`, `ImportStatus`, `ImportRowStatus` — are a deliberate,
  scoped departure: the layout engine branches on every value, and a bad string renders a
  card wrong on a printed page rather than throwing. **Do not convert the older columns to
  match.** A half-converted schema is worse than either convention held consistently.

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
