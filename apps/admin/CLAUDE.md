# apps/admin

Next.js 14 App Router. Internal SouqStudio team tool.
Not customer-facing. Access restricted to SouqStudio staff only.

Epic: `docs/E13-admin-panel.md`. What is built and what is not:
`docs/E13-pending.md`.

---

## Directory structure

```
apps/admin/
├── app/
│   ├── layout.tsx               # Document, fonts. No rail — see below.
│   ├── login/                   # The only screen reachable without a session
│   ├── (panel)/                 # Everything behind a session
│   │   ├── layout.tsx           # The rail, and the session read that feeds it
│   │   ├── page.tsx             # Platform overview
│   │   ├── catalog/             # E13-02 — product list, detail, add
│   │   ├── blocks/              # E13-04 — library console, publish and sync
│   │   ├── shapes/              # E13-04 — the shape gallery every designer offers
│   │   ├── prompts/             # Cover art direction, editable
│   │   ├── audit/               # E13-01 — every admin action
│   │   ├── organizations/       # E13-01 — not built
│   │   ├── contributions/       # E13-03 — not built
│   │   ├── templates/           # E13-04 grids — not built
│   │   ├── analytics/           # E13-06 — not built
│   │   └── broadcasts/          # E13-07 — not built
│   ├── (designer)/              # Full-window screens, no rail
│   │   └── blocks/[id]/edit/    # The block designer, over a library draft
│   └── api/
│       ├── health/              # Liveness. Outside the IP allowlist.
│       └── v1/admin/            # Admin-only API routes
├── components/
│   ├── ui/                      # The primitive set. Hand-built, not shadcn.
│   ├── auth/ catalog/ blocks/ prompts/
│   └── shared/                  # AdminRail, PageHeader
├── lib/
│   ├── env.ts
│   ├── admin-roles.ts           # The vocabulary. No server-only: the rail reads it.
│   ├── admin-session.ts         # Sole writer to admin_sessions
│   ├── admin-auth.ts            # requireAdmin, requireAdminApi, role gates
│   ├── audit.ts                 # Sole writer to admin_audit_logs
│   ├── ip-allowlist.ts          # Pure, Edge-safe. Imported by middleware.
│   ├── library-client.ts        # Calls apps/web's library routes
│   ├── catalog-list.ts  catalog-schema.ts
│   ├── block-summary.ts  prompt-schema.ts
│   └── api.ts  password.ts  utils.ts
└── middleware.ts                # IP allowlist + session cookie presence
```

**`(panel)` is a route group, so the URLs are unchanged** — `(panel)/catalog`
still serves `/catalog`. It exists because the login screen has to render
without the rail and a root layout cannot know which route it is wrapping.

---

## Access control

- Admin users are in `admin_users` — completely separate from `users`. This app
  never reads `users`; `apps/web` never reads `admin_users`. The separation is
  the app boundary, not a role column, and it is what stops a leaked customer
  password becoming staff access.
- **There is no sign-up and deliberately no bootstrap route.** Accounts are
  created from a shell: `pnpm --filter @souqstudio/db admin:create -- <email>
  <role> [name]`. A route that creates the first admin when the table is empty
  is a door that stays unlocked until somebody notices it.
- Sessions are rows in `admin_sessions`, 8 hours absolute and 1 hour idle, with
  no "remember me". `ADMIN_SESSION_SECRET` keys the stored token hash, so
  rotating it ends every staff session at once.
- `isActive = false` ends a session on the next request: the admin row is
  re-read every time.
- IP allowlist in middleware, before anything touches the database. Empty means
  every address, which the login screen says out loud.
- Roles: `super_admin` | `catalog_manager` | `support_agent`, and they nest.
  `roleAtLeast` is a rank rather than a capability map because every capability
  today falls into read / change the catalog / change what every shop sees. When
  one appears that breaks the nesting, make it a map.
- **Every mutation writes to `admin_audit_log`** through `lib/audit.ts`, which
  is the only writer. Called explicitly by the route, never by a Prisma hook:
  the log records intent, not statements. Failed publishes and syncs are logged
  too.

**Middleware is not authentication.** Next 14 pins it to the Edge runtime with
no opt-out, so Prisma cannot run there. Every page calls `requireAdmin()` and
every route calls `requireAdminApi()`, in Node. A present cookie proves nothing.

---

## Catalog rules

- **Archive, never delete.** A published offer book references the row and
  renders its name and cutout; deleting one breaks a flyer a shop already sent.
  There is no DELETE route and there should not be.
- The list spans both collections and says which one each row is.
- Everything created here is universal. Promotion runs private → universal and
  is its own action with its own audit entry; there is no field for creating a
  row inside a customer's private collection.
- Archive, restore and promote are separate actions from a field update, so each
  is legible in the audit log rather than buried in a diff of forty fields.
- Bulk import, image upload, the matte review queue, synonym editing and
  enrichment are **not built**. See `docs/E13-pending.md`.

---

## Block library rules

- **SouqStudio designs library blocks here, with the shop app's designer.**
  `@souqstudio/designer` is the one designer and the one painter; this app
  mounts it at `/blocks/[id]/edit` through `components/blocks/LibraryDesigner.tsx`
  and never reimplements it. Four surfaces render through one painter, and a
  second painter is how the PDF stops matching the screen. What differs from
  the shop app (routes, the way out, no availability control) is the
  `DesignerHost` passed in, not a fork.
