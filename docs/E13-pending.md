# E13 — working notes

What was built, what it does not yet do, and the decisions that were forced by building it.
`docs/E13-admin-panel.md` stays the record of what was asked for; this file is the record
of what happened.

Written 22 September 2026, on the first build of the panel. Before this the app was a
scaffold: an env module, a fonts module, a stylesheet, a health route and six empty
directories. `admin_users` and `admin_audit_logs` had existed since the baseline migration
and nothing had ever read either one.

---

## 1. Built

| Piece | Where |
| --- | --- |
| Staff sessions | `admin_sessions` table, `lib/admin-session.ts`, `POST /api/v1/admin/auth/{login,logout}` |
| Role vocabulary | `lib/admin-roles.ts` — pure, client-safe |
| Authorization | `lib/admin-auth.ts` — `requireAdmin`, `requireAdminRole`, `requireAdminApi` |
| IP allowlist | `lib/ip-allowlist.ts` + `middleware.ts`, 16 tests |
| Audit log | `lib/audit.ts`, sole writer, plus `/audit` |
| Account creation | `pnpm --filter @souqstudio/db admin:create` |
| Catalog | `/catalog`, `/catalog/[id]`, `/catalog/new`, two routes |
| Block library console | `/blocks`, `/blocks/[id]`, `lib/library-client.ts`, two routes |
| Prompt management | `/prompts`, `/prompts/[id]`, `/prompts/new`, two routes |
| Overview | `/` — counts, and what is off on this deployment |
| Primitives | `components/ui/` — nine components, built against the tokens directly |

Thirty-one tests across `ip-allowlist`, `block-summary`, `prompt-schema` and `admin-roles`.

---

## 2. The three decisions worth not undoing

### 2a. A session table, not a signed stateless cookie

The scaffold's `ADMIN_SESSION_SECRET` implied a stateless cookie. The variable stayed and
its job changed.

A staff session reaches every organization on the platform, so "log this person out now"
has to be a fact about the system rather than a wait for an expiry. That is the same
argument `references/auth.md` makes for shop owner sessions, and it is stronger here.

The secret now keys the stored hash — HMAC-SHA256 rather than the plain SHA-256
`apps/web` stores. **That is not a cryptographic upgrade**: a 256-bit CSPRNG token has no
dictionary to attack and the plain hash was already sound. It buys one operational
control, which is that rotating the secret invalidates every staff session at once, with
no migration and no deploy touching the database. That is the break-glass action an admin
panel wants after a laptop goes missing, and the shop owner session layer has no use for
it.

`isActive` on `admin_users` is the second half: the admin row is re-read on every request,
so switching somebody off ends their session immediately rather than at the next login.

### 2b. Publishing calls `apps/web`, it does not write R2

`apps/web/lib/library-auth.ts` says `LIBRARY_PUBLISH_TOKEN` is "a placeholder for E13's
admin auth". This is what replaces the placeholder — but by becoming the token's *holder*,
not by reimplementing what it guards.

`apps/web/app/api/v1/library/` owns what a published block is: the document schema, the
manifest, the refusal when a block draws a validation warning, and the loader's rule that
a short read is indistinguishable from a withdrawal. A second implementation here would
mean the library means one thing after a publish from the panel and another after a
publish from a script. `docs/block-library-from-r2.md` §12 records what that costs: a
mismatch took the dev deploy down on 10 September and Railway reported it as a failed
build when the build had passed.

So the panel holds the token server-side and gates it behind a staff session and the
super admin role. The token stops being the credential and becomes the transport.

**Publish and sync stay two buttons**, because they are two decisions. Publishing writes
an object and changes nothing any shop sees; syncing gives the library to everybody and
prunes. Three blocks should be three writes and one sync.

### 2c. The console describes blocks, it does not draw them

`/blocks/[id]` shows arrangement counts, aspect ranges, bindings, and the stored thumbnail
where there is one. It does not render the block.

`apps/web/components/blocks/draw.tsx` is the one painter four surfaces share, and CLAUDE.md
is repeated and explicit that a second painter is how the PDF stops matching the screen.
The designer around it is ~7,200 lines over twenty components with about thirty imports
from `apps/web`'s own `lib/` and `components/ui/`. Bringing a preview here means either
copying that, which *is* the second painter, or extracting the painter and its dependencies
into a package.

**The extraction is worth doing and should be its own task.** It is the same work that a
shared `packages/ui` would need, and E9's export will want the painter outside `apps/web`
regardless. Until then the description is honest about being a description, which is more
useful than a picture drawn by a second renderer would be.

---

## 3. Not built

Listed so nothing here is mistaken for an oversight.

### 3a. E13-01, the organization half

`/organizations` is an empty directory. Search, detail, plan changes, credit adjustments,
suspension, and **impersonation** are all unbuilt. Impersonation is the one with a real
design question in it: it issues a session for a target org, which means `apps/admin`
writing to `sessions` — the table `apps/web/lib/session.ts` documents itself as the sole
writer of. That rule exists because rotation and theft detection stop being trustworthy
the moment a second writer appears. Either impersonation goes through a route in
`apps/web` that this app calls, the same shape §2b uses, or the rule changes deliberately.
It should not be decided while building a screen.

**The 2FA lockout gap in the root CLAUDE.md is still open.** An owner who loses both their
device and their backup codes needs a Super Admin action that does not exist here yet.

### 3b. E13-02, the image and enrichment halves

Bulk CSV import, image upload, the matte review queue (`image_assets` with
`reviewState = PENDING`), synonym editing and AI enrichment triggers are all unbuilt. The
product detail screen says so where the absence would otherwise read as "this product has
no images".

Duplicate detection is barcode equality only. E13-02 asks for name similarity over
pg_trgm at 85%, which the trigram indexes support and nothing calls.

### 3c. E13-03, E13-05, E13-06 and E13-07

The contribution review queue, credit and billing oversight, analytics and broadcasts are
all unbuilt. The overview shows counts rather than E13-06's metrics deliberately: exports
by format, link views and product clicks are aggregations over tables E10 and E11 are
still filling, and a dashboard of zeroes reads as a broken dashboard rather than as an
unstarted epic.

### 3d. Rate limiting

None, on any route here, including login. It is the same gap the root CLAUDE.md records
for `apps/web`, and the IP allowlist is doing the work in the meantime. Do not mistake the
allowlist for a throttle: it is a network control and says nothing about how fast a request
from inside the network may arrive.

---

## 4. Corrections to the epic

- **E13 asks for shadcn/ui.** `components/ui/` here is nine hand-built primitives instead.
  Every shadcn component needs its shadows stripped and its radius corrected before it
  fits, and this app needs a fraction of the set. Bring in the bridge when something
  genuinely wants a dialog or a combobox.
- **E13 asks for TanStack Table and Tremor.** Both are in the dependencies and neither is
  used. Every list here is filtered and paged on the server, because the universal catalog
  is already 18,428 rows from one import and a client-side table would need all of them in
  the browser to filter any of them. Tremor waits on E13-06 having something to chart.
- **E13-04 says "same as E7 features, accessed here".** It is not the same: E7's designer
  is where a block is drawn, and this is where one is published. See §2c.
- **The epic does not mention prompt management.** It is here because the gap is real:
  `cover_prompts` moved out of code in September specifically so the art direction could be
  tuned by looking at what came back, and until now the rows were tunable in principle and
  editable only with SQL.
