# The block library, loaded from R2

*A design note on a proposal, not a plan of record. Written 9 September 2026.*

> **Status, 10 September 2026 — §2b is built, end to end.** Steps 1 to 6 of §8
> exist. The commitment §7 advised against was made deliberately and with the
> reasons on the record; this note is kept as the argument that was had rather
> than rewritten to agree with the outcome. §10 records what was decided and
> what it cost.
>
> The library is published to R2 by `pnpm --filter @souqstudio/engine
> blocks:publish`, read from there by the seed and by `POST /api/v1/library/sync`,
> and a single design is published by `POST /api/v1/library/publish`. Where
> building it proved this note wrong, the correction is marked.

**The proposal:** block documents are JSON files. Ours are a library; when a shop
imports one it is written into that shop's own folder. R2 holds them.

This note takes it seriously, separates two very different versions of it, and
says what each would cost. It ends with a recommendation and — more usefully —
the one seam worth building now so that choosing R2 later stays cheap.

---

## 1. The constraint everything must respect

**The library has exactly one writer: `pnpm db:seed`.**

```
SEED_BLOCKS (code)
      │
      ├─ upsert by id          — a block that changed is updated in place
      └─ pruneSeededBlocks()   — a seeded block its source no longer lists is
                                 archived if a book uses it, deleted if not
```

It runs on **every deploy**, from Railway's `preDeployCommand`.

Two consequences, and they decide most of this document:

- **Writing a block straight into the database does not work.** It has no id in
  `SEED_BLOCKS`, so the next deploy deletes it. Any route that "publishes to the
  library" by inserting a row is building something the seed will undo.
- **The question is not where blocks are stored. It is what `SEED_BLOCKS` reads
  from.** Everything downstream — upsert, prune, archive-if-in-use, the picker,
  plan gating — is indifferent to that source.

---

## 2. Two proposals wearing one name

### 2a. R2 at **render** time

The app fetches a block document from R2 when it needs to draw one.

**No.** Four things break, and they are not tuning problems:

1. **Atomicity.** A save is one `prisma.$transaction` — update `blocks`, insert
   `block_versions`, both or neither. Split across a row and an object it becomes
   two writes that can disagree, with no rollback. Version history becomes
   "objects that may or may not exist".
2. **Queryability.** Listing by org and status, the plan gate, `usesOnlyRoles`,
   and any future *which blocks use this asset* need the document. JSONB is
   queryable where it sits; objects are not.
3. **Latency, multiplied.** A page needs every block it uses. One query today; N
   round-trips otherwise, or a cache with an invalidation problem you now own.
4. **`assetResolver`'s promise.** A block document resolves to a URL by string
   concatenation, with no lookup, so the render path holds no database. Fetching
   the *document* over the network puts I/O back in the one place that was kept
   clean for the export worker's sake.

### 2b. R2 as the **distribution channel**

R2 holds the library as files. The seed reads them and writes rows. Rendering
still reads Postgres and nothing about section 2a applies.

**This is the real proposal**, and it is viable. The rest of this note is about
it.

---

## 3. What it would actually look like

```ts
// packages/engine/src/library.ts
export const SEED_BLOCKS: SeedBlock[] = [
  ...CARD_BLOCKS,      // generated: 17 structures × skins
  ...PANEL_BLOCKS,
  ...SEASONAL_BLOCKS,
  ...AUTHORED_BLOCKS,  // ← the new arm: documents, from wherever
]
```

**The generated blocks stay generated.** The thirty-three offer cards are
seventeen structures times a skin, on purpose — `E7-pending.md` §8 records that
thirty hand-drawn cards would have drifted apart inside a month. Turning them
into files would undo that. What files are good for is the *individual* designs:
the ones somebody drew once because they wanted exactly that.

So the change is additive, and it has one seam: **where `AUTHORED_BLOCKS` comes
from.**

| | committed files | R2 |
| --- | --- | --- |
| loader | `import` a folder of JSON | fetch a manifest, then the documents |
| publish a design | commit + push | upload |
| review before every shop sees it | a diff, free | you build it |
| rollback | `git revert` | re-upload the old file, if you kept it |
| per environment | branches, free | bucket prefixes you design |
| the render harness | works offline | needs a fetch or a cache |
| **removes the deploy?** | no | **not on its own** — see §4 |

---

## 4. R2 does not remove the deploy by itself

The seed is what writes the library, and the only thing that runs the seed is a
deploy. Publishing to R2 changes *what the seed reads*; it does not change *when
the seed runs*.

To actually get "ship a design without a release" you also need a way to re-run
the library sync — a job, a cron, or an admin action. That is not difficult, but
it is part of the cost rather than something R2 gives you free, and it brings its
own questions: who may trigger it, what happens when it half-fails, and what the
picker shows while it is running.

