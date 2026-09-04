# apps/web

Next.js 14 App Router. Shop owner-facing product.
Handles: UI, API routes, auth, Stripe webhooks, shareable offer book viewer.

---

## Directory structure

```
apps/web/
├── app/
│   ├── (auth)/                    # Login, signup, onboarding — no nav
│   │   ├── login/
│   │   ├── signup/
│   │   └── onboarding/            # Brand setup wizard (steps 1–4)
│   ├── (dashboard)/               # Protected — requires auth + verified org
│   │   ├── layout.tsx             # Shell with left rail nav
│   │   ├── page.tsx               # Home = offer books list
│   │   ├── editor/
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Full-bleed offer book editor — escapes shell
│   │   ├── card-designer/
│   │   │   └── [templateId]/
│   │   │       └── page.tsx       # Full-bleed card designer — escapes shell
│   │   ├── catalog/               # Product catalog browser
│   │   ├── brand/                 # Brand kit management
│   │   ├── analytics/             # Analytics dashboard
│   │   └── settings/
│   │       ├── organization/
│   │       ├── shops/
│   │       ├── team/
│   │       └── billing/
│   ├── o/
│   │   └── [code]/
│   │       └── page.tsx           # Public offer book viewer — SSR, no auth
│   └── api/
│       └── v1/
│           ├── auth/              # signup, login, logout, verify, reset
│           │                      # [...nextauth] here is Google OAuth only
│           ├── organizations/
│           ├── shops/
│           ├── catalog/
│           ├── offer-books/
│           ├── export/            # Queues PDF job, returns jobId
│           ├── ai/                # Queues AI jobs, polls status
│           ├── analytics/
│           ├── billing/
│           └── webhooks/
│               └── stripe/        # Stripe webhook — public, signature-verified
├── components/
│   ├── ui/                        # shadcn/ui — never edit directly
│   ├── editor/                    # Offer book editor canvas components
│   ├── card-designer/             # Card designer canvas components
│   ├── catalog/                   # Product search + category browser
│   ├── brand/                     # Brand setup step components
│   ├── offer-book/                # Offer book list, card, preview
│   ├── analytics/                 # Charts, stat cards
│   ├── billing/                   # Plan cards, usage meters
│   └── shared/                    # Layout, nav, empty states, illustrations
├── stores/
│   ├── editor-store.ts            # Zustand — canvas state + undo stack
│   ├── brand-store.ts             # Zustand — brand kit (drives live preview)
│   └── notification-store.ts      # Zustand — in-app notification bell
├── lib/
│   ├── env.ts                     # Zod-validated env vars — import this, not process.env
│   ├── session.ts                 # issue / verify / rotate / revoke — sole writer
│   ├── password.ts                # bcrypt 12 rounds + timing defense
│   ├── tokens.ts                  # CSPRNG tokens, SHA-256 hashing, TTLs
│   ├── lockout.ts                 # 5 attempts, 15 min cooldown
│   ├── auth.ts                    # next-auth config — Google OAuth only
│   ├── stripe.ts                  # Stripe client (server-side only)
│   ├── r2.ts                      # Cloudflare R2 client
│   ├── queue.ts                   # BullMQ queue producers (add jobs)
│   └── utils.ts                   # cn(), formatCurrency(), etc.
├── styles/
│   ├── globals.css
│   └── souqstudio-tokens.css      # Design tokens — authoritative source
├── middleware.ts                   # Auth check + org context injection
└── next.config.ts
```

---

## Routing rules

- `(auth)` layout: no navigation, centred single column, one decision per screen.
  This flow is the entire sales team — no nav visible means no early exits.
- `(dashboard)` layout: persistent left rail, collapses to icons below 1024px, and
  collapsible by the owner above it — a toggle in the rail head, remembered in the
  `sq_rail` cookie and read by the layout on the server so it never flashes the
  wrong width. Left rail has two scope zones: shop scope above divider, org below.
