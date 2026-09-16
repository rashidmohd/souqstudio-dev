# E8 — AI Features

**Working notes: `docs/E8-pending.md`.** This file stays the record of what was asked for;
corrections produced by building E8-07 are recorded there rather than edited in here, as
with every other epic.

## Overview

AI features are the differentiation layer of SouqStudio. They go beyond layout automation to give each shop a unique visual identity — branded characters, AI-generated covers, and automatic image cleanup. All AI features are credit-gated.

**Two of them make the brand kit itself rather than decorating it.** E8-08 proposes a palette and a type pairing for a shop that has neither; E8-09 generates the logo mark that E4-01 currently requires an owner to already own. They are specified late and are nearer the front of the product than anything above them — a shop that cannot fill its brand kit cannot finish onboarding, and every other feature here assumes a filled kit.

**Priority:** V2

---

## Credit Costs

| Action | Credits |
|---|---|
| Generate base character (4 variations) | 10 |
| Generate new pose | 3 |
| Custom prompt generation | 5 |
| Regenerate / variation | 2 |
| AI cover generation | 5 |
| Background removal | 1 |
| Magic block — a picture of a card into a block | 5 |
| Brand direction — palette and type | 3 |
| Logo mark (4 variations) | 10 |

---

## Features

### E8-01 AI Character Creation

**Reshaped on 16 September, after the first build was rejected.** What changed, and why,
is `E8-pending.md` §3c. In short: it is a **gated flow on its own screen**, not a modal;
it is gated on a **shop profile** that did not exist before; `photo-real` is a fifth style;
and the uniform photographs and the shop photographs are two different inputs that go to
two different models. The spec below is the original ask and is kept as the record of it.

Shop owners create a branded mascot character from their staff uniform. The character becomes part of the brand kit and is reusable across all future offer books.

**Input**
- Uniform photo upload (extracts: color, style, logo placement, type — apron, polo, vest, formal)
- Nationality (drives facial features and skin tone naturally)
- Gender: Male / Female / Generate both
- Art style: Cartoon / Semi-realistic / Flat Minimal / Mascot

**Generation**
- 4 character variations returned per generation
- User selects favorite → saved to brand kit
- Discarded variations not saved

**Technical Stack**
- Base generation: Stable Diffusion XL or DALL-E 3
- Uniform extraction: GPT-4 Vision (extracts color, style, logo position)
- Character consistency across poses: ControlNet (reference image locked)
- Background removal: Rembg

**Storage**
- Base character image stored at high resolution in Cloudflare R2
- Stored under `/{org_id}/{shop_id}/characters/base.png`

### E8-02 Character Pose Library

Once a base character is generated, a pose library is built. Each pose is generated using the base character as a ControlNet reference — ensuring visual consistency.

| Pose | Use Case |
|---|---|
| 👋 Waving / Welcoming | Cover page, landing image |
| 🛒 Holding product | Next to featured product in grid |
| 📢 Announcing / Megaphone | Sale announcements, banners |
| 👍 Thumbs up | Best price badge, approval |
| 🎉 Celebrating | Festive offers, seasonal |
| 💬 Speech bubble | Custom text callouts |
| 🏃 Running sale | Urgency / limited time |

**Generation flow**
- User selects pose from list
- Generation triggered (3 credits)
- 2 variations returned
- User selects → saved to character library in brand kit
- Pose can be regenerated at any time (2 credits)

**Storage**
- Each pose stored: `/{org_id}/{shop_id}/characters/pose-{pose_name}.png`

### E8-03 Custom Character Prompt

For power users who want a specific scene or action not in the pose library.

- Free-text prompt input
- Brand colors, uniform style, and base character are automatically injected into the prompt behind the scenes
- User only describes what they want: "holding a watermelon, smiling, looking left"
- 4 variations returned (5 credits)
- User selects → saved to character library with custom label

**Prompt injection example (internal, not shown to user)**
```
[User types]: "holding a watermelon, smiling, looking left"

[Sent to model]: "Character wearing [extracted uniform description] in 
[brand primary color] uniform, holding a watermelon, smiling, looking 
left, [selected art style] style, white background, full body, 
high quality..."
```

### E8-04 AI Cover Generation

Generates a full cover page image for the offer book.

**Input**
- Campaign type: Weekend Sale / Ramadan Special / Eid Offers / Back to School / clearance / custom
- If character exists in brand kit: character auto-placed on cover
- Shop name and logo auto-included

