# Authoring a block

*A reference for writing block documents. Written 9 September 2026.*

> Read `docs/block-templates.md` first if you want to know *how* a block reaches
> a page. This file is the other half: exactly what you may put in one, and what
> will be refused.
>
> **The authority is `apps/web/lib/block-document.ts`.** Every bound below is
> enforced there, and a document that breaks one is rejected on save — not
> drawn badly, rejected. If this file and that file disagree, that file is right
> and this one is a bug.

---

## 1. The shape of a document

```jsonc
[
  {
    "aspectMin": 0.5,          // this layout covers containers from 0.5…
    "aspectMax": 1.5,          // …to 1.5 wide-over-tall
    "elements": [ /* … */ ]
  }
]
```

A block is an **array of arrangements**. Each arrangement is one layout, valid
over a range of container shapes. The engine picks the arrangement whose range
contains the shape it is drawing into, and falls back to the nearest one if none
does — so a block always draws, and a gap in coverage is a warning rather than a
failure.

| | bound |
| --- | --- |
| arrangements | 1 – 6 |
| `aspectMin`, `aspectMax` | 0.05 – 40, and `aspectMin ≤ aspectMax` |
| elements per arrangement | up to 40 |

**Aspect is width ÷ height.** A tall card is 0.7; a square post is 1; a band
across a page is 3.2.

Ranges should meet, not overlap and not leave gaps:

```jsonc
{ "aspectMin": 0.35, "aspectMax": 0.85 }   // tall
{ "aspectMin": 0.85, "aspectMax": 1.35 }   // squarish
{ "aspectMin": 1.35, "aspectMax": 2.6  }   // wide
{ "aspectMin": 2.6,  "aspectMax": 12   }   // band
```

---

## 2. Every element

All elements carry these. Only `id` and `box` are required.

```jsonc
{
  "id": "name",              // unique within the arrangement, 1–64 chars
  "box": { "start": 0.08, "top": 0.4, "width": 0.84, "height": 0.2 },
  "rotation": 0,             // optional, −180 … 180 degrees, about its centre
  "opacity": 1,              // optional, 0 … 1
  "groupId": "g1",           // optional — elements that move together
  "locked": false            // optional — kept out of the way of a stray click
}
```

**`box` is fractions of the block, never pixels.**

- `start` is the reading-order start edge — left in English, **right in Arabic**.
  Never write `left`.
- `start` and `top` accept −1 … 2; `width` and `height` accept 0 … 2. The range
  is wider than the block on purpose: a corner badge overhangs by design.

**Paint order is array order.** The first element in the list is furthest back. A
full-bleed background belongs at the front of the array, not appended to the end
— appending is how a ground ends up covering the card.

---

## 3. The six element kinds

### `text`

```jsonc
{
  "id": "name", "box": { … },
  "kind": "text",
  "source": { "from": "product", "field": "name" },
  "level": "h3",
  "align": "start",

  // optional
  "overflow": { "mode": "shrink", "floor": "h5" },
  "size": 0.06,              // 0.005 … 1 — a fraction of the block's geometric mean
  "weight": 700,             // 100 … 900
  "italic": false,
  "letterSpacing": 0,        // −0.2 … 1
  "transform": "uppercase",  // "none" | "uppercase"
  "family": "display",       // "headline" | "display" | "price" | "body"
  "color": { "from": "role", "ref": "ink" }
}
```

**`level`** — `h1` `h2` `h3` `h4` `h5` `h6` `body` `caption`. Required. It is
where the type starts *and* where the fit ladder stops.

**`source`** — what the text shows:

| | |
| --- | --- |
| `{ "from": "product", "field": … }` | `name` `spec` `brand` `origin` `packSize` — **repeating blocks only** |
| `{ "from": "offer", "field": "tier" }` | the offer's tier, e.g. "Save 20%" — **repeating blocks only** |
| `{ "from": "shop", "field": … }` | `name` `phone` `address` |
| `{ "from": "static", "textEn": "…", "textAr": "…" }` | a line you type — **both languages, always**, max 280 each |