---

## 5. What it would cost, itemised

**A trust boundary.** Anything that can write that prefix can put a block
document in front of every shop on the platform. Blocks are *drawn*, not
executed, so the blast radius is bad design rather than code execution — but it
is a new write path into every tenant, and it wants the same care as one.

**Validation moves to load time.** A committed file is checked by CI before it
merges. An uploaded one is checked when the seed reads it, which is during a
deploy or a sync — a bad document fails the thing that was running rather than
the thing that produced it. `arrangementsSchema` and `usesOnlyRoles` are the
checks; where they run is what changes.

> **Half-built, and the remaining half is a real cost.** `usesOnlyRoles` moved
> into the engine (`src/roles.ts`) and the loader enforces it, along with the
> structural bar, the no-warnings bar, and id uniqueness — every refusal names
> the file and says what is wrong with it. `arrangementsSchema` did **not** move:
> it is 250 lines of zod in `apps/web`, and the engine has no zod. So the loader
> checks the skeleton, not every per-kind field. Two schemas is one too many, and
> unifying them is a genuine prerequisite for step 5 rather than an afterthought —
> the further the source moves from the repo, the more the loader is the only
> thing standing between a bad document and every shop.

**Environments.** Which prefix does dev read? Production? Get it wrong once and a
half-finished design is in every shop.

**The harness.** `packages/engine/harness` renders the library to look at it, and
it is the only thing that does. Behind a fetch it stops being the cheap local
check it is now.

**A client-bundle problem, today.** ~~`SEED_BLOCKS` is imported by
`BlockImportDialog`, which is `'use client'`~~ — **fixed, 9 September.** It was
real: a production build put `"Ramadan Kareem"` — the text of a seeded block,
not its name — inside a 72 KB client chunk, downloaded by anyone who opened the
designer, to answer *which category is this id*.

**It took two changes, not one, and the second is the interesting one.** Dropping
the `SEED_BLOCKS` import was not enough: `BLOCK_CATEGORIES` lived in `library.ts`
too, so importing the five category *words* still dragged the fifty-nine
*designs* in behind them. A vocabulary and a collection of documents in one
module cannot be told apart by a bundler. They are `block-category.ts` and
`library.ts` now.

Measured after: `/brand/blocks` 146 kB → 132 kB First Load JS,
`/card-designer/[blockId]` 172 kB → 159 kB, and no library bytes in any client
chunk.

**And it forced a column.** The picker needs the category; the server had to
send it; the server learned it by importing the library. Once the library is a
*loaded document* the app cannot ask it at all, so `blocks.category` exists —
written only by the seed, exactly like `occasion` a day earlier. That is the
shape of every "the app can no longer ask the library" question this proposal
raises, and it is worth noticing that the first one appeared immediately.

---

## 6. What it buys

**Publishing designs without touching the repo.** That is the whole of it, and it
is not nothing — the library *is* the product's value, and a seasonal band has a
deadline that a release freeze does not care about.

Whether that is worth the list in §5 depends on one number nobody has yet: **how
often does the library actually change?** If it is weekly, deploy friction is a
real tax. If it is a few times a year, the pipeline is a thing to maintain
between uses.

---

## 7. Recommendation

**Committed files now, built so R2 is a small step later.**

Add `AUTHORED_BLOCKS` as a *loader* rather than as a list. Today it reads a
folder of committed JSON; swapping it to read R2 later changes one function, and
upsert, prune, archive-if-in-use, the picker and plan gating are untouched.

> **Correction, having built it: "changes one function" is true only because the
> loader was made async on day one.** `SEED_BLOCKS` was consumed at module scope
> in four places, and a synchronous file loader would have worked perfectly well
> in all four and then had to be unpicked from every one of them the day the
> source became a network. The four were resolved differently, on purpose: the
> seed awaits, the harness uses top-level await, `library.ts`'s own two lookups
> only ever need the *generated* arm and stay synchronous, and the web app
> stopped reading the library altogether — it reads the row, which `pnpm db:seed`
> rewrites on every deploy.
>
> That last one retired `starterFor`, and **took a latent bug with it**: a
> `SeedBlock` has no `locked` field, so `'locked' in source` in
> `POST /api/v1/blocks` was false for every seeded block, which is the only kind
> the plan gate exists to gate. Nothing was reachable, because every seeded row
> takes the `planTier` default of `starter` — but marking one block `pro` would
> have drawn a padlock in the picker and imported it anyway. Both copy paths go
> through `loadBlock` now, so the gate is structural.

That gets the thing you actually asked for — **authoring blocks without writing
TypeScript** — immediately, keeps review and rollback for free, and leaves the
R2 decision genuinely open rather than foreclosed.

Revisit when either of these becomes true:

- the library changes often enough that waiting for a deploy is the bottleneck;
- someone who should not need repo access is making the designs.

The second one has a prerequisite that is bigger than the storage choice:
`apps/admin` is a scaffold — one health-check file, empty route directories, no
login. Anyone publishing to the library needs to be authenticated as an admin
first, and that is E13.

---

## 8. If you choose R2 anyway, build it in this order

1. ~~**The loader seam.**~~ **Done.** `packages/engine/src/library-source.ts`.
   Async from the first day — see the correction in §7 for why that is the whole
   of the cheapness. Node-only and deliberately absent from `src/index.ts`, so
   nothing in a browser build can reach it and the R2 version stays possible.
2. ~~**Get the library out of the client bundle.**~~ **Done**, and it wanted the
   category on the row rather than a map passed down. See §5.
3. ~~**An export.**~~ **Done.** `GET /api/v1/blocks/{id}/export` returns the file
   itself rather than the `{ data, error }` envelope — a document you have to
   unwrap by hand is the friction the route exists to remove — and refuses a
   block that names a colour by value, because the library has rules an owner's
   own block does not. A test writes all fifty-nine generated blocks out through
   the file format and loads them back, which is what keeps the export and the
   loader agreeing.
4. **A manifest format** — a list of documents with ids and a version, so the
   loader fetches one file to know what exists.
5. **Point the loader at R2**, with an explicit per-environment prefix.
   `loadLibrary(from)` already takes the source as an argument, which is how the
   tests point it at a temp folder — a prefix goes in the same place. **The open
   cost here is validation, not plumbing:** see §5.
6. **A sync trigger**, so publishing does not wait for a deploy.
7. **Admin auth (E13)**, before anyone but you can publish.

Steps 1 to 3 were useful on their own and were not bets on this design; that is
why they were the ones built. **Step 4 is where the commitment starts, and
nothing above it commits to anything.** What steps 1 to 3 bought, whatever
happens next, is that a design can be authored without writing TypeScript today.

## 8a. What is still not true

- **Nothing has been authored yet.** `packages/engine/blocks/` holds its README
  and no documents. The path is proven by tests rather than by use.
- **No UI exports a block.** The route exists; nothing in the designer calls it.
  Today it is a URL you open.
- **The seed has not run against a live database** with the `category` column.
  The migration and the backfill are written; typecheck, the loader and the
  harness are what has actually been exercised.

---

## 9. Related

- `docs/block-templates.md` — how a block reaches a page today.
- `docs/authoring-a-block.md` — what may go in a block document.
- `docs/E7-pending.md` §20 — the asset table, and why `assetId` stayed an R2 key
  rather than becoming a row id. Same reasoning as §2a here, reached from the
  other direction.

---

## 10. What was actually built, and what it cost

*Added 10 September 2026, after §2b was built.*

§7 recommended committed files and named two triggers for revisiting. Neither had
fired. The decision to go to R2 anyway was made explicitly, so what follows is
the record of what that bought and what it now costs — not a retro-justification.

### The shape

```
pnpm blocks:publish ─┐                        ┌─→ pnpm db:seed (every deploy)
  generated in TS    ├─→ R2: <prefix>/        ├─→ POST /api/v1/library/sync
  + blocks/*.json    │     manifest.json      │     (no deploy needed — §4)
                     │     blk_*.json  × 59   │
POST /library/publish┘                        └─→ syncLibrary() → blocks table
  one row → one object                              upsert + prune → every shop
```

**Postgres is still what rendering reads.** §2a stayed dead: the render path has
no network in it, a save is still one `prisma.$transaction`, and `assetResolver`
still resolves by string concatenation. R2 is the distribution channel and
nothing else — which is exactly what §2b proposed.

**`BLOCK_LIBRARY_URL` decides the source, per environment, explicitly.** Unset is
the repo — a complete library, which is what a laptop and the harness get. Set
means R2 is the source of truth and the compiled-in library is not consulted at
all. §5 asked which prefix dev reads; the answer is that nothing in the code
guesses, because a path assembled from `NODE_ENV` is one typo away from a
half-finished design in every shop.

### The costs §5 named, as they actually landed

**The trust boundary is real and is held by a shared secret.** `LIBRARY_PUBLISH_TOKEN`,
checked in constant time, never a session and never a role. The highest role this
app has is the owner of one organization, and publishing here reaches every
organization — so `requireOrgRole` is the one thing this must never become. That
is a placeholder for E13 and is written down as one in `lib/library-auth.ts`.