**Generation**
- AI generates cover background + composition (5 credits)
- Shop name, logo, and character composited on top after generation
- 3 cover options returned
- User selects or regenerates

**Output**
- Sized to match selected output format (square for Instagram, portrait for catalog)
- Stored in R2, referenced in offer book canvas state

### E8-07 Magic Block — a picture in, a block out

**Built 10 September 2026. Extended to every kind of block on 10 September.**
The one AI feature that generates no image.

An owner photographs or screenshots something they want — from a competitor's
flyer, a Pinterest board, a previous year's print run — and gets a block in
their library that is drawn in *their* brand colours.

**The owner says what kind of thing it is, and the model is shown that kind
only.** `MAGIC_CATEGORIES` — offer card, header, panel, footer, square social
post — is a picker above the dropzone, and it selects both the vocabulary in the
prompt and the schema the reply is validated against. Two things follow, and the
second is the price of the first:

- **A smaller closed set is a better matcher.** Choosing between eight headers is
  a different task from choosing between sixty-five mixed designs, and the model
  is doing the easier one. It cannot answer outside the kind: the enum is per
  kind, so a footer named under "header" fails validation on both providers —
  the one whose API constrains generation and the one that is merely asked.
- **A picture under the wrong kind is declined, not quietly matched.** The nearest
  header to a photograph of a footer is still a header, it draws fine, and the
  owner paid for it. `isMatch: false` is the answer, the notes say why, and
  nothing is charged.

`seasonal` is deliberately not offered. A seasonal block is a design *plus* an
occasion, and `seasonal.ts` computes each window from the calendar — a match
would have to pick the occasion from a photograph, and a wrong one is a shop
wishing its customers Eid Mubarak in March.

**It matches, it does not draw**, and the two halves of the library are matched
differently because they are built differently.
`packages/engine/src/library-cards.ts` holds twenty-five structures, each a
function from a `Skin` to a full set of arrangements; for an offer card the model
picks one and describes the skin. Everything else is hand-drawn in
`library-panels.ts`, already names every colour by role, and is therefore matched
*to itself* — the model names a shipped block and gets a copy of it, with no skin
asked for. Asking a model to re-skin a design a person already skinned is asking
it to overrule that decision from a photograph of somebody else's shop. §8 of
`docs/E7-pending.md` records why the library is structure-times-skin rather than
sixty hand-drawn cards, and a model emitting free-form documents would drift the
same way and faster. Three properties fall out of matching instead:

- **It cannot emit an illegal document.** The output is an enum and six bounded
  fields; `arrangementsFromChoice` is the same call the seeded library makes.
- **It reflows.** A photograph shows one aspect. The matched structure already
  carries every shape it claims, so the block works in a merged region too.
- **It looks like the shop.** Every colour is a `TokenRef`, never a hex sampled
  off the picture — otherwise the card would permanently wear somebody else's
  brand. `docs/composition-model.md` §3.2.

**Flow**

```
POST /api/v1/blocks/artwork   presigned PUT — the picture goes straight to R2
POST /api/v1/blocks/magic     validates the key is this org's, checks credits,
                              writes ai_jobs, queues, returns { jobId }
      ↓  ai.magicBlock
worker   fetch → downscale → vision call → structure + skin
         → arrangementsFromChoice → validateBlock + usesOnlyRoles
         → blocks row (status: draft) → consumeCredits → complete
GET  /api/v1/ai/jobs/:jobId   the client polls; result carries { blockId, notes }
```

**Model: two of them, and one environment variable picks.**
`MAGIC_BLOCK_PROVIDER` unset is `claude-opus-5` with adaptive thinking, which
constrains generation to `magicSchemaFor(category)` directly — the engine's own
zod schema for the kind that was asked about, handed to the API, so there is one
definition of a legal choice. Set it
to `qwen` and the same question goes to Qwen-VL over DashScope's
OpenAI-compatible endpoint, where the contract travels as JSON Schema in the
prompt (derived from that same zod object via `magicChoiceJsonSchema`, never
written out by hand) and `response_format: json_object` gets valid JSON back.

The asymmetry is real and is handled rather than hidden: Anthropic *cannot*
return an illegal structure, Qwen can, so `interpret()` in `lib/magic-prompt.ts`
validates both against the schema and nothing downstream knows which answered. A
bad Qwen reply surfaces as `UnreadableDesignError`, a failure the job already
had. **The safety argument is unaffected by the choice** — `magic.test.ts`
enumerates all 2,400 possible choices and proves each assembles into a drawable
block, which is a property of the schema and not of the model. A weaker model
gives worse *matches*, not broken blocks.

