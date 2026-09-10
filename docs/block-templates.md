# How a block actually works

*Written 9 September 2026. The code is the authority; this is the map.*

> **`docs/composition-model.md` §3 is the spec; this is the built state.** That
> document decided what a block would be, across brand kits, pages, flow and
> pins. This one covers blocks alone, describes what the code does today, and
> carries what has been added since — the offer-tier binding, gradients, the
> shape kit, badge shapes, `block_assets`. Where the two disagree, the spec is
> the *intent* and this is the *fact*; a disagreement is a bug in one of them and
> worth resolving rather than reading past.

**First, the word.** There is no template. `templates` was a table that bundled a
look *and* an arrangement, and it was dropped when the composition model landed —
`docs/E7-pending.md` §1 has the autopsy. What replaced it is a **block**, and a
block is a much smaller idea: a rectangle of design that knows how to redraw
itself at whatever shape it lands in.

---

## 1. What a block is

A row in `blocks`, and one JSONB column doing the work.

```
blocks
  id
  organizationId   null = one we ship, set = one this shop authored
  name             what the owner calls it
  repeats          per product, or placed once
  arrangements     ← the document. Everything below is about this column.
  status           draft | published | archived
  planTier         starter | …  — the plan gate, inert today
  isSeasonal, activeFrom, activeTo
```

Everything visual is inside `arrangements`. The other columns are bookkeeping.

**`repeats` is the one distinction that changes the vocabulary.** A repeating
block renders once per offer and knows which one, so it may bind to product
fields. A block placed once has no product in scope, so those bindings do not
exist for it — not "are empty", do not exist. `validateBlock` refuses them.

---

## 2. The document

```
arrangements: Arrangement[]        1 to 6

Arrangement
  aspectMin, aspectMax             the shape range this layout is for
  elements: BlockElement[]         up to 40
```

**An arrangement is a layout for a range of shapes, not for a size.** A block
does not know whether it is 380px in a booklet cell or 1080px in a square post.
It knows it is currently about 0.7 as wide as it is tall, and it picks the
arrangement drawn for that.

Elements are one of six kinds:

| kind | draws | binds to |
| --- | --- | --- |
| `text` | a line, through the fit ladder | a product field, the shop, the **offer's tier**, or a typed string |
| `image` | a photo or artwork | the product's image, or an uploaded asset by key |
| `shape` | rect, ellipse, line, burst, ribbon, tag, flash, star, arrow | nothing |
| `chip` | the offer badge — none, pill, burst, ribbon or tag | the offer's tier |
| `priceMark` | the price | the offer's price |
| `logo` | the shop's mark | the brand kit |

Every element carries `id`, `box`, and optionally `rotation`, `opacity`,
`groupId`, `locked`.

---

## 3. The four rules the document obeys

These are the whole reason a block survives contact with a real catalog.

**Coordinates are fractions of the block, never pixels.** `box` is
`{ start, top, width, height }` in 0–1. `start` rather than `left`, so an Arabic
edition mirrors without a second layout. The same design is a booklet cell and a
square post because nothing in it knows a pixel.

**Colour is named, not written.** A `ColorValue` is a *role* the shop's kit fills
(`primary`, `surface`, `ink`), a *palette entry* by id, a *literal* hex, or a
*gradient* over those. A block we ship may only use roles — `usesOnlyRoles`
enforces it — which is what makes a seeded block look like whichever shop loaded
it. A block the shop authored has met them and may use all four.

**Product text is bound, never typed.** A text element says *what it shows*, and
the string arrives at render time. Nothing about a product is stored in a block.

**Overflow is declared, not discovered.** A long product name is the normal case,
not the edge case, so each text element says what an overlong string may suffer:
shrink down the scale, clamp to N lines, or truncate. The fit ladder runs either
way; this says where it is allowed to stop.

---

## 4. How a block reaches a page

```
a region on a page  →  a Rect
                       ↓
  pickArrangement(arrangements, aspectOf(rect))
                       ↓
  boxRect(element.box, rect, direction)   fractions → real coordinates,
                       ↓                  mirrored for an Arabic edition
  the painter draws each element
```

`resolveBlock` in `packages/engine/src/render.ts` is those three lines. Note what
is *not* in the path: no database, no network, no lookup. **A block document is
portable** — hand it a rectangle and a brand kit and it draws. That property is
load-bearing and section 7 is about protecting it.

**`pickArrangement` never fails.** It returns the nearest arrangement if none
covers the aspect, so a block always draws. That is deliberate — a missing card
is worse than an imperfect one — and it is why `validateBlock` warns about gaps
in coverage: the fallback is silent, so something has to say it out loud.

---

## 5. Ours and theirs, and what "import" does