**Validation did have to move, and it moved.** §5 said the checks were
`arrangementsSchema` and `usesOnlyRoles` and that only their location changed.
That was too kind to the earlier state: the loader had a hand-written skeleton
check, and `arrangementsSchema` — the real one — was 250 lines of zod stranded in
`apps/web`. It is `packages/engine/src/document.ts` now, and the loader runs it.
One definition of a legal block document, three doors into it: the `PATCH` route,
a committed file, an object from the bucket.

**The harness still works offline.** §3's table predicted it would not. It does,
because unset `BLOCK_LIBRARY_URL` is the repo rather than an error.

**§4 was right, and the sync route is the answer to it.** R2 changed what the
seed reads and not when it runs. `POST /api/v1/library/sync` is the missing half,
and publishing is deliberately two steps — write the object, then give it to
everybody — so that three designs are three writes and one sync, and so the two
decisions are separately reversible.

### The one property everything rests on

**A short read must never be mistaken for a withdrawal.** The prune archives a
seeded block a book uses and deletes one it does not, so a manifest that fetched
while a document 500'd looks exactly like *"that block was removed"* — and a CDN
hiccup would take blocks out of every shop on the platform.

So the load is all-or-nothing and refuses before a single row is written: a
missing document, a manifest whose count disagrees with its own list, an empty
manifest, a document that is not the block the manifest named. Verified against
the real bucket by deleting one object and loading:

```
library: 1 of 59 documents could not be fetched from
https://blocks-dev.souqstudio.com/library/test/ (blk_footer).
Refusing to seed a partial library: the prune would treat every one of
them as removed and take it out of every shop.
```

A deploy that fails loudly is recoverable. A prune that ran against a partial
library is not.

### What is still not true

- **Nothing is published to a production prefix, and no deployment reads one.**
  `BLOCK_LIBRARY_URL` is unset everywhere, so today every environment still seeds
  from the repo. Going live is §11.
- **One writer, assumed rather than enforced.** `publishDocument` read-modify-writes
  the manifest, so two publishes landing together can lose one. Survivable while
  the token means there is exactly one publisher; the first thing that must
  change if publishing opens up. E13.
- **No UI publishes.** Both routes are `curl`. The designer has an action bar
  with room in it.
- **Admin auth (E13) is still step 7** and still unbuilt. Until it exists, the
  token *is* the admin.

---

## 11. Going live

Nothing below has been done. Each step is reversible by undoing the one before.

1. **Publish to a real prefix.**
   `pnpm --filter @souqstudio/engine blocks:publish -- --prefix library/production --dry-run`
   first; it prints the manifest and writes nothing.
2. **Check the objects are there** before anything reads them —
   `<R2_PUBLIC_URL>/library/production/manifest.json` should list 59.
3. **Set `BLOCK_LIBRARY_URL`** on that environment to the same prefix. The seed
   logs which source it used on every deploy, so a wrong prefix is visible in the
   deploy log rather than three weeks later.
4. **Set `LIBRARY_PUBLISH_TOKEN`** — 32 characters minimum, or the routes refuse
   to exist. Without it, publishing stays a laptop job, which is a legitimate
   place to stop.
5. **Deploy.** `preDeployCommand` runs `db:migrate && db:seed`; the seed now
   reads the bucket and will fail the deploy rather than seed a partial library.

**The one-line rollback is unsetting `BLOCK_LIBRARY_URL`.** The compiled-in
library is complete and still there, so the next deploy seeds from the repo and
the bucket becomes irrelevant. That is the property worth keeping — do not remove
the generated arm from the code.

---

## 12. Stricter validation is a breaking change to a published library

*Added 10 September 2026, after it took the dev deploy down.*

`parseSeedBlock` refuses a shipped block that draws **any** warning. That is the
right bar — §10 argues it — and it has a consequence nothing said out loud until
it happened: **the set of warnings is part of the published contract.** Add a
check to `validateBlock` and every object already in the bucket becomes
un-loadable, without anything in the bucket changing.

What that looks like in practice, because it does not look like what it is:

```
Railway says:  build failed
Actually:      the build passed; `preDeployCommand` ran `db:seed`, which read R2
The log says:  library: blk_offer_card.json is not a block document —
               it draws with warnings (duplicate-tier, …)
```

`duplicate-tier` was added the same afternoon the shipped library was fixed to
stop drawing the promo tier twice. The repo was correct and the bucket held the
designs from before it. The seed refused them, correctly, and the deploy failed.

**So a validation change and a republish are one change, in this order:**

1. Make the code change and let the tests pass.
2. `pnpm --filter @souqstudio/engine blocks:publish -- --prefix <the environment's>`
3. *Then* deploy.

Doing 3 before 2 fails the deploy every time. There is no way to make the two
independent — a stricter reader and an older library genuinely disagree — so the
sequencing is the mitigation, the same as it is for a database migration. The
loader's refusal now names the republish, because the person reading it is
looking at a red deploy log rather than at this file.