Claude costs roughly $0.09–0.15 per call against 5 credits of revenue; Qwen is
substantially less. Decide between them with
`pnpm --filter @souqstudio/worker magic:check`, which renders cards of known
structure and reports what came back — run it once per provider and compare hit
rates rather than arguing about it. Rollback is unsetting the variable.

**Two operational traps.** DashScope serves Beijing and Singapore from different
hosts and an account created against one is not authorised on the other; the
failure is a 401 indistinguishable from a bad key, so `DASHSCOPE_BASE_URL` is
explicit rather than assembled. And sending shop owners' uploaded images to a
given provider is a decision worth making deliberately for GCC customers rather
than inheriting from a default.

**The block is always a draft, and the owner lands in the designer with it.** E7
§8 settled that creating a block is duplicating one that works rather than
starting from a blank artboard; this is the same move with a photograph as the
seed. Publishing is a separate decision a person makes after looking at it.

**"That is not one of these" is a real answer.** It was `isOfferCard` while an
offer card was the only thing this could produce, and the question it asks now is
whether the picture is the kind the owner said. Every offer-card structure repeats
over the product list, so a masthead matched to the nearest one produces a card
full of bindings it cannot fill; and a footer matched to the nearest header is a
block in the wrong half of a page. The model sets `isMatch: false` and the job
reports `no_match` rather than guessing — and that branch is never retried,
because the picture will not have changed.

### What the first live run found — 10 September 2026

Run against Qwen with a real key: three seeded cards rendered, fed back, and the
structure compared to the one they were built from. **Two of three matched at
high confidence; the third chose an adjacent layout at *medium***, which is the
model reporting its own uncertainty rather than failing. The notes it wrote were
accurate enough to read as a description of the card.

It also found two defects, both in this code rather than in the model.

**A white product name on a white card.** Asked whether the card inverts its
type, the model looked at a white card with a red price band, saw white type *on
the band*, and said yes. A fair reading of the picture and the wrong answer to
the question — `onTint` inverts every bound string at once, so the result would
have been an invisible product name. `onTint` is no longer asked for: the ground
decides it, exactly as it does across the seeded library, and `magic.test.ts`
pins it in both directions. This is the class of thing the gallery catches and
the tests do not — the enumeration passed the broken combination happily,
because an invisible card is structurally valid.

**A reply that corrected itself, thrown away.** The model emitted a malformed
`notes` array, abandoned it, and re-emitted the whole object correctly — nested
*inside* the broken one, which had never closed. Its answer was right both
times. Two attempts at recovering it were wrong before one was right: collecting
only top-level spans found just the wreckage, and then preferring the first
candidate that *parsed* still returned the wreckage, because mismatched quotes
had turned half a sentence into a key and left the outer object syntactically
valid JSON carrying the right structure name and a `notes` that was a string.
Only the schema separates them, so `interpretFirst()` validates every reading in
order. `vision-qwen.test.ts` holds the verbatim payload.

### The interface — built 10 September

`MagicBlockDialog`, reached from **two places**: `/brand/blocks` beside "Add
from library", and the blocks card on `/brand`. Both open the same dialog rather
than one linking to the other — sending an owner to a second screen to start
teaches them the feature lives somewhere else.

**Secondary in both, never primary.** Starting from the shipped library is free,
instant and always works; matching a picture costs credits and is the
second-order move. One primary per region, and it is not this.

Four states: choose (a `FileDropzone`, with the balance and the cost stated
*before* the drop), reading, done, declined. The result is the block itself
drawn by `BlockPreview` in the shop's own palette — not a description of a card,
the card — wrapped in `MachineOutput`, with the model's notes under it so the
owner can tell whether it understood their picture, and a plain sentence when
confidence is below high. Declining says **"You were not charged"**, because the
owner will otherwise assume they were.

**`MachineOutput` was `spec` until this shipped** and is now built; this dialog
is its first caller.

**And a draft now means something.** `listBlocks` served both the library screen
and the book editor, drafts included, so the designer's "hidden while you work
on it" was not true. Harmless while nothing created drafts — duplicating and
importing both write `published` — and not harmless the moment a model could
create one. The editor now reads with `forComposing: true`.

