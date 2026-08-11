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