`organizationId` is the whole distinction. Null is a block we ship; set is a
block the shop authored. **Same table, same schema, same renderer.**

The seeded library is **authored in code**, not in the database:
`packages/engine/src/library.ts` and its neighbours are one source that both
`pnpm db:seed` and the render harness read. That is why fifty-nine blocks cannot
drift from what the harness draws.

**Importing is copying, and it already puts the block in the shop's own space.**
`POST /api/v1/blocks` with `fromIds` reads the source, deep-copies
`arrangements`, and creates a **new row owned by the organization**, published
and unlocked. From that moment the two have nothing to do with each other: edit
the copy and the library is untouched; we ship a new version of the library and
the copy is untouched.

That is worth being precise about, because it is the thing people expect *not* to
be true yet: there is no live link, no inheritance, no sync. A copy is a copy.

---

## 6. Where the bytes live

| what | where | why |
| --- | --- | --- |
| the document | Postgres, `blocks.arrangements` JSONB | small, queried, transactional |
| uploaded artwork | **R2**, keyed `{org}/blocks/{random}` | large, immutable, served to browsers |
| a record of that artwork | Postgres, `block_assets` | a key can be drawn but not *found* |
| the shop's logo | R2, via the brand kit | same reason |

An `image` element stores `{ from: 'asset', assetId }` where `assetId` **is the
R2 object key**. `assetResolver` turns it into a URL by string concatenation —
no query. That is what keeps section 4's promise true.

---

## 7. Should the document itself live in R2?

**Proposed:** keep block documents as JSON files in R2 — our library as files,
and an import writes a copy into the shop's own folder.

**My answer is no for the document, yes for the idea underneath it.** The
half about ownership already happens: import copies into the shop's own space
today, as a row. The storage medium is a separate question, and moving it would
cost four things:

1. **Atomicity.** A save is one `prisma.$transaction`: update `blocks`, insert a
   `block_versions` row. Both or neither. With the document in R2 there is a row
   pointing at an object, two writes that can disagree, and no rollback — version
   history becomes "objects that may or may not exist".
2. **Queryability.** Listing by org and status, the plan gate, `usesOnlyRoles`,
   and any future *"which blocks use this asset"* all need the document. JSONB is
   queryable in place. Objects are not — you would fetch all of them.
3. **Latency, multiplied.** A page needs every block it uses. That is one query
   today. It becomes N HTTP round-trips from the server, or a cache with an
   invalidation problem you now own.
4. **One source for the library.** The seeded blocks are code precisely so the
   seed and the harness cannot disagree. As R2 files they would be data that has
   to be published, versioned and kept in step with the renderer.

R2 earns its place for **bytes that are large, immutable and served straight to a
browser** — images, and the logo. A block document is none of those: it is a few
kilobytes of structured data that is read on every render and written on every
keystroke-ish save.

**What is worth building, and is a different feature:** a block **export and
import file**. `GET /api/v1/blocks/{id}/export` returning the document as JSON,
and an upload that validates it through `arrangementsSchema` and creates a row.
That gives portability, backup, and moving a design between organizations — the
real value in the proposal — and it sits on top of the current storage rather
than replacing it. `arrangementsSchema` already exists and is exactly the
validator such an import would need.

---

## 8. Validation, and where it happens

| stage | what | where |
| --- | --- | --- |
| the type | shape of the document | `packages/types/src/composition.ts` |
| the edge | a stored document is refused if malformed | `apps/web/lib/block-document.ts` |
| the design | coverage gaps, bindings on a static block, elements off the card | `validateBlock` |

The edge schema is a **mirror** of the type, and a compile-time assertion at the
bottom of that file fails the build if the two drift. That matters more than
usual here: `arrangements` is JSONB, so Prisma stores whatever it is handed and
TypeScript stops caring the moment the value crosses the wire.

Ceilings, all product judgements rather than architecture: 6 arrangements, 40
elements, 8 gradient stops.

---

## 9. The whole life of a block

```
  authored in code                 designed by an owner
  library-*.ts                     /card-designer/[blockId]
        │                                   │
   pnpm db:seed                     PATCH /api/v1/blocks/{id}
        │                           → validate → transaction:
        ▼                              blocks.arrangements
   blocks (organizationId: null)        + block_versions
        │                                   │
        │  POST /api/v1/blocks {fromIds}    │
        └──────────► deep copy ─────────────┘
                     blocks (organizationId: set)
                            │
                            ▼
                   pinned or flowed into a book
                            │
                     resolveBlock(rect)
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
            the browser          the export worker
            draw.tsx             (stub — E8)
```

Both ends of that last fork read the same document through the same engine. That
is the rule the whole package exists to hold, and the reason path geometry,
colour resolution and text fitting all live in `packages/engine` rather than in
whichever renderer needed them first.
