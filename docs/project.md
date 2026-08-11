# SouqStudio — Project Overview

> AI-Powered Retail Offer Book Creator for the UAE & GCC Market

---

## Vision

SouqStudio enables retail shop owners — from single independent stores to large multi-branch chains — to create professional, branded offer books and promotional materials in minutes, not days.

Shop owners search for products from a pre-built catalog, set their prices, and the platform generates a fully designed, on-brand offer book ready to share on WhatsApp, Instagram, or download as a print-ready PDF.

**No designer. No agency. No waiting.**

> "From product selection to shareable offer book in under 30 minutes — automatically branded, AI-enhanced, and fully tracked."

---

## Problem

Retail chains across the UAE spend significant time and money creating weekly or monthly promotional materials:

- Dedicated internal teams cost AED 8,000–15,000/month per person
- Most chains outsource to agencies in India — adding 3–5 day turnaround and extra cost
- Even shops with internal teams outsource overflow work
- Existing tools (Canva, Flipsnack) require design skills or a pre-made PDF as input
- No tool is purpose-built for WhatsApp-first retail marketing in the GCC

**Validated:** A Dubai-based retail chain owner confirmed dedicated teams exist for this, and that outsourcing to India is standard practice even for chains with internal staff.

---

## Solution

A self-served SaaS platform with three core pillars:

**1. Pre-Built Product Catalog**
Shop owners never upload product images for common items. They search a master catalog — powered by PostgreSQL tsvector with multilingual synonyms (English, Arabic, Hindi, Urdu) — and select products in seconds.

**2. Brand-Aware Editor**
Shop sets up their brand once (logo, colors, grid, template). Every offer book created is automatically on-brand. Manual adjustments available for power users.

**3. Multi-Format Output**
Same design exports instantly to Instagram Post, WhatsApp image, Story, A4 catalog, or print-ready PDF. Analytics track every view, click, and share.

---

## Target Market

**Primary:** UAE retail chains and independent shops
- Grocery / supermarket chains
- Pharmacy chains
- Electronics retailers
- General merchandise / hypermarkets

**Expansion path:** KSA → Qatar → Kuwait → Bahrain → Oman

---

## Business Model

Self-served SaaS. Base plan + per extra shop add-on.

| Plan | Price | Shops | AI Credits |
|---|---|---|---|
| Starter | $15/mo | 1 shop | 50/mo |
| Pro | $35/mo | 3 shops (+$10 each extra) | 200/mo |
| Business | $89/mo | 10 shops (+$7 each extra) | 500/mo |
| Enterprise | Custom | Unlimited | Custom |

AI Credit top-ups: 100 credits = $8

---

## Account Hierarchy

```
ORGANIZATION (billing entity)
    └── SHOP (operational unit)
            └── USERS (individuals)
```

All plans are self-served. No manual provisioning. No sales calls.

---

## Epics

| ID | Epic | Priority |
|---|---|---|
| E1 | Authentication & Onboarding | MVP |
| E2 | Organization Management | MVP |
| E3 | Billing & Subscription | MVP |
| E4 | Brand Setup | MVP |
| E5 | Product Catalog | MVP |
| E6 | Offer Book Editor | MVP |
| E7 | Template & Grid Management | MVP |
| E8 | AI Features | V2 |
| E9 | Output Formats & Export | MVP |
| E10 | Sharing & Publishing | MVP |
| E11 | Analytics & Tracking | V2 |
| E12 | Notifications | V2 |
| E13 | Admin Panel | MVP |

---

## Key Principles

- **Self-served first** — every flow works without any human involvement from the SouqStudio team
- **Mobile-aware** — shop owners manage on phones; editor works on desktop
- **WhatsApp-first** — primary distribution channel for GCC market
- **Brand consistency** — set once, applied everywhere, forever
- **Speed** — first shareable output in under 30 minutes from signup
- **Frontend styling** — all UI defers to the style skill (`/skills/style`) for tokens, spacing, typography, and color. Do not hardcode design decisions in components.

---

## Out of Scope (for now)

- Print ordering / fulfillment (V4)
- ERP or POS integration
- Customer-facing storefront
- Native mobile app (PWA sufficient for V1)
