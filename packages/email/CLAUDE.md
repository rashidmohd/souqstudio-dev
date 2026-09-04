# packages/email

React Email templates. Shared package used by `apps/worker` (email.worker.ts).
Never imported by the Next.js frontend — server-side only.

---

## Why React Email

- Same team as Resend — tightest integration, shared primitives
- TypeScript-native — template props are typed, no runtime surprises
- Component model — Header and Footer are real components, updated once everywhere
- Dev server with hot reload for previewing templates locally
- `render()` produces email-safe HTML — handles table layouts, inline styles, email client quirks

---

## Directory structure

```
packages/email/
├── src/
│   ├── index.ts                    # Re-exports all templates + render helper
│   │
│   ├── components/                 # Atomic + composite — reused across templates
│   │   ├── primitives/
│   │   │   ├── Button.tsx          # CTA button — uses brand blue
│   │   │   ├── Divider.tsx         # Horizontal rule
│   │   │   └── Text.tsx            # Body text with correct font stack
│   │   │
│   │   └── blocks/
│   │       ├── Header.tsx          # Logo + top border — used by ALL templates
│   │       ├── Footer.tsx          # Legal + unsubscribe + address — used by ALL templates
│   │       └── CTASection.tsx      # Hero call-to-action block
│   │
│   ├── layouts/
│   │   └── Base.tsx                # Wraps Header + children + Footer
│   │                               # Every template uses this — never skip it
│   │
│   └── templates/                  # One file per email type. Each imports Base.
│       ├── auth/
│       │   ├── EmailVerification.tsx
│       │   ├── Welcome.tsx
│       │   ├── PasswordReset.tsx
│       │   └── UserInvite.tsx
│       ├── billing/
│       │   ├── PaymentSucceeded.tsx
│       │   ├── PaymentFailed.tsx
│       │   ├── PaymentFinalWarning.tsx
│       │   ├── PlanUpgraded.tsx
│       │   ├── PlanDowngraded.tsx
│       │   └── SubscriptionCancelled.tsx
│       ├── analytics/
│       │   └── WeeklyReport.tsx
│       └── notifications/
│           ├── LowCreditsWarning.tsx
│           ├── OfferBookExpiring.tsx
│           └── NewTemplateAvailable.tsx
│
├── preview/                        # React Email dev server — local only
│   └── emails/                     # Symlinks or re-exports for preview server
│
└── package.json
```

---

## The Base layout — always use this

Every template must use `Base.tsx`. No exceptions. This is what keeps all emails consistent.

```tsx
// src/layouts/Base.tsx
import { Html, Head, Body, Container, Preview } from '@react-email/components'
import { Header } from '../components/blocks/Header'
import { Footer } from '../components/blocks/Footer'

interface BaseProps {
  preview: string        // Short preview text shown in email client inbox list
  children: React.ReactNode
}

export function Base({ preview, children }: BaseProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Header />
          {children}
          <Footer />
        </Container>
      </Body>
    </Html>
  )
}

const body = {
  backgroundColor: '#F8F7F3',   // --sq-stone-50
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const container = {
  maxWidth: '600px',
  margin: '40px auto',
  backgroundColor: '#FFFFFF',
  borderRadius: '8px',
}
```

---

## Header component

```tsx
// src/components/blocks/Header.tsx
// Logo + top brand border. Appears on every email.
// Logo URL comes from environment — not hardcoded.
```

Header contains:
- 4px top border in `--sq-charcoal` (`#323232`)
- SouqStudio wordmark (light version, hosted on R2)
- No navigation links — emails are not the app

---

## Footer component

```tsx
// src/components/blocks/Footer.tsx
// Legal + unsubscribe + address. Appears on every email.
```

Footer contains:
- "Powered by SouqStudio" (or "© 2025 SouqStudio")
- Mailing address (required for CAN-SPAM / UAE commercial email compliance)
- Unsubscribe link — points to `/settings/notifications` for preference management
  For transactional emails (billing, auth): no unsubscribe link (legally required to send)
  For marketing emails (weekly report, new templates): unsubscribe link required
- Privacy policy link

