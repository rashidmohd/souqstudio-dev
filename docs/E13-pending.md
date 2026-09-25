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
| Library block authoring | `/blocks/new`, `/blocks/[id]/edit` (the shared designer), `lib/library-drafts.ts`, six routes under `/api/v1/admin/blocks`. See §2c. |
| Prompt management | `/prompts`, `/prompts/[id]`, `/prompts/new`, two routes |
| Overview | `/` — counts, and what is off on this deployment |
| Primitives | `components/ui/` — nine components, built against the tokens directly |

Thirty-five tests across `ip-allowlist`, `block-summary`, `prompt-schema` and
`admin-roles`.

**The role gate is verified live**, not only by unit test. Against a real `support_agent`
account: the four read screens answer 200, `/prompts` and `/catalog/new` bounce to
`/?denied=1`, and all four write routes answer 403 naming both roles. A refused write
created nothing. Setting `isActive` false ended that session on the next request with the
session row untouched, which is the behaviour the re-read exists for.

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

### 2c. SouqStudio designs library blocks with the shop app's designer

*Rewritten 23 September 2026. This section used to say the console describes blocks and
does not draw them, and that extracting the painter into a package was worth doing as its
own task. That task is done.*

The designer (~7,600 lines over twenty components), the painter `draw.tsx` and everything
they import moved from `apps/web` into **`packages/designer`**, with the same folder layout.
`apps/web` imports it from there and behaves as before; `apps/admin` mounts the same
component at `/blocks/[id]/edit`. There is still exactly one painter.

**What differs between the two hosts is data, not code.** `DesignerHost`
(`packages/designer/lib/designer-host.tsx`) carries the save, create, shape and artwork
routes, the way out, whether the author may set availability, and the read-only note. Its
default is the shop app's routes, so `apps/web` mounts the designer with no provider.

**A library draft is a `blocks` row with `organizationId: null` and `status: 'draft'`.**
Three readers depend on that and each was changed to say so:

- the library sync's prune skips drafts (`packages/db/src/library-sync.ts`), because a draft
  is in no library by definition and would otherwise be deleted by the next sync;
- `loadBlock` in `apps/web` refuses a platform draft, so a shop cannot open one by id;
- the shop picker already listed only `published` platform rows.

The admin save route drops `status` from the body, so a draft cannot be made "published" from
the designer: that would reach every shop without a publish, then be pruned by the next sync.
Publishing copies the draft into R2 under a `blk_` id and the sync writes that as its own row;
the draft stays the working copy.

**Seasonal blocks carry their occasion (25 September).** A draft's block page has an
occasion picker; publish writes `occasion` into the library document; the engine's loader
reads it (optional, refused if the calendar does not know it); the sync prefers it over
`BLOCK_OCCASION`, which now only covers documents published before this. The repo's
`blocks:publish` writes the map's occasion into each document too, so R2 is self-describing.

**Library artwork is hidden from shops until a published block uses it (25 September).**
Admin uploads go under `library/blocks/`; `listAssets` in `apps/web` shows one of those only
if a published platform block's document names it (`referencedAssetIds`). Seeded artwork is
outside the prefix and unaffected. The object URL itself is public but unguessable.

**Not done, and worth knowing:**

- **Run end to end locally, not on a deployment.** On 23 and 25 September both apps ran
  against a throwaway Postgres and the dev bucket, with the library prefix overridden to
  `library/e2e-test`: draft, save, the refusals, shape and artwork upload, occasion,
  publish, sync (drafts kept, 66 stale blocks pruned) and the artwork gate all behaved. Not
  yet exercised: the designer in a real browser, and any of it on a Railway deployment,
  where no service sets `BLOCK_LIBRARY_URL` yet.
- **No thumbnail is written** for a draft, so `/blocks/[id]` still shows none until something
  renders one.
- **A draft cannot be retired from the panel.** Drafts reach nobody, so they only clutter
  the console; an archive action is the next thing to add if that starts to matter.

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

### 3b. E13-02, the image half — **built 23 September**

The product screen shows every image, replaces one, re-runs background removal and
reviews a matte. `lib/r2.ts` signs the PUT, `POST …/images` records the object and queues
`bg.remove`, `POST …/images/[id]/recut` is the manual re-run, and
`PATCH …/catalog/images/[id]` approves or rejects.

Four decisions in it:

- **The bytes never pass through the panel.** A presigned PUT straight to R2, the shape
  E5-04 already uses, because a serverless body cap is well under the 10 MB a phone camera
  produces.
- **The cutout is queued on upload, not offered as a choice.** E5 §3 makes removal an
  ingest stage; a photo that arrives on white stays on white unless something asks.
- **Nothing is charged.** The shop-owner route checks a credit balance because a tenant is
  spending. An admin improving the shared catalog is not a tenant and there is no
  organization to bill.
- **A checkerboard behind every thumbnail.** A cutout on white and an uncut photo on white
  are indistinguishable, and telling them apart is the one thing this screen exists for.

**What is still unbuilt in E13-02:** bulk CSV import, synonym editing, AI enrichment
triggers, and duplicate detection by name similarity — the pg_trgm indexes exist and
nothing calls them.

**The catalog has 1,000 originals and zero cutouts.** Background removal has never run
against it, which is what the re-run button is for.

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
- **E13-04 says "same as E7 features, accessed here".** Since 23 September it is: the
  panel mounts E7's designer from `packages/designer` over SouqStudio's library drafts,
  and publishes from the block page. See §2c.
- **The epic does not mention prompt management.** It is here because the gap is real:
  `cover_prompts` moved out of code in September specifically so the art direction could be
  tuned by looking at what came back, and until now the rows were tunable in principle and
  editable only with SQL.
