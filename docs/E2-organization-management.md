# E2 — Organization Management

## Overview

Self-served management of the organization (the billing entity), its shops (operational units), and the users who belong to them. Everything is done by the customer — no SouqStudio team involvement.

**Priority:** MVP

---

## Account Hierarchy

```
ORGANIZATION (billing entity — who pays)
    └── SHOP (operational unit — creates offer books)
            └── USERS (individuals — who logs in)
```

---

## Features

### E2-01 Organization Settings

- Edit organization name
- Edit billing contact email
- Add VAT / TRN number (required for UAE B2B invoicing)
- Set organization country and timezone
- Upload organization-level logo (used as default across shops)
- Delete organization (requires typing org name to confirm; exports data first)

### E2-02 Shop Management

**Add Shop**
- Self-served — fill form, shop is instantly active
- Fields: shop name, location/branch, phone number, optional shop-specific logo
- Extra shop billing kicks in automatically via Stripe (prorated)
- New shop inherits organization brand kit by default

**Edit Shop**
- Edit any shop detail at any time
- Toggle shop-level brand kit override (inherit from org vs custom)

**Deactivate / Reactivate Shop**
- Deactivated shops stop generating content but data is retained
- Billing pauses for deactivated shops (prorated credit)

**Remove Shop**
- Requires confirmation
- All offer books and analytics for that shop are retained but archived
- Stripe prorates remaining days as credit

### E2-03 User Management

**Invite User**
- Org Owner or Shop Manager can invite via email
- Invite email contains a signup link (expires 48hrs)
- User sets own password on accepting invite
- Invited user is assigned a role at invite time

**Roles**

| Role | Scope | Permissions |
|---|---|---|
| Owner | Organization | Full access — billing, shops, users, all content |
| Manager | Shop(s) | Full control of assigned shops, invite editors |
| Editor | Shop(s) | Create and edit offer books, cannot change brand |
| Viewer | Shop(s) | Read-only — view offers and analytics |

**Manage Users**
- Change a user's role
- Remove a user from the organization
- Resend expired invite
- View last active timestamp per user

### E2-04 User-Shop Access Control

- Owner sees all shops automatically
- Manager and Editor are assigned to specific shops
- One user can have access to multiple shops with the same or different role per shop
- Access changes take effect immediately

### E2-05 Shared Brand Kit

Organization-level brand kit is the default for all shops.

Each shop can:
- Inherit everything from org (default)
- Override logo only
- Override colors only
- Full override (completely independent brand)

Override level is set per shop in shop settings.

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Settings pages use a sidebar nav layout (org settings, shops, users, billing)
- Shop list shows status badge (active / inactive), branch count, last offer date
- User list shows role badge, invite status (pending / active), last active

---

## Backend Notes

- Row-Level Security (RLS) on all tables — enforced at DB level, not just app
- Every table includes `organization_id` for tenant isolation
- Shop add/remove triggers Stripe subscription item update via webhook
- Role checks performed server-side on every API route — never trust client-sent role

---

## Database Tables

```
organizations
shops
users
user_shop_access
```

---

## Out of Scope

- SSO / directory sync (Enterprise — later)
- Department-level grouping within org
- Custom roles (fixed 4-role system for now)