**What is not built:** no thumbnail is written for a generated block, which
costs nothing today because `BlockPreview` draws live from the arrangements and
ignores `thumbnailUrl` entirely. **And the Claude path has still never completed
a call** — `ANTHROPIC_API_KEY` is a placeholder, so the two providers have never
actually been compared.

### E8-05 Background Removal

Runs automatically in two places:
- Logo upload (E4-01)
- Missing product upload (E5-04)
- Custom character prompt results

Also available as manual action on any product image inside the editor (1 credit per image).

**Technical**
- Rembg running as a self-hosted microservice (Python FastAPI)
- Accepts image URL or base64
- Returns PNG with transparent background
- Processing time target: < 3 seconds

### E8-06 AI Metadata Enrichment (Internal)

An internal batch job that runs nightly on new or unenriched catalog products.

**What it generates per product**
- Arabic synonym(s)
- Hindi synonym(s)
- Urdu synonym(s)
- Colloquial / regional name variants
- Tags array (for tsvector search)
- Subcategory assignment
- Occasion tags (Ramadan staple, Eid gift, etc.)

**Technical**
- Claude API used for synonym and metadata generation
- Batch job runs via BullMQ nightly queue
- Results written to `product_synonyms` and `catalog_products.tags`
- Failed enrichments retried up to 3 times then flagged for manual review

---

### E8-08 Brand Direction — palette and type from what the shop already is

**Built 16 September 2026.** Corrections from building it are in `E8-pending.md` §2a, as
with every other epic — two matter: the model names a type *mood* rather than four
typefaces, and the "same colour twice" check is a distance rather than a contrast ratio.

The one brand-asset feature that needs no diffusion model, and the reason it is
specified before E8-09: it is the same shape as magic block. One call over one
image, a structured answer from a closed vocabulary, a result the owner accepts
or discards.

**Today an owner gets colours only if they have a logo.** E4-02 quantizes the
uploaded logo and offers three to five dominant colours as swatches. That is a
good answer for a shop with a logo and no answer at all for the shop that does
not — which, in this market, is most of a first-week signup. They are asked to
pick a primary colour from a wheel, and what comes back is whatever they clicked.

**Input — any one of three, and the cheapest one is words**

| Source | What is sent | Notes |
|---|---|---|
| Storefront or signage photo | One image, longest edge 1568 | Same `prepare()` path as E8-07 |
| Existing logo already in the kit | The normalized PNG | Free of a new upload; extends E4-02 rather than replacing it |
| A sentence about the shop | Text only | "Family grocery in Sharjah, mostly fresh produce" — no image call at all |

**Output — a proposal, never a write**

- `palette`: four to six `BrandColor` entries, each named by the model in the
  shop's own terms ("signage green", "price red"), which is what `BrandKit.palette`
  was reshaped to hold when the three fixed slots were dropped.
- `textStyles`: a headline / display / price / body pairing drawn from the faces
  the product already loads. **The model names faces from an enum, it does not
  invent them** — a family that is not in the loaded set is a block that renders
  in a fallback nobody chose.
- A one-line rationale per colour, shown to the owner.

**The proposal clears a contrast check before the owner ever sees it.** E4-02
already warns when primary + white text fails WCAG AA. Here the check runs
earlier and harder: a proposed palette whose price colour cannot carry white type
is **not offered and is regenerated once**, because the owner is being asked to
approve a direction rather than to audit it.

This is the E8-07 lesson in a second register. Asked whether a card inverts its
type, the model looked at a red band on a white card and answered yes, which was
a fair reading of the picture and an invisible product name. The rule that came
out of it: **do not ask the model anything the code can compute.** Legibility is
arithmetic over two colours. Nothing asks.

**Storage** — nothing new. `patchBrandKit` / `patchOrgBrandKit` take the accepted
proposal as an ordinary partial write, at whichever level the owner is editing,
through `routePatch` like every other brand edit. A discarded proposal is not
stored at all.

**Marked as machine output.** The proposal is rendered inside `MachineOutput`,
per the rule in the root `CLAUDE.md` that an owner can always tell what a machine
wrote. Once accepted it stops being a proposal and stops being marked — it is
their palette, the same as one they picked by hand.

**Credits** — 3, charged on acceptance rather than on generation. This is the one
place the E8-07 ordering is deliberately not copied: a palette is *meant* to be
re-rolled during setup, several times, and charging per roll prices a shop out of
the step the whole product depends on. Generating is free, keeping costs 3, and
the usage event is written when the kit is patched.

