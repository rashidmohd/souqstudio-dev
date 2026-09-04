# E11 — Analytics & Tracking

## Overview

Every shareable offer book link is tracked. Shop owners can see exactly how their promotions perform — views, clicks, traffic sources, peak times, and top products. Analytics are available at shop level and organization level (all shops combined).

**Priority:** V2

---

## What Gets Tracked

Every event on a shareable offer book viewer page (E10-01) is tracked anonymously — no login required from the viewer.

| Event | Trigger |
|---|---|
| Page view | Offer book viewer opened |
| Page turn | Viewer navigates to next/previous page |
| Product click | Viewer taps/clicks a product card |
| Link source | Referrer header or UTM parameter |
| Device type | User agent (mobile / tablet / desktop) |
| Time on page | Session duration per page |
| Unique visitor | Anonymous fingerprint (no cookies, privacy-safe) |

---

## Features

### E11-01 Page View & Unique Visitor Tracking

- Every open of a shareable link is a page view
- Unique visitors identified via anonymous fingerprint (screen size + timezone + user agent hash — no persistent cookies)
- Tracks: timestamp, page number, session duration
- Bot filtering: exclude common crawler user agents

### E11-02 Product Click Tracking

- Each product card in the viewer is clickable
- Click expands product detail (name, prices, discount)
- Click tracked: which product, which page, which offer book, timestamp
- Enables "most clicked product" ranking per offer book

### E11-03 Traffic Source & Device Tracking

**Traffic source detection:**
- WhatsApp: referrer matches `l.instagram.com` or `wa.me` patterns, or no referrer on mobile (WhatsApp strips referrer)
- Instagram: referrer matches instagram.com
- Direct: no referrer
- Other: referrer domain captured

**UTM parameters supported:**
- `?utm_source=whatsapp&utm_campaign=weekend-sale`
- Stored on page view event

**Device breakdown:**
- Mobile / Tablet / Desktop
- Derived from user agent

### E11-04 Shop-Level Analytics Dashboard

Available to Shop Manager and above for their assigned shop.

**Summary Cards (top of page)**
- Total views this period
- Unique visitors this period
- Total product clicks this period
- Average time on page
- vs previous period (% change with trend arrow)

**Offer Books Performance Table**
- List of all published offer books
- Columns: title, format, published date, views, unique visitors, clicks, top product
- Sortable by any column
- Click row → offer book detail view

**Offer Book Detail View**
- Views over time (line chart, daily)
- Traffic source breakdown (pie chart)
- Device breakdown (bar chart)
- Page-by-page view count (for multi-page catalogs)
- Top clicked products (ranked list with image + click count)
- Peak viewing hours (heatmap — hour of day vs day of week)

**Date Range Filter**
- Last 7 days / Last 30 days / Last 90 days / Custom range

### E11-05 Organization-Level Dashboard

Available to Organization Owner only. Shows aggregated data across all shops.

**Summary Cards**
- Total views across all shops
- Most active shop (by views)
- Top product across all shops
- Total offer books published

**Shop Comparison Table**
- One row per shop
- Columns: shop name, offer books published, total views, total clicks, top product

**Cross-Shop Trending Products**
- Products that are consistently high-performing across multiple shops
- Useful for head office to identify popular promotions to standardize

### E11-06 Weekly Analytics Email Report

Sent every Monday morning to the shop contact email and the organization owner.

**Shop-level report (one per shop)**
```
SouqStudio Weekly Report — [Shop Name]
Week of [date range]

📊 Your offer books got 340 views this week (↑23% vs last week)
👆 124 product clicks
⏱  Avg 1m 42s time spent
🔥 Top product: Samsung 65" TV — 48 clicks

Your offer books this week:
1. Weekend Electronics Sale  — 180 views  🔥
2. Fresh Produce Deals       — 95 views
3. Ramadan Special           — 65 views

[View full analytics →]
```

**Organization-level report (owner only)**
- Summary across all shops
- Which branch performed best
- Top products across the group

**Email delivery:** Resend API. Unsubscribe link included (per GDPR best practice).

---

## Privacy Considerations

- No personally identifiable information collected from viewers
- No persistent cookies on the viewer page
- Anonymous fingerprinting only (not stored beyond the session)
- Privacy policy linked in the viewer footer
- GDPR-compliant data retention: raw events kept 12 months, aggregated stats kept indefinitely

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- Charts: Tremor (built on Recharts) — clean dashboard components with minimal code
- Dashboard uses card-based layout with skeleton loading states
- Analytics data fetched client-side with SWR (stale-while-revalidate) — no SSR needed
- Date range picker: shadcn/ui DateRangePicker

---

## Backend Notes

- Events written to `page_views` and `product_clicks` tables on every viewer interaction
- Events are fire-and-forget from the viewer — tracked via a lightweight pixel endpoint `GET /t/v` and `POST /t/c`
- Aggregations computed at query time for dashboard (no pre-aggregation for MVP)
- If performance degrades at scale: add materialized views or migrate raw events to ClickHouse
- Weekly email job: BullMQ cron job runs every Monday 7am (org timezone)
- Bot detection: check user agent against a maintained bot list

---

## Database Tables

```
page_views
  id, offer_book_id, session_id, page_number,
  source, device, duration_seconds, created_at

product_clicks
  id, offer_book_id, offer_id, catalog_id, session_id, page_number, created_at
```

**A click belongs to an offer, not to a product.** E5 v2 made an offer N products at one
price, so the card a viewer taps may carry two SKUs. `offer_id` is the card; `catalog_id`
is which item within it, and is nullable because the public viewer cannot always tell.
Both were single non-null `catalog_id` before that change — any query written against the
old shape counts multi-product cards wrong.

---

## Out of Scope

- Real-time live view count (V3 — websocket)
- Heatmap overlays on the actual offer book pages
- A/B testing different offer book versions
- Conversion tracking (no purchase flow in product)
- ClickHouse migration (only if PostgreSQL query performance degrades)