---

## Template anatomy

```tsx
// src/templates/auth/Welcome.tsx
import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

interface WelcomeEmailProps {
  shopOwnerName: string
  dashboardUrl: string
}

export function WelcomeEmail({ shopOwnerName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <Base preview={`Welcome to SouqStudio, ${shopOwnerName}`}>
      <Section style={section}>
        <Heading style={heading}>Welcome, {shopOwnerName}</Heading>
        <Text style={body}>
          Your account is ready. Set up your brand and create your first offer book.
        </Text>
        <Button href={dashboardUrl}>Set up your brand</Button>
      </Section>
    </Base>
  )
}

// Inline styles only — no class names in email templates.
// Use token values directly as hex strings — the CSS variable system
// does not work in email clients.
const section = { padding: '32px 40px' }
const heading = { fontSize: '24px', color: '#323232', marginBottom: '16px' }
const body = { fontSize: '14px', color: '#55534D', lineHeight: '22px' }
```

---

## Token usage in email templates

CSS variables do not work in email clients. Use the hex values directly.
These are the safe values to use in templates:

| Use | Value |
|---|---|
| Page background | `#F8F7F3` |
| Card background | `#FFFFFF` |
| Primary text | `#323232` |
| Secondary text | `#55534D` |
| Muted text | `#6E6C64` |
| CTA button bg | `#143CD2` |
| CTA button text | `#FFFFFF` |
| Link colour | `#143CD2` |
| Border | `rgba(50,50,50,0.14)` |
| Success bg | `#EFFAD4` |
| Success text | `#3F6212` |
| Warning bg | `#FDF3E2` |
| Warning text | `#92510A` |
| Error bg | `#FDECEA` |
| Error text | `#B3261E` |

Never use `--sq-tpl-*` values in email templates.
Never use `--sq-sky`, `--sq-gold`, `--sq-sand` as text colours (fill-only tier). There is no `--sq-lime`.

---

## Rendering + sending (from email.worker.ts)

```typescript
import { render } from '@react-email/render'
import { WelcomeEmail } from '@souqstudio/email'
import { Resend } from 'resend'

const resend = new Resend(env.RESEND_API_KEY)

async function sendWelcomeEmail(to: string, props: WelcomeEmailProps) {
  const html = await render(WelcomeEmail(props))

  await resend.emails.send({
    from: 'SouqStudio <hello@souqstudio.com>',
    to,
    subject: `Welcome to SouqStudio, ${props.shopOwnerName}`,
    html,
  })
}
```

The worker receives an `email.send` job with `{ template: 'welcome', to, props }`.
It dynamically imports the template, renders it, and sends via Resend.
All email sending is async — never blocks an API response.

---

## Weekly analytics report (special case)

`WeeklyReport.tsx` receives structured data and renders a full performance summary.
It is the most complex template — it loops over offer books and renders a table.

Props:
```typescript
interface WeeklyReportProps {
  shopName: string
  dateRange: { from: string; to: string }
  totalViews: number
  viewsChange: number          // percentage vs previous week
  totalClicks: number
  avgTimeSeconds: number
  topProducts: Array<{ name: string; clicks: number; imageUrl: string }>
  offerBooks: Array<{ title: string; views: number; clicks: number }>
  analyticsUrl: string
}
```

---

## Local development

```bash
cd packages/email
pnpm dev        # Starts React Email preview server at localhost:3000
                # Shows all templates with live reload
```

Test real sending to your own inbox before marking any template done.
Use Resend's test mode for CI.

---

## Rules

- Every template uses `Base.tsx` — header and footer are never optional.
- Inline styles only — no Tailwind, no class names in email templates.
- Plain English subject lines. Sentence case. Never "Your SouqStudio Weekly Analytics Report Is Ready".
- One CTA per email. Never two buttons.
- Images hosted on R2 — absolute URLs only, no relative paths.
- Alt text on every image. Empty alt for decorative images (`alt=""`).
- Test in Gmail, Outlook.com, and Apple Mail before shipping.
- Subject lines under 60 characters.
- Preview text (inbox snippet) must be different from the subject line.
