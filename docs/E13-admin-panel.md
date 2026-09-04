# E13 — Admin Panel

## Overview

An internal tool for the SouqStudio team to manage the platform — organizations, catalog, templates, AI credit oversight, and broadcast communications. Completely separate from the shop owner-facing product. Access restricted to SouqStudio staff only.

**Priority:** MVP (catalog, org management), V2 (analytics, broadcast)

---

## Access Control

- Separate login at `admin.souqstudio.com` (or `/admin` route, middleware-protected)
- Admin users exist in a separate `admin_users` table — not the same as organization users
- Admin roles: Super Admin / Catalog Manager / Support Agent
- IP allowlist recommended for production

---

## Features

### E13-01 Organization & User Management

**Organizations List**
- Search by name, email, plan, status
- Columns: org name, plan, shops count, users count, MRR, created date, last active
- Filter by: plan tier, billing status, country, created date range

**Organization Detail**
- View all shops, users, and billing info
- View Stripe customer and subscription
- Manually change plan (for enterprise deals or support resolution)
- Add/remove AI credits manually (for support, refunds, goodwill)
- Suspend / unsuspend account
- View all offer books created by this org
- View audit log (who did what, when)
- Impersonate org owner (for support debugging — logged)

**User Management**
- Search users across all organizations
- View user's org membership and role
- Reset password (send reset email)
- Disable / enable user account

### E13-02 Catalog Management

The primary tool for building and maintaining the master product catalog.

**Product List**
- Search and browse all products
- Filter by: category, brand, has image, enrichment status, source, date added

**Add Product**
- Manual add: name EN and AR, brand EN and AR, spec, origin, category, pack size / unit /
  count, barcode, image upload
- Background removal runs on image upload and produces the `CUTOUT` variant with its tight
  bounding box and matte confidence
- Assign synonyms on add

**Edit Product**
- All fields editable
- Replace an image, re-run the cutout, approve or reject a matte
- Edit synonyms
- **Archive, never delete.** Published offer books reference the row.

**Two collections.** The list spans both — the universal catalog (`organizationId` null)
and organizations' private rows. Filter by collection, and show which one a row belongs to
in the list. Promoting a private row to universal is an admin action that clears
`organizationId`; a tenant can never do it. See E5 §1.

**Matte review queue.** `image_assets` rows with `reviewState = PENDING` are cutouts the
worker was not confident about. Approving one lets it render; rejecting it falls the card
back to the `ORIGINAL` with a quality flag in the editor. This is a different queue from
E13-03 — that one reviews *products*, this one reviews *images*.

**Bulk Import**
- CSV upload: columns map to product fields
- Preview before import (shows errors, duplicates)
- Duplicate detection by barcode or name similarity
- Background removal job queued for all imported images

**Synonym Management**
- View all synonyms per product
- Add / remove synonyms
- Set language and region per synonym
- Run AI enrichment on selected products (generates synonyms via Claude API)

**Category Management**
- Create / edit / reorder categories and subcategories
- Upload category icon
- Set display order

**Enrichment Queue**
- Products pending AI metadata enrichment
- Manual trigger for individual products
- Bulk trigger for all unenriched products
- View enrichment history and failures

### E13-03 Community Image Review Queue

Products submitted by shop owners (E5-04) that need review before entering the master catalog.

**Queue View**
- Pending submissions listed with product image, name, brand, category
- Submitted by: org name, shop name, date submitted

**Review Actions**
- Approve → clears `organizationId`, promoting the row into the universal catalog. The
  product was already usable in the submitting organization's own collection from the
  moment it was created — **review decides promotion, not availability.**
- Reject → notify shop owner with reason (poor image quality / duplicate / inappropriate)
- Request better image → notification sent to shop owner
- Merge → combine with existing product record

**Quality Checks (shown to reviewer)**
- Image resolution warning (< 400×400)
- Duplicate match (shows closest existing catalog matches by name similarity)
- Category suggestion (from AI enrichment)

### E13-04 Template & Grid Management

Admin interface for managing templates and grids (same as E7 features, accessed here).

- Create / edit / publish / unpublish templates
- Create / edit / publish / unpublish grids
- Manage seasonal templates and schedule
- Manage overlay asset library
- Preview any template at any output format

### E13-05 AI Credit & Billing Oversight

**Credit Usage Dashboard**
- Total AI credits consumed across all organizations (this month / all time)
- Top credit consumers (org list ranked by usage)
- Credit usage by type (character gen vs cover gen vs background removal)
- Estimated AI cost vs credits charged (margin monitoring)

**Manual Credit Adjustments**
- Add credits to an org (goodwill / support)
- Remove credits from an org (abuse)
- Adjustment logged with reason

**Billing Overview**
- MRR by plan tier
- New MRR this month
- Churned MRR this month
- Failed payments count
- Stripe dashboard link

### E13-06 Platform Analytics Overview

High-level view of platform health.

- Total organizations (active / churned / trial)
- Total offer books created (this month / all time)
- Total exports by format
- Total shareable link views
- Total product clicks
- Most popular products (across entire platform)
- Most popular templates

### E13-07 Broadcast Management (V2)

Send messages to shop owners at scale.

**Create Broadcast**
- Select channel: Email / WhatsApp / In-App
- Target audience: All / By plan / By country / By last active date / Custom filter
- Compose message (email: React Email template; WhatsApp: approved template; in-app: title + body + link)
- Preview before sending
- Schedule or send immediately

**Broadcast History**
- List of all sent broadcasts
- Delivery stats: sent / delivered / opened / clicked
- Failed deliveries list

**WhatsApp Template Management**
- WhatsApp requires pre-approved message templates for outbound messages
- Manage approved templates here
- Submit new templates for Meta approval (with current approval status)

---

## Frontend Notes

- Admin panel is a separate Next.js app or a heavily route-guarded section of the main app
- Component library: shadcn/ui (same components, different styling context)
- Style tokens: defer to `/skills/style` — admin can have a more neutral/utilitarian feel vs the shop owner product
- Tables: TanStack Table (formerly React Table) for sortable, filterable data tables
- Charts: Tremor for platform analytics views

---

## Backend Notes

- Admin routes under `/api/admin/...` — middleware checks `admin_users` table, not `users`
- Impersonation: generates a short-lived session token for the target org; every action during impersonation is logged
- Audit log: `admin_audit_log` table records every admin action with admin user ID, target entity, action type, and before/after values
- Rate limiting on admin API routes (protect against internal mistakes at scale)

---

## Database Tables

```
admin_users
  id, email, password_hash, role, last_login, created_at

admin_audit_log
  id, admin_user_id, action, entity_type, entity_id,
  before JSONB, after JSONB, created_at

product_contributions
  id, shop_id, image_url, name, brand, category,
  status, reviewed_by, reviewed_at, rejection_reason
```

---

## Out of Scope

- Customer support ticketing system (use Intercom or Crisp externally)
- Automated fraud detection
- A/B testing management
- Feature flag management (use an external tool like Growthbook or Posthog)