---

### E8-09 Logo Mark — generated, and the question of how

**Built 16 September 2026, as (a) — matched, not drawn.** One correction that matters: a
generated mark is stored as SVG and never rasterised, because the worker has no font files.
`E8-pending.md` §2a and §7.

**The gap this closes.** Every brand asset the epic generates today assumes a
logo already exists. E4-01 takes an upload and removes its background; E8-04
composites the logo onto a cover; the email header, the nav rail and every block
that carries a mark all read `shops.logoUrl`. A shop without a logo is not a shop
with a worse offer book — it is a shop that cannot finish onboarding.

**Two ways to build it, and they are not close.**

**(a) Matched, not drawn — recommended.** A hand-drawn set of mark structures —
wordmark, monogram, enclosed badge, pictorial + wordmark lockup — each a real SVG
in the repo with its colours named by role. The model is shown the shop name,
trade and accepted palette, picks a structure from the enum and describes a skin;
the app assembles the SVG from the shop's own colours. Four variations returned.

This is exactly the compromise E8-07 shipped and is the reason it works:

- It cannot emit an illegal mark. The output is an enum and a handful of bounded
  fields, the same bar `validateBlock` and `usesOnlyRoles` hold a generated block
  to.
- It needs **no diffusion provider**, which is the decision blocking E8-01 to
  E8-04 and which nobody has made.
- It sends no photograph of anyone. The privacy question that makes E8-01 hard —
  a mascot built from a picture of somebody's employees — does not arise, because
  the only inputs are a name, a trade and six hex values.
- It is a vector at the end of it, so the mark is sharp on an A3 print without a
  resolution argument.

**(b) Diffused.** A real image model draws a mark from a prompt. It is the version
that produces something nobody on the team drew first, and it inherits every open
question in `E8-pending.md` §3: which provider, what they retain, what four
variations cost against the credits charged for them. **Nothing here should be
built until that is answered** — the same instruction §3 already gives for the
four character and cover jobs, and it applies to this one for the same reason.

**The recommendation is (a) now and (b) never, or (b) much later.** A logo is the
one asset in the kit that must be reproducible, re-colourable and printable at
any size. A raster a model drew once is none of those.

**Storage and the status field.** A generated mark goes through `processLogo`
like an upload — normalized to PNG at 1024, palette extracted — so nothing
downstream learns a new case. The SVG source is kept alongside it, which uploads
have no equivalent of and which is what makes a re-colour free when the palette
changes later. `LogoStatus` gains no new member: a generated mark has a
transparent ground by construction and is `ready` the moment it is written.
`logoOriginalUrl` stays empty, because there was no upload to keep.

**Credits** — 10 for four variations, matching `character_gen`. Regenerating is
`variation` at 2.

**Refusals are answers.** A shop name that is three words of Arabic and two of
English does not fit a monogram, and the model says so rather than cropping it.
Declined costs nothing and is not retried, per the `isMatch: false` rule that
already governs magic block.

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Character creation is a modal wizard (4 steps: upload → nationality/gender → style → results)
- Generation result shown as a 2×2 or 1×4 image grid — user taps to select
- Loading state: animated placeholder with credit cost reminder
- Credit balance shown prominently before any generation action
- "Not enough credits" state: inline upgrade / top-up prompt, never a blocking error modal

---

## Backend Notes

- AI generation jobs queued via BullMQ — never block the HTTP request
- Client polls for job status via `GET /ai-jobs/:jobId` (or WebSocket for real-time)
- Job statuses: `queued` | `processing` | `complete` | `failed`
- On completion: image URLs returned, credits deducted, usage event written
- On failure: credits refunded automatically, user notified
- Rembg runs as a separate Python microservice — not in the Node.js process
- DALL-E 3 / Stable Diffusion calls made server-side only — API keys never exposed to client

---

## Database Tables

```
characters
  id, shop_id, base_image_url, style, nationality, gender,
  uniform_description JSONB, created_at

character_poses
  id, character_id, pose_type, image_url, custom_label, created_at

ai_jobs
  id, organization_id, shop_id, type, status,
  result JSONB, credits_cost, created_at, completed_at

usage_events
  id, organization_id, shop_id, event_type, credits_used, created_at
```

---

## Out of Scope

- Video generation (animated characters)
- Character talking / lip sync
- AI-generated product descriptions for offer books
- Style transfer from competitor offer books
