# E1 — Authentication & Onboarding

## Overview

Handles everything from first landing on the product to completing brand setup and creating the first offer book. This is a fully self-served flow — no manual intervention from the SouqStudio team at any point.

**Priority:** MVP

---

## Features

### E1-01 Signup

- Email + password signup
- Google OAuth signup
- On submit: create Organization + default Shop + Owner user record in one transaction
- **Email verification comes before brand setup**, not after. Signup signs the
  owner in and sends them to `/verify-email`; entering the code takes them on to
  `/onboarding`. Enforced by `requireVerifiedSession()` on the onboarding route,
  so typing the URL does not skip it.

  This overrides the earlier "verification required before accessing *editor*"
  reading, which allowed brand setup while unverified. Verifying first means a
  shop is never fully configured behind an address that cannot receive mail —
  every later flow (reset, invites, export notifications) assumes a working inbox.
- Verification code is a six-digit OTP, 15 minutes, five attempts. Resends are on
  an escalating cooldown: 1, 3, 10 then 60 minutes.
- No credit card required to start

### E1-02 Login

- Email + password login
- Google OAuth login
- Remember me (30-day session)
- Forgot password → reset via email link (expires 1hr)
- Failed login lockout after 5 attempts (15 min cooldown)

### E1-03 Two-Factor Authentication

Built. Mechanism and reasoning: `souqstudio-technical` → `references/auth.md`.

- TOTP-based 2FA (Google Authenticator, Authy)
- Enable / disable from account settings — `/settings/account`
- Backup codes generated on setup (show once, downloadable). Ten codes, twelve
  Crockford base32 characters, alphanumeric so they cannot be mistaken for the
  six-digit authenticator code on the same screen.
- 2FA required prompt if org owner enables it org-wide

Four things worth knowing before touching this:

- **A correct password with 2FA on issues a challenge, not a session.** A row in
  `sessions` means authenticated; the challenge has its own cookie and table.
- **A wrong code counts as a failed login.** The per-challenge cap bounds nothing
  on its own. This is why `clearFailures()` runs at the end of login rather than
  after the password.
- **Password reset is not a 2FA bypass** and must never become one.
- **Recovery is the org owner**, who can reset a teammate. An owner who loses
  their own device *and* codes has no path — see the known gaps in `CLAUDE.md`.

### E1-04 Guided Brand Setup (First Login)

Triggered automatically on first login. Cannot be skipped — required to unlock the editor.

```
Step 1: Upload Logo
  → Auto background removal runs
  → Auto color extraction suggests brand colors
  → Live preview updates app theme

Step 2: Confirm / Adjust Brand Colors
  → Primary, secondary, accent
  → Color picker override available

Step 3: Choose Grid Style
  → 5 options shown with live product preview

Step 4: Choose Template
  → 5 options shown in their brand colors

Step 5: Done
  → "Your brand is ready. Create your first offer book →"
```

Each step has a back button. Progress saved automatically so refreshing doesn't restart the flow.

**Built.** `app/(auth)/onboarding/page.tsx` and `components/brand/*`. The
underlying features are E4-01 to E4-04; this is the guided first run of them.

Four things worth knowing:

- **Nobody waits on background removal.** The logo appears the moment it
  uploads and the cutout swaps in behind them. If Rembg is down — a separate
  Python service — the shop keeps the logo as uploaded and setup completes
  normally. Verified: with Rembg unreachable the kit settles on `original` in
  about a second.
- **The upload goes browser → R2 directly**, against a presigned URL. Proxying
  it through a route would cap the file at Vercel's 4.5MB body limit, and
  E4-01 allows 10MB.
- **Progress is saved server-side after every step**, on `shops.brandKit`, so a
  refresh or a switch to another device resumes rather than restarts. Going
  back never lowers the resume point.
- **Finishing is checked, not claimed.** A client posting `complete` with half a
  kit is refused — otherwise the editor unlocks with no template to render with.

