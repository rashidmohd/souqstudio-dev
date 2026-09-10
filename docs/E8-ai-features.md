# E8 — AI Features

## Overview

AI features are the differentiation layer of SouqStudio. They go beyond layout automation to give each shop a unique visual identity — branded characters, AI-generated covers, and automatic image cleanup. All AI features are credit-gated.

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

---

## Features

### E8-01 AI Character Creation

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

### E8-07 Magic Block — a picture of a card in, a block out

**Built 10 September 2026.** The one AI feature that generates no image.

An owner photographs or screenshots a card they want — from a competitor's
flyer, a Pinterest board, a previous year's print run — and gets a block in
their library that reflows, prices correctly, and is drawn in *their* brand
colours.

**It matches, it does not draw.** `packages/engine/src/library-cards.ts` holds
twenty-five structures, each a function from a `Skin` to a full set of
arrangements; the model picks one and describes the skin. §8 of
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
constrains generation to `magicChoiceSchema` directly — the engine's own zod
schema handed to the API, so there is one definition of a legal choice. Set it
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

**"That is not an offer card" is a real answer.** Every structure repeats over
the product list, so a masthead or a whole flyer page matched to the nearest
offer card would produce a card full of bindings it cannot fill. The model sets
`isOfferCard: false` and the job reports it rather than guessing — and that
branch is never retried, because the picture will not have changed.

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

**What is not built:** no UI. The upload, the poll and the result are three
`curl` calls today. Nothing renders a thumbnail for the generated block, so it
shows in the library without a preview until someone opens it. **And the Claude
path has still never completed a call** — `ANTHROPIC_API_KEY` is a placeholder,
so the two providers have never actually been compared.

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
