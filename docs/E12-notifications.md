# E12 — Notifications

## Overview

Notifications keep shop owners informed without requiring them to log in. Transactional emails cover critical events. In-app notifications handle real-time alerts. WhatsApp notifications are the high-value channel for the GCC market (V2). All notification types are managed by admins via an internal panel.

**Priority:** MVP (transactional email, in-app), V2 (WhatsApp)

---

## Notification Channels

| Channel | Priority | Use Case |
|---|---|---|
| Transactional Email | MVP | Billing, invites, verification, reports |
| In-App | MVP | Real-time alerts inside the product |
| WhatsApp | V2 | High-engagement alerts for GCC market |

---

## Features

### E12-01 Transactional Emails

Sent automatically on system events. No opt-out (required for product function).

| Email | Trigger | Recipient |
|---|---|---|
| Email verification | Signup | New user |
| Welcome | After verification | New org owner |
| Invite to organization | User invited | Invited user |
| Password reset | Reset requested | User |
| Plan upgraded | Upgrade confirmed | Org owner |
| Plan downgraded | Downgrade confirmed | Org owner |
| Subscription cancelled | Cancellation confirmed | Org owner |
| Payment succeeded | Invoice paid | Org owner |
| Payment failed | Invoice payment failed | Org owner |
| Payment final warning | 5 days before suspension | Org owner |
| Account suspended | After grace period | Org owner |
| Weekly analytics report | Every Monday | Shop contact + org owner |
| Low AI credits warning | Credits < 20% remaining | Org owner |
| Offer book expiring | 2 days before expiry | Shop manager |
| New template available | Admin publishes template | All active org owners |

**Email provider:** Resend API
**Email template engine:** React Email (renders React components to HTML)

### E12-02 In-App Notifications

Bell icon in the top navigation. Unread count badge.

**Notification types:**
- ✅ Offer book published successfully
- ⚠️ AI credit balance low (< 20%)
- 🎉 New template available
- 📊 Weekly report ready (link to analytics)
- ❌ PDF export failed (with retry link)
- 💳 Payment failed (with update card link)
- 👤 New user joined your organization
- 📱 Instagram post published / failed

**Notification panel:**
- Slide-out panel from bell icon
- Shows last 30 notifications
- Mark as read / mark all as read
- Click notification → deep-links to relevant section
- Notifications persist for 90 days

### E12-03 WhatsApp Notifications (V2)

High-priority alerts and weekly summaries delivered via WhatsApp — far higher open rates than email in the GCC market.

**Provider:** Wati (WhatsApp Business API — popular in UAE/GCC) or Twilio

**WhatsApp Notification Types**

| Message | Trigger | Category |
|---|---|---|
| Weekly performance summary | Every Monday | Marketing (opt-in) |
| Low credit alert | Credits < 20% | Transactional |
| Offer book expiry reminder | 2 days before expiry | Transactional |
| Payment failed alert | Invoice payment failed | Transactional |

**Opt-in Flow:**
- Transactional WhatsApp messages: opt-in during onboarding (pre-checked)
- Marketing WhatsApp messages (weekly report): opt-in separately
- Unsubscribe via reply "STOP" — handled by provider
- Phone number collected during org setup

**Message format example (weekly summary):**
```
📊 SouqStudio Weekly Report
Shop: Al Madina — Deira

This week: 340 views (↑23%)
Top product: Samsung 65" TV

View full report: souqstudio.com/analytics/...
Reply STOP to unsubscribe
```

**Cost awareness:**
- Transactional messages: ~$0.005–0.02 per message
- Marketing messages: ~$0.04–0.08 per message
- Budget monitored in admin panel — alerts if monthly spend exceeds threshold

### E12-04 Admin Broadcast

Available in the Admin Panel (E13). SouqStudio team can send messages to selected shops or all shops.

**Broadcast types:**
- Email broadcast (all active orgs, or filtered by plan / region)
- WhatsApp broadcast (opted-in users only)
- In-app notification broadcast (all active users)

**Use cases:**
- New feature announcement
- Seasonal template available ("Eid templates are live!")
- Maintenance window notice
- Promotional message (upgrade to Pro)

**Targeting options:**
- All organizations
- By plan tier
- By region / country
- By last active date (e.g. users inactive for 30 days)

---

## Notification Preferences (User Settings)

Users can manage their notification preferences from account settings:

| Notification | Email | In-App | WhatsApp |
|---|---|---|---|
| Weekly analytics report | ✓ toggle | ✓ always | ✓ toggle |
| Low credit alert | ✓ always | ✓ always | ✓ toggle |
| New templates | ✓ toggle | ✓ toggle | ✓ toggle |
| Billing alerts | ✓ always | ✓ always | ✓ toggle |

"Always" = cannot be disabled (critical for account function)
"Toggle" = user can opt out

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style`
- In-app notification bell: Zustand store, updated via polling every 60s or WebSocket (V2)
- Notification panel: shadcn/ui Sheet component (slide-out)
- Unread count: red badge on bell icon
- WhatsApp opt-in: simple toggle in onboarding and account settings

---

## Backend Notes

- Transactional emails: Resend API with React Email templates
- Email queue: BullMQ — all emails queued, never sent synchronously
- WhatsApp: Wati REST API or Twilio WhatsApp API
- Weekly report job: BullMQ cron (`0 7 * * 1` = Monday 7am UTC)
- In-app notifications stored in `notifications` table, fetched by client
- Broadcasts: BullMQ bulk job — processes in batches of 100 to avoid rate limits

---

## Database Tables

```
notifications
  id, user_id, type, title, body, link,
  read_at, created_at

notification_preferences
  id, user_id, channel (email/whatsapp/in_app),
  notification_type, enabled

whatsapp_opt_ins
  id, user_id, phone_number, opted_in_at, opted_out_at
```

---

## Out of Scope

- SMS notifications
- Push notifications (native mobile app not in scope)
- Slack integration
- Custom notification rules (e.g. "notify me when views exceed 1000")
