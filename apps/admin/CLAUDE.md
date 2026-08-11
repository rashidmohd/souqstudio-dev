# apps/admin

Next.js 14 App Router. Internal SouqStudio team tool.
Not customer-facing. Access restricted to SouqStudio staff only.

---

## Directory structure

```
apps/admin/
├── app/
│   ├── layout.tsx               # Admin shell — different from shop owner shell
│   ├── page.tsx                 # Platform overview dashboard
│   ├── organizations/           # Org search, detail, impersonation
│   ├── catalog/                 # Product CRUD, bulk import, synonym management
│   ├── contributions/           # Community image review queue
│   ├── templates/               # Template + grid builder and publisher
│   ├── analytics/               # Platform-wide health metrics
│   ├── broadcasts/              # Email + WhatsApp broadcast management
│   └── api/
│       └── v1/
│           └── admin/           # Admin-only API routes
├── components/
│   ├── ui/                      # shadcn/ui (same bridge, slightly more utilitarian)
│   ├── catalog/                 # Catalog management tables + forms
│   ├── templates/               # Template visual builder
│   └── shared/
├── lib/
│   ├── env.ts
│   ├── auth.ts                  # Separate admin auth — checks admin_users table
│   └── audit.ts                 # Writes to admin_audit_log on every action
└── middleware.ts                 # IP allowlist + admin session check
```

---

## Access control

- Admin users are in `admin_users` table — completely separate from `users`.
- Middleware checks `admin_users` table, not the shop owner `users` table.
- IP allowlist enforced in middleware — restrict to office/VPN IPs in production.
- Admin roles: `super_admin` | `catalog_manager` | `support_agent`
- Every action writes to `admin_audit_log`: who, what, which entity, before + after state.

---

## Impersonation

- Super admin can impersonate an org owner for support debugging.
- Generates a short-lived session token for the target org.
- Every action during impersonation is labelled in the audit log.
- Impersonation sessions expire after 30 minutes.
- A visible banner shows "Impersonating [org name]" during the session.

---

## Catalog management rules

- Bulk import via CSV. Preview before import. Show duplicates and errors.
- Duplicate detection: by barcode (exact) or name similarity (pg_trgm, > 85%).
- Background removal queued via BullMQ when image is uploaded — never blocks the UI.
- AI enrichment (synonym generation) triggered manually per product or in bulk.
  Runs via BullMQ, not synchronously.
- Never delete products — archive them. Existing offer books must not break.

---

## Template builder rules

- Template config is structured JSON. Never freeform CSS.
- Preview panel renders a mini Fabric.js canvas with sample products.
- Seasonal templates have an `active_from` / `active_to` date range.
  They appear automatically in the shop owner template picker during the active window.
- Publishing a template does not affect existing offer books using it.
- Template versioning: every save creates a row in `template_versions`.
  Super admin can restore a previous version.

---

## Community contribution review

- Queue shows: submitted image, name, brand, category, submitting shop.
- Actions: Approve | Reject (with reason) | Request better image | Merge with existing.
- Approving triggers: product added to master catalog, shop owner notified.
- Quality gates shown to reviewer: resolution warning, duplicate matches, AI category suggestion.

---

## Design

- Uses the same `souqstudio-tokens.css` design tokens as the shop owner app.
- Same shadcn/ui bridge.
- More utilitarian density — tables are the primary UI, not cards.
- TanStack Table for sortable, filterable data tables.
- Tremor for platform analytics charts.
- No illustrations — this is a dense working tool, not an onboarding experience.
