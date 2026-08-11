# E10 — Sharing & Publishing

## Overview

Once an offer book is created, it needs to reach customers. SouqStudio supports direct sharing via link and QR code, WhatsApp sharing (the primary channel in GCC), and direct publishing to Instagram and Facebook (V2).

**Priority:** MVP (link, QR, WhatsApp), V2 (Instagram/Facebook publishing)

---

## Features

### E10-01 Shareable Link Generation

Every published offer book gets a unique shareable link.

**Link format:** `souqstudio.com/o/{short_code}`

- Short code: 8-character alphanumeric, collision-checked on generation
- Link is active immediately on publish
- Link renders a public-facing offer book viewer (read-only, no login required)
- Viewer is server-side rendered (Next.js SSR) for fast load and link preview cards (OG tags)
- OG tags auto-generated: shop name, offer book title, cover image

**Link Settings (per offer book)**
- Set expiry date (optional) — link auto-expires after date
- Password protection (optional) — viewer prompts for password before showing offer book
- Disable link (deactivate without deleting)

**Viewer Page**
- Branded with shop logo and colors
- Page-flip animation between catalog pages
- Product cards show: image, name, original price, offer price, discount badge
- Each product click tracked (E11 analytics)
- "Powered by SouqStudio" footer (removable on Business plan+)

### E10-02 QR Code Generation

- Auto-generated for every offer book alongside the shareable link
- QR code points to the shareable link
- Download as PNG or SVG
- SVG preferred — scales cleanly for print
- Can be embedded in print flyers, shelf labels, shop window stickers

### E10-03 WhatsApp Direct Share

Primary distribution channel for GCC market.

**Image share (MVP)**
- "Share on WhatsApp" button on export
- Opens WhatsApp with image attached (web: `https://wa.me/?text=...` with image URL)
- On mobile: native WhatsApp share sheet
- Works for: Instagram Post, WhatsApp Image, Story formats

**Link share**
- "Share link on WhatsApp" — opens WhatsApp with pre-filled message:
  `"Check out our latest offers! [link]"`
- Shop owner can edit the message before sending

**WhatsApp Business (V2)**
- Direct API integration for shops using WhatsApp Business accounts
- Send offer book link to customer lists
- Scheduled broadcasts

### E10-04 Instagram & Facebook Direct Publish (V2)

Shop owners connect their Instagram Business and/or Facebook Page account once. Then publish directly from SouqStudio.

**OAuth Connection Flow**
- "Connect Instagram" in shop settings
- Meta OAuth flow → user grants publish permissions
- Access token stored securely (encrypted at rest)
- Connection status shown: Connected / Disconnected / Token expired

**Publish Flow**
- Select offer book → "Publish to Instagram"
- Choose format: Single Post / Carousel (multiple images = multiple pages)
- Write caption (pre-filled with shop name + offer title)
- Add hashtags (saved per shop for reuse)
- Publish now or schedule

**Carousel Publishing**
- Multi-page offer book → each page becomes one carousel card
- Up to 10 cards per carousel (Instagram limit)
- If catalog has more than 10 pages: user selects which pages to include

**Facebook Page Publishing**
- Same flow as Instagram — Meta Graph API handles both
- Separate toggle for Facebook vs Instagram vs both

**Connection Requirements**
- Instagram account must be a Business or Creator account
- Must be linked to a Facebook Page (Meta requirement)
- SouqStudio Facebook App must be approved for `instagram_content_publish` permission

### E10-05 Post Scheduling (V2)

- Select a future date and time for publishing
- Scheduled posts listed in a calendar view per shop
- Edit or cancel a scheduled post before it fires
- Timezone follows shop settings
- Scheduling powered by BullMQ delayed jobs

### E10-06 Publish History & Status (V2)

- List of all published posts per shop
- Status per post: Published / Scheduled / Failed / Draft
- Failed posts: show error reason + retry option
- Link to live Instagram / Facebook post
- Basic reach stats pulled from Meta API (impressions, reach) shown alongside SouqStudio analytics

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Shareable link viewer is a separate Next.js route (`/o/[code]`) with no auth, SSR
- QR code generated client-side using `qrcode` npm package
- WhatsApp share uses `navigator.share` API on mobile, fallback to `wa.me` URL on desktop
- Instagram connect flow opens in a popup window (Meta OAuth requirement)
- Scheduling UI is a simple date/time picker, not a full calendar for MVP

---

## Backend Notes

- Short code generation: `nanoid(8)` — collision check against existing codes
- OG meta tags generated server-side in Next.js page metadata
- WhatsApp Business API: use Twilio or Wati as the provider (not direct Meta API)
- Meta Graph API calls made server-side — access tokens never exposed to client
- Scheduled posts: BullMQ delayed job created at scheduling time; fires `publishToMeta()` at the right moment
- Access tokens encrypted at rest using AES-256 before storing in DB
- Token refresh handled automatically before expiry

---

## Database Tables

```
offer_books
  shareable_link, short_code, expires_at, password_hash, link_active

social_connections
  id, shop_id, platform (instagram / facebook),
  access_token (encrypted), page_id, account_name,
  connected_at, expires_at

social_posts
  id, offer_book_id, shop_id, platform, status,
  scheduled_at, published_at, external_post_id,
  caption, error_message
```

---

## Out of Scope

- TikTok publishing
- Twitter/X publishing
- LinkedIn publishing
- Google Business Profile publishing
- Direct email newsletter embed