Grids and templates are seeded rows, not constants: `pnpm db:seed`.

### E1-05 Getting Started Checklist

Visible on dashboard until all items are complete. Dismissible after first offer book is published.

- [x] Set up your brand
- [ ] Create your first offer book
- [ ] Share your first offer book
- [ ] Invite a team member
- [ ] Connect Instagram (optional)

Clicking any item deep-links to the relevant section.

**Built.** `app/(dashboard)/page.tsx` + `components/shared/GettingStartedChecklist.tsx`.

- **Every item is measured, never remembered.** There is no "completed" column;
  each item is a question about the data, so it stays honest if a shop deletes
  its only offer book or removes its last teammate.
- **Dismissal is per user**, not per organization. The items track shop and org
  progress, but a manager hiding the list must not hide it from the owner. The
  server refuses to dismiss before an offer book is published — the button is
  hidden until then, and a hidden button is not a rule.
- **Items whose screen does not exist yet are not links.** They say so rather
  than pointing at a 404, gated on `apps/web/lib/features.ts`. Flip the flag in
  the same change that adds the route. Today only "Set up your brand" is
  reachable; the other four wait on E6, E10, E2 and E10 respectively.

This story also created **`app/(dashboard)/page.tsx`, which did not exist** —
`/` returned a 404, so finishing brand setup, finishing forced two-factor
enrollment, and revisiting a completed `/onboarding` all dead-ended. Home is the
offer books list per `layout-map.md`; the list is empty for everyone until E6
ships an editor that can create one.

---

## User Roles at Signup

The user who signs up becomes the **Organization Owner** automatically. They can invite others after setup.

---

## Frontend Notes

- Component library: shadcn/ui
- Styling: Tailwind CSS
- Style tokens: defer to `/skills/style` (to be created) for all spacing, color, and typography
- Animations: Framer Motion (step transitions in brand setup flow)
- Brand setup preview updates live using Zustand store — no page reload
- Google OAuth via next-auth

---

## Backend Notes

- Auth: **own session layer**, with next-auth used only for the Google OAuth
  handshake. These notes originally said "next-auth with credentials + Google"
  *and* "sessions in the database" — those two cannot both hold. next-auth's
  credentials path encodes a JWT into the cookie and never writes a session row,
  adapter or not. Database sessions won, because revocability is why they were
  specified. See `souqstudio-technical` → `references/auth.md`.
- Passwords hashed with bcrypt (12 rounds)
- Sessions stored in database (not JWT) for revocability. The cookie holds a
  random token; the table holds only its SHA-256 hash.
- Email verification and password reset tokens stored in `verification_tokens` table with expiry
- Organization + Shop + User created in a single Prisma transaction on signup

---

## Database Tables

```
users
verification_tokens
sessions
organizations
shops
two_factor_challenges       # E1-03 — the half-authenticated state at login
two_factor_enrollments      # E1-03 — a secret shown but not yet proven
two_factor_backup_codes     # E1-03 — hashed, single-use
```

---

## Google sign-in — status

The button and divider are built on both screens and hidden behind two gates in
`apps/web/lib/oauth.ts`: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` being set,
**and** `GOOGLE_HANDLER_BUILT`. Credentials alone must not reveal the button —
whoever pastes a client id would get a 404 and assume they pasted it wrong.

Still to build: the handler at `/api/v1/auth/google`, which hands off to
next-auth and then issues one of *our* sessions like any other login.

**One open product decision.** Password signup collects a shop name; Google
returns only an identity. So a Google signup either invents a placeholder shop
name and collects the real one during brand setup, or asks for it on a step
between Google and onboarding. Decide before building the handler — it changes
what the onboarding wizard must cover.

## Out of Scope

- SSO / SAML (Enterprise — later). There is no generic "sign in with SSO"
  button; the reference design's SSO control is Google sign-in here.
- Magic link login (consider for V2)
- Phone number signup