- Editor route `editor/[id]`: escapes the shell entirely. Full bleed, no rail.
  Three panes: catalog (start), artboard (centre), properties (end).
  On mobile (<1024px): side panels overlay the canvas, never compress it.
- Card designer route `card-designer/[templateId]`: also escapes the shell. This is
  NOT the offer book editor — one card on a canvas, no page grid, no product selection,
  no pagination. Three panes: component palette (start), card canvas (centre),
  properties (end). Same overlay-not-compress rule below 1024px.
  A template is bound to one language at creation; direction is a segmented control
  in the designer chrome. Numerals are never affected by it.
- `o/[code]`: public viewer. SSR. Zero chrome. Separate layout. Architecturally
  distinct from the dashboard — it is seen thousands of times per book by people
  who have never heard of SouqStudio. Mobile-first, fast paint, lazy images.

There are five layout families, not four. See "The five layout families" in the
design skill. Conflating any two causes trouble later.

---

## Component rules

- Design system primitives live in `components/ui/`, kebab-case. Their file path
  and prop signature are owned by `souqstudio-design` →
  `references/component-inventory.md`. Build to the signature listed there and
  mark it `built`; never invent a second API for a component already in the file.
- Several primitives are hand-written wrappers, not raw CLI output — `Input`
  takes a required `label`, which stock shadcn does not. Where a shadcn component
  *is* used unchanged, do not edit it: fix it through the shadcn/ui bridge in
  `souqstudio-tokens.css`.
- Do not use arbitrary Tailwind colour classes. Use token variables.
- Every illustration must be checked against `.claude/skills/souqstudio-design/references/illustration-selection.md`
  before placement. Most screens do not need one.
- Empty states: Host Grotesk title naming the space, one line of body, one verb CTA.
  Never "Nothing here yet."
- Home is the offer books list. "Duplicate last week" sits beside the primary New button.
- **Never link to a screen that does not exist yet.** `lib/features.ts` carries a
  boolean per unbuilt epic; a control whose destination is off renders disabled with
  the reason visible, or not at all. A link to a 404 is worse than no link — the shop
  owner cannot tell whether they did something wrong. Same reasoning as
  `GOOGLE_HANDLER_BUILT` in `lib/oauth.ts`. Flip the flag in the change that adds
  the route.

---

## Canvas rules (Fabric.js) — applies to BOTH the editor and the card designer

- Do not use React state to manage canvas internals.
  Zustand store holds the logical state. Fabric.js holds the visual state.
- `await document.fonts.load()` for every font family and weight in the brand kit
  BEFORE instantiating any Fabric.js text objects. Missing this breaks all bounding boxes.
- Re-measure text objects on font change.
- Canvas coordinates stay LTR always. Never let UI direction affect canvas maths.
- `canvas.toDataURL()` for social image export (client-side, instant).
- `canvas.toSVG()` to send to the worker for PDF generation (server-side).
- Auto-save: debounced 2 seconds. Patch `PATCH /api/v1/offer-books/:id`. No manual save button.

**Canvas parity is a hard requirement.** Both artboards use identical padding, zoom
controls, selection outline and handle treatment. A shop moving between designing a
card and building a book must not feel they changed application.

### Card designer only

- **Bound vs static components must be distinguishable at a glance.** Bound components
  pull live product data (image, brand, name, variant, price, offer price, offer type,
  discount badge, unit). Static components are identical on every card. Mark bound
  components in all three places: `--sq-ui-selected-ring` outline on canvas, leading
  indicator in the layer list, grouped section in the palette. Never rely on the
  properties panel alone.
- **Bound components render sample data, never field names.** `Samsung` and `1,449.00`,
  not `{brand}` and `{price}`. A card designed against placeholder tokens looks balanced
  and then collapses on real content.
- **Stress preview is always visible, never behind a tab.** A persistent panel showing
  the card under worst-case data from the shop's own catalog — longest product name,
  absent brand, longest price, transparent-background image. Render at the same scale
  as the canvas.
- **Every bound component carries an overflow policy** set in the properties panel:
  shrink-to-fit with a floor, clamp to N lines, or truncate. Surface it as a first-class
  control. The price floor is never zero and never editable down to illegibility.