- **A library draft is a `blocks` row with `organizationId: null` and status
  `draft`.** Shops never see it (`apps/web`'s picker and `loadBlock` skip
  platform drafts) and the library sync never prunes it. The save route forces
  `draft`: availability is decided by publishing, never from the designer.
- **Only SouqStudio's blocks open in this designer**, and only drafts are
  editable. A published library row is the sync's copy of R2 and is rewritten
  by the next sync, so it opens read-only with "Duplicate to edit". An
  organization's block is a customer's design and is never copied into the
  library or edited here.
- **Publishing a draft does not consume it.** The publish route copies the
  document under a permanent `blk_` id; the draft stays the working copy, and
  the next version is an edit plus a publish to the same id.
- Drafting and editing need `catalog_manager`; publishing and syncing stay
  `super_admin`. A draft reaches nobody, so the wider bar is only on the step
  that reaches every shop.
- Library artwork is under `library/blocks/` in R2 and recorded in
  `block_assets` with no organization, the same shape as SouqStudio's seeded
  artwork. Autosave audits once per 15 minutes per admin per draft, not per save;
  the documents themselves are in `block_versions`.
- Publishing calls `apps/web`'s `/api/v1/library/publish` and `/sync` rather
  than writing R2. One implementation decides what a published block is.
- **Super admin only.** Writing the library prefix reaches every shop on the
  platform, which is wider than any other action in this panel.
- Publish and sync are two buttons because they are two decisions. Publishing
  writes an object and changes nothing a shop sees; syncing gives the library to
  everybody and prunes.
- **Unpublish is the way a library block leaves**, super admin only. It takes
  the id out of the manifest and records it under `retired`, so `blocks:publish`
  cannot put a repo copy back (`--restore` does, on purpose). The next sync
  archives it where a book draws it and deletes it where nothing does. The
  last block in a library cannot be unpublished: an empty library prunes all.
- **Delete is for SouqStudio's drafts and archived blocks only**, and only when
  no book draws them (`blocksInUse` in `@souqstudio/db`, the prune's own check);
  otherwise it archives and says so. A published block is refused (unpublish
  and sync instead), and an organization's block is never deleted here. Drafts
  need `catalog_manager`, archived blocks `super_admin`.

- **Magic block, for the library.** `/blocks/new` → "From a picture" runs the
  worker's `ai.magicBlock` job with `organizationId: null`: the result is a
  library draft, nothing is charged, and the `ai_jobs` row has no organization
  (migration `…_ai_jobs_platform`, FK still RESTRICT). The panel is a queue
  *producer* only; the worker does the work. Needs `REDIS_URL` and the worker
  deployed with the null-organization path, and the result is shown as
  machine output.

## Shape gallery rules

- **A gallery shape is an outline, not a file.** `library_shapes.art` is the
  same `ShapeArt` a shop's own uploaded shape carries, read by the same
  `parseSvgShape` and validated by the engine's `shapeArtSchema`, and every
  shop draws it in its own palette. Multi-colour pictures belong in library
  artwork, not here.
- **Placing one copies it into the block**, so retiring a shape never changes a
  block or a book. There is no link from `blocks` to `library_shapes`, and
  there should not be.
- New shapes are drafts. Adding and renaming need `catalog_manager`; publishing
  and retiring need `super_admin`, the same bar as the block library, because a
  published shape is in every shop's designer. Every change is audited.
- **No delete.** `archived` is the off switch. The outline is not editable: a
  different drawing is a new shape.
- Shops browse it from "More shapes" in the designer, a dialog with groups and
  search (`ShapeGalleryDialog` in `@souqstudio/designer`), not as more rows in
  the panel, because it grows.

---

## Prompt rules

- `cover_prompts` rows are the only model instructions in the product that live
  in the database. Every other prompt is code in `apps/worker/src/lib/`.
- The seed only inserts a slug it has never seen, so tuning survives a deploy.
- **A slug never changes** — generated covers record the one they came from. A
  new slug is a new prompt and the old one is switched off.
- **No delete.** `isActive` is the off switch, because a prompt that produced
  bad covers is worth keeping to compare against its replacement.
- A scene is a photograph: a place, a person doing something, a light. It never
  says what the person wears, because the uniform comes from the character
  reference. The form warns on clothing words rather than rejecting them, since
  an apron on a rail is legitimate.

---

## Design

- Same `souqstudio-tokens.css` as `apps/web`, imported by `styles/globals.css`.
- **The primitives here are hand-built, not shadcn.** `components/ui/` holds
  nine small components against the design system directly. shadcn was not
  pulled in because every component it ships needs its shadows stripped and its
  radius corrected, and this app needs a ninth of the set. If it grows to want
  a real dialog or combobox, bring in the bridge then.
- More utilitarian density than the shop owner app. Tables are the primary UI.
- **No illustrations.** This is a dense working tool, not an onboarding
  experience, so `EmptyState` here carries no artwork.
- One scope zone in the rail, not two. Nothing here belongs to an organization.
- English only, and logical properties throughout anyway, so translating it
  later is not a rewrite.
- After UI work: `pnpm --filter @souqstudio/admin build && pnpm --filter
  @souqstudio/admin check:classes`. It reports sized utilities that generate no
  CSS, which this config's replaced scales make silent. The script itself lives
  in `apps/web/scripts/` and is shared rather than copied; move it to
  `packages/config` if a third app needs it.

---

## Forbidden here

Playwright, BullMQ `Worker` instances, Fabric.js, direct Resend sends, AI
provider keys, `--sq-tpl-*` tokens, and shop owner session auth. See
`project-structure` → "What is forbidden where".