A static line with only English renders a hole in an Arabic edition, and the
person who typed it will never see that edition. The schema requires both.

**`overflow`** — what an overlong string may suffer. Omit it and the source
decides.

| mode | |
| --- | --- |
| `{ "mode": "shrink", "floor": "h5" }` | step down the scale, no further than `floor` |
| `{ "mode": "clamp", "lines": 2 }` | wrap to at most N lines (1 – 6), then cut the last |
| `{ "mode": "truncate" }` | one line, cut with an ellipsis |

A product **name** is never truncated unless you ask for it explicitly. A tier is
never truncated at all — *"Save 2…"* is a different and wrong claim.

### `image`

```jsonc
{
  "id": "shot", "box": { … },
  "kind": "image",
  "source": { "from": "product" },            // or { "from": "asset", "assetId": "org_x/blocks/ab12…" }
  "fit": "contain",                            // "contain" letterboxes, "cover" crops
  "radius": 3,                                 // 0 … 64
  "stroke": { "color": { … }, "width": 0.004 }
}
```

`{ "from": "product" }` is the packshot — **repeating blocks only**.
`{ "from": "asset" }` is artwork someone uploaded, named by its R2 object key.

A packshot is `contain`: cropping to fill loses the top of the bottle. A
background photograph is `cover`.

### `shape`

```jsonc
{
  "id": "ground", "box": { … },
  "kind": "shape",
  "fill": { "from": "role", "ref": "primary" },
  "variant": "rect",
  "radius": 3,                                 // required — rectangles only honour it
  "stroke": { "color": { … }, "width": 0.004 }
}
```

| variant | |
| --- | --- |
| `rect` `ellipse` `line` | the primitives. A `line` draws its stroke along its own middle and no fill |
| `burst` `star` | **hold their proportion** — they take the largest centred square in the box |
| `ribbon` `tag` `flash` `arrow` | fill the box; `flash` and `arrow` mirror in an Arabic edition |

`fill` is the **only** field in the whole document that accepts a gradient.

### `chip` — the offer badge

```jsonc
{
  "id": "chip", "box": { … },
  "kind": "chip",
  "anchor": "TOP_START",                       // "TOP_START" | "TOP_END" | "INLINE"
  "shape": "pill",                             // "none" | "pill" | "burst" | "ribbon" | "tag"
  "fill": { "from": "role", "ref": "accent" }, // omit to take the tier's own colour
  "ink":  { "from": "role", "ref": "surface" } // omit and it picks a readable one
}
```

Shows the offer's tier. **Repeating blocks only.** `"shape": "none"` draws no
badge at all and leaves the words on the card.

### `priceMark`

```jsonc
{
  "id": "price", "box": { … },
  "kind": "priceMark",
  "style": {
    "tint":    { … },        // the tab and outline. Omit → the tier's colour
    "ink":     { … },        // the digits
    "surface": { … },        // the ground behind them
    "frame":   "tag",        // "tag" | "plain" — plain drops the ground and outline
    "tab":     "attached"    // "attached" | "none"
  }
}
```

**Repeating blocks only.** Colour, ground, outline and the tab are yours. The
composition is not: the raised minor digits, the three-decimal currencies and the
LTR ordering that survives an Arabic edition are the engine's, and there is no
field for them. Never build a price out of text elements.

### `logo`

```jsonc
{ "id": "logo", "box": { … }, "kind": "logo" }
```

The shop's mark, from its brand kit. No options.

---

## 4. Colour

Four ways to name one. **A block for the library may only use the first.**

```jsonc
{ "from": "role",    "ref": "primary" }              // primary secondary accent surface ink inkMuted
{ "from": "palette", "id":  "col_1"   }              // an entry in this shop's palette
{ "from": "hex",     "hex": "#143CD2" }              // exactly six digits — not 3, not 8
{ "from": "gradient", "angle": 90, "stops": [ … ] }  // shape fills only
```

A gradient:

```jsonc
{
  "from": "gradient",
  "angle": 90,                     // 0 … 360. 0 runs along the card, 90 runs down it
  "stops": [                       // 2 … 8, and a stop may not itself be a gradient
    { "at": 0, "color": { "from": "role", "ref": "primary" } },
    { "at": 1, "color": { "from": "role", "ref": "primary" }, "opacity": 0 }
  ]
}
```

`opacity` on a stop is the **only** place alpha exists in the whole model. Alpha
everywhere else belongs to the element's `opacity`.

A **stroke** is `{ "color": <flat colour>, "width": 0.004 }`, width 0 … 0.2 as a
fraction of the block's geometric mean.

---

## 5. Rules that decide whether a block is any good

**Roles only, if it is going in the library.** A block we ship has not met the
shop that will load it, so it cannot name that shop's palette entry or a literal
of its own. `usesOnlyRoles` enforces it, and a gradient fails it by construction
whatever its stops name. Use `surface` for the card, `ink` for what is read on
it, `primary`/`secondary`/`accent` for the brand.

**Static blocks get no bindings.** If `repeats` is false there is no product in
scope, so `product`, `offer`, `priceMark`, `chip` and a product `image` are all
refused — not empty, refused.

**Bind product text, never type it.** A typed name cannot reflow, cannot
translate, and is wrong the moment the catalog corrects itself.

**Design for the worst string, not the nicest one.** Test against a long Arabic
product name with no photograph. That is the common case, not the edge case:
4.2% of the catalog has an image.

**Leave room under text.** Text draws from the top of its box downward, so a
divider under a line needs the gap *above* its own box. Every seasonal band
shipped with its second line struck through because of this.

---

## 6. A worked example

A footer band placed once, in both languages:

```jsonc
[
  {
    "aspectMin": 2.4,
    "aspectMax": 30,
    "elements": [
      {
        "id": "ground",
        "kind": "shape",
        "box": { "start": 0, "top": 0, "width": 1, "height": 1 },
        "fill": { "from": "role", "ref": "primary" },
        "variant": "rect",
        "radius": 0
      },
      {
        "id": "greeting",
        "kind": "text",
        "box": { "start": 0.05, "top": 0.2, "width": 0.55, "height": 0.34 },
        "source": { "from": "static", "textEn": "Ramadan Kareem", "textAr": "رمضان كريم" },
        "level": "h1",
        "align": "start",
        "color": { "from": "role", "ref": "surface" }
      },
      {
        "id": "divider",
        "kind": "shape",
        "box": { "start": 0.05, "top": 0.6, "width": 0.14, "height": 0.006 },
        "fill": { "from": "role", "ref": "surface" },
        "variant": "rect",
        "radius": 0
      },
      {
        "id": "support",
        "kind": "text",
        "box": { "start": 0.05, "top": 0.68, "width": 0.55, "height": 0.2 },
        "source": { "from": "shop", "field": "name" },
        "level": "body",
        "align": "start",
        "color": { "from": "role", "ref": "surface" }
      },
      { "id": "logo", "kind": "logo", "box": { "start": 0.86, "top": 0.3, "width": 0.1, "height": 0.4 } }
    ]
  }
]
```

Note the ground is **first**, the divider sits at 0.6 while the line under it
starts at 0.68, and every colour is a role.

*This example was parsed through `arrangementsSchema` and `usesOnlyRoles` before
it was written down. If you copy it and it is refused, the schema has moved and
this file has not.*

---

## 7. Making one without writing JSON

The designer at `/card-designer/[blockId]` writes exactly this document. Design
there, and read the JSON back rather than typing it — it is the fastest way to
learn the format and the only way that cannot produce something the schema
refuses.

**Getting a design into the shipped library is not built yet.** Today the library
is generated in `packages/engine/src/library-*.ts` and reaches a database through
`pnpm db:seed`, which also *prunes* any seeded block its source no longer lists —
so a block written straight into the database is deleted on the next deploy. The
plan is a file per authored block, loaded alongside the generated ones;
`docs/E7-pending.md` has the discussion.