---

## API route rules

- All routes return `{ data: T, error: null }` or `{ data: null, error: { code, message } }`.
- **Every route verifies its own session** via `requireSession()` from
  `lib/session.ts`. `middleware.ts` only checks that a cookie exists — it runs on
  Edge and cannot reach the database. See `references/auth.md`.
- Never trust `organizationId` sent from the client. Read it from the session.
- Stripe webhook at `/api/v1/webhooks/stripe` — verify signature before processing.
  Listen for: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `checkout.session.completed`.
- Export and AI routes queue a BullMQ job and return a `jobId` immediately.
  Client polls `GET /api/v1/ai/jobs/:jobId` for status.

---

## Auth rules

**Sessions are ours. next-auth handles the Google handshake only.**

next-auth cannot give database sessions to a password login. Its credentials path
encodes a JWT into the cookie and never writes a session row, whether or not an
adapter is configured — verified in `@auth/core` `lib/actions/callback/index.js`.
Since revocability is the requirement that decided database sessions in the first
place, the session layer is ours and next-auth is scoped to OAuth. Full reasoning:
`souqstudio-technical` → `references/auth.md`.

- Providers: email + password against `users.passwordHash`, plus Google OAuth
  through next-auth.
- **Sessions live in the `sessions` table.** The cookie carries a random token;
  only its SHA-256 hash is stored, so a leaked dump cannot be replayed.
- **Never write a session row from anywhere but the session module.** Rotation
  and revocation stop being trustworthy the moment a second writer exists.
- Session tokens rotate on refresh. Each row carries `familyId`; presenting a
  token already marked `replacedById` means it was stolen — revoke the family.
- `users.tokenVersion` invalidates every session at once: password change, 2FA
  reset, or an owner revoking access.
- Middleware protects all `(dashboard)` routes. Redirects to `/login`.
- **Signup → verify → onboarding, in that order.** Signup issues a session and
  redirects to `/verify-email`; the code takes them to `/onboarding`. Any route
  that requires a verified owner calls `requireVerifiedSession()`, not
  `requireSession()` — the redirect alone is a suggestion, the guard is the rule.
- **2FA: TOTP, built.** Enabled per user at `/settings/account`. Backup codes are
  hashed and single-use. A correct password with 2FA on issues a *challenge*
  (`sq_2fa` cookie, `two_factor_challenges` table) — **not** a session row, and
  not a flag on one. `lib/login.ts` → `completeLogin()` is the only caller of
  `issueSession` outside `session.ts` (signup excepted), which is what stops the
  future Google handler from skipping the second factor. A wrong code counts
  toward `failedLoginAttempts`. Full reasoning: `references/auth.md`.
- Lockout: 5 failed attempts, 15 minute cooldown — `lib/lockout.ts`.
- Always run the password comparison, even when the email does not exist —
  `burnPasswordTiming()` in `lib/password.ts`. Returning early leaks which
  addresses are registered.

---

## Fonts — critical

Fonts are self-hosted in R2, not fetched from fonts.googleapis.com at render time.
`next/font` is used for Host Grotesk and IBM Plex Sans Arabic with `display: swap`.
IBM Plex Mono loaded the same way.
Font files must be preloaded in `<head>` for the editor route.

---

## Internationalisation

- UI ships in English and Arabic at v1.
- `dir` is scoped, never global. The artboard does not mirror with the UI.
- `html[lang='ar']` in the token file adjusts type sizes automatically.
- Logical CSS properties only. Enforced by `packages/config/eslint.design.cjs`.
- Test both directions on every screen before marking done.
- Currency: `AED 1,842.00` — code first, thin space, two decimals. Always Latin in Arabic layouts.

---

## Performance targets

| Metric | Target |
|---|---|
| Catalog search response | < 200ms |
| Social image export (PNG) | Instant — client-side |
| Analytics dashboard load | < 1 second |
| Public viewer first paint | < 1.5 seconds on 4G |
