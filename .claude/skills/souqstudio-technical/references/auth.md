# Authentication

Covers session management, password handling, lockout, verification tokens and 2FA.
Governs E1. Read before touching anything under `apps/web/lib/` named `auth`,
`session`, `password`, `tokens` or `lockout`, or any route under `api/v1/auth/`.

---

## The decision

**We own the session layer. next-auth handles the Google OAuth handshake and
nothing else.**

E1 originally asked for two things that cannot both be true:

> - Auth: next-auth with credentials + Google provider
> - Sessions stored in database (not JWT) for revocability

next-auth cannot do both. Its credentials path calls `callbacks.jwt`, runs
`jwt.encode`, and writes the encoded token straight into the session cookie — it
never creates a session row, and it never consults the session strategy. Confirmed
in `@auth/core@0.41.3`:

- `lib/init.js:74` — `strategy: config.adapter ? "database" : "jwt"`
- `lib/actions/callback/index.js:247-270` — the credentials branch, which ignores it

Configuring `@auth/prisma-adapter` does not change this. Password logins get a JWT.

Database sessions won the tie, because revocability is the reason they were
specified. A JWT cannot be revoked; the best available approximation is checking a
version column on every request, which costs the same database read that a session
lookup costs while delivering less.

**What this rules out.** `auth()`, `getServerSession()` and next-auth's middleware
helpers are not the source of truth for whether a request is authenticated. Reading
the session means reading our table. Using a next-auth helper to gate a route is a
bug, not a shortcut.

---

## Where verification happens

**Middleware cannot authenticate on Next 14.** It runs on the Edge runtime with no
opt-out — `export const runtime = 'nodejs'` is silently ignored — so Prisma is
unavailable. Importing `@souqstudio/db` there fails the build outright: its barrel
export pulls in BullMQ and ioredis, which need `node:diagnostics_channel`.

So the split is:

| Layer | Runtime | Does |
| --- | --- | --- |
| `middleware.ts` | Edge | Cookie present? If not, redirect to `/login`. Nothing else. |
| `requireSession()` | Node | Hashes the cookie, hits the database, applies every check. |

The middleware exists to spare an unauthenticated visitor a round trip, not to make
a security decision. **"Middleware did not redirect me" is not proof of a session.**
Every protected page and route handler calls `requireSession()` itself.

`/login/2fa` is in `PUBLIC_PATHS`, and must stay there. The second-factor screen
sits between a correct password and a session, so there is no session cookie to
find; without the exemption middleware bounces it to `/login`, the password
succeeds, and it bounces again — a login that can never complete. It is not
really public: reaching it needs the challenge cookie, which the page checks in
Node.

If the project moves to Next 15.2+, Node-runtime middleware becomes available and
this split can be revisited — but the rule that routes verify for themselves should
survive it. Defence in depth costs one indexed lookup.

---

## Sessions

The cookie carries a random token. The `sessions` table stores only its SHA-256
hash, so a dump of that table cannot be replayed as a login.

SHA-256 rather than bcrypt is deliberate: the token is 32 bytes from a CSPRNG, so
there is no dictionary to attack and a slow KDF buys nothing but latency on every
request. Passwords are the opposite case — see below.

### Lifecycle

| Step | What happens |
| --- | --- |
| Issue | Generate a token, store its hash with a fresh `familyId`, set the cookie |
| Verify | Hash the incoming cookie, look up by `tokenHash`, check `expiresAt` and `revokedAt` |
| Rotate | On refresh, write a new row with the same `familyId`, point the old row's `replacedById` at it |
| Revoke | Set `revokedAt` — on one row, or on every row sharing a `familyId` |

### Theft detection

A token whose row already carries `replacedById` has been used twice. Legitimate
clients never do this: they hold exactly one current token. Two uses means the
token was copied, so **revoke the entire family**, not just that row — the thief
and the victim are both holding descendants of it.

### Rules

- **Only the session module writes to `sessions`.** A second writer makes rotation
  and revocation untrustworthy, and nothing will catch it at review time.
- Never log a raw token. Log the row `id` if you need a handle.
- `ipHash` is hashed, not stored raw — it is personal data under GDPR and the UAE
  PDPL, and "is this a new location" only needs equality.
- `users.tokenVersion` invalidates everything at once: password change, 2FA reset,
  owner revoking access. Bumping it is cheaper than deleting rows and cannot miss one.
- The `sessions` table is **not** RLS-gated on `organizationId`. It is read before
  the org context exists — reading it is how the org is discovered. Isolation comes
  from the token being unguessable.

---

## Passwords

bcrypt at 12 rounds — `apps/web/lib/password.ts`.

`bcryptjs`, not native `bcrypt`: identical algorithm, no node-gyp build step to
fail on Vercel or Railway. Slower per hash, which for a KDF is the point.

**Always run a comparison, even when the email does not exist.** Returning early
answers in microseconds where a real user costs ~250ms, and that gap alone tells an
attacker which addresses are registered. `burnPasswordTiming()` exists for the
not-found branch; call it and discard the result.

The same reasoning applies to the response itself: a failed login says the same
thing whether the email was unknown or the password wrong.

---

## Lockout

Five failed attempts, fifteen minute cooldown — `apps/web/lib/lockout.ts`, as pure
functions over the counters on `users` so the policy is testable without a database.

A failure arriving *after* a cooldown has elapsed starts a fresh count. Inheriting
the old count would re-lock the account on the first attempt after the wait, which
reads as "the lockout never ends".

---

## Verification codes

One table for email verification and password reset, discriminated by `type`. The
lifecycle is identical: issue, email a six-digit code, consume once, expire.
Implemented once in `apps/web/lib/verification.ts`.

**Codes, not links.** Links break inside WhatsApp's in-app browser, which is where
these users live.

### Two secrets, both required

| Secret | Where it goes | Stored as |
| --- | --- | --- |
| OTP (6 digits) | The email | never — folded into `otpHash` |
| Token (32 bytes) | httpOnly cookie | `tokenHash = sha256(token)` |

```
otpHash = sha256(token + ':' + otp)
```

The code is bound to the token that requested it. A code intercepted in email
cannot be redeemed from a browser that never asked for it, and a database dump
yields neither secret — without the raw token, `otpHash` cannot be ground down
against a mere million possibilities.

**This is why the OTP is not bcrypted.** A 10^6 space falls to any KDF given time.
The defense is the second secret, plus `attempts` and a short expiry.

### Rules

- **Five attempts per code**, then the row is consumed and a new code is needed.
  Without this, six digits is a few hundred thousand guesses.
- Issuing consumes any earlier unconsumed code for the same address and type, so a
  forwarded older email stops working the moment a new one is sent.
- `consumedAt` makes codes single-use, and is set on attempt burnout too. Consumed
  rows are kept, so "already used" stays distinguishable from "never existed".
- Verification codes last 15 minutes; password reset is one hour per E1-02.
  **One hour is long for six digits** — worth shortening, with the attempts cap as
  the reason it is survivable meanwhile.
- Compare through `tokenHashesMatch`, never `===`, so nothing leaks through timing.

### Password reset has two effects people forget

- **Clear the lockout.** "Forgot password" is what a locked-out owner reaches for.
  Without clearing `failedLoginAttempts` and `lockedUntil`, they reset
  successfully and are still refused for fifteen minutes with nothing on screen
  explaining why.
- **Revoke every session.** If the reset was prompted by a compromise, leaving the
  intruder signed in defeats the point.

A successful reset also sets `emailVerifiedAt` — redeeming a code proves inbox
control, which is all verification ever established.

---

## Two-factor

TOTP, per E1-03. Built. `apps/web/lib/two-factor.ts` holds the state; `totp.ts`
and `backup-codes.ts` hold the policy, with no database access so it can be
tested on its own.

### The half-authenticated state

A correct password with 2FA on produces a **challenge**, not a session — its own
cookie (`sq_2fa`), its own table, five minutes, five attempts.

A flag on `sessions` was rejected. A row in that table means "authenticated", and
a second meaning for it fails open: every future reader — `revokeAllSessions`, a
device list, E13 impersonation — would have to remember the flag, and the one
that forgets is an authentication bypass. It would also sail past middleware's
cookie-presence check and then be refused by `requireSession()`, losing the
`next` param middleware exists to preserve.

The challenge carries `rememberMe`, `ipHash` and `userAgent` forward, so
`issueSession` receives what it would have received with no second factor.

**A wrong code counts toward `users.failedLoginAttempts.`** The per-challenge cap
bounds nothing on its own — someone holding the password can open challenge after
challenge. This is why `clearFailures()` and `lastLoginAt` moved out of the
password step and into `lib/login.ts`: clearing the counter on a correct password
would let an attacker reset it on every attempt.

### One way in

`lib/login.ts` → `completeLogin()` is **the only caller of `issueSession` outside
`session.ts`**, signup excepted (a new account cannot have 2FA). The Google
handler is why: it is a redirect flow, and the obvious implementation signs the
user in the moment next-auth returns an email, silently skipping the second
factor. Going through the helper makes that bypass deliberate rather than
forgetful.

### Everything single-use is claimed by compare-and-set

`updateMany` with the "not yet spent" condition in the `where`, then check
`count === 1`. Atomic at row level under READ COMMITTED, so two requests racing
one code produce exactly one winner. Applies to the challenge, each backup code,
and the TOTP time step. **Verify the factor first, claim second** — claiming
first lets a wrong code destroy the challenge.

### Replay

`users.twoFactorLastTimeStep` is the watermark, advanced only forward. Without it
a code stays usable for up to 90 seconds and can be replayed into a *fresh*
challenge, which the single-use challenge does not prevent because the attacker
opens their own. otplib's `afterTimeStep` does this too and is deliberately
unused: it throws when the stored step is ahead of the current one, which a
backwards server clock produces, turning a login into a 500.

### Backup codes

Ten codes, twelve Crockford base32 characters each — 60 bits, shown `A7K2-M9PQ-R4XT`.
Alphanumeric rather than digits so they cannot be confused with the TOTP field
beside them at login.

Hashed as `sha256(userId + ':' + code)`, **not bcrypt**, despite being
password-equivalent. `codeHash` is `@unique` and bcrypt salts per hash, so a
submitted code could not be looked up at all — verification would mean ten
sequential comparisons, about 2.5 seconds, on the login path, and a tenfold CPU
amplifier on an endpoint reachable with the password alone. These are CSPRNG
strings used once; there is no dictionary for a KDF to defend against. The userId
pepper is what stops a stolen table being attacked in bulk.

Plaintext exists in exactly two responses — `enroll/confirm` and `backup-codes` —
and nowhere else, ever. **There is no `GET` on backup codes and there must never
be one:** it would turn a stolen session into ten permanent bypasses. The
download is built in the browser from what is already on screen.

### Re-authentication

Starting enrollment needs the password. Turning 2FA off, replacing backup codes,
changing the org policy and resetting a teammate need the password **and a live
second factor** — session theft is what 2FA defends against, so an attacker with
a stolen session and the password must not be able to switch it off. A backup
code counts as the second factor throughout; the commonest honest reason to
disable is a lost phone.

### Org-wide policy

`organizations.requireTwoFactor`. Owner-only, and the owner is bound by it too —
they must turn the policy off before their own 2FA, which is itself gated. Three
things stop an owner locking out their organization: they must have 2FA on before
requiring it; turning it on needs a live second factor; and the gate is
`requireCompliantSession()` redirecting to an enrollment screen, never a refusal.

**The gate lives in the dashboard layout, so its destination must live outside
that layout.** `TWO_FACTOR_SETUP_PATH` is `/two-factor-setup`, in the `(auth)`
group. Pointing it at `/settings/account` — which is under the shell — produced
an infinite redirect: the layout guards the page it was redirecting to. The same
trap as the middleware one below, one layer up. A route group boundary makes it
impossible by construction; an exemption list would rely on memory.

### Recovery

An owner can reset a teammate's 2FA — full `revokeAllSessions` on the target,
since a credential changed hands. It grants nothing new; an owner can already
take over a teammate at the data level.

**An owner who loses both their device and their codes has no path.** E13-01 has
no 2FA reset action, so today that is a manual database edit, in a product whose
`CLAUDE.md` promises no manual provisioning. Raise it before launch.

No email is sent on any 2FA change — there is no security-alert template and E12
specifies none.

### Password reset is not a bypass

`reset-password` sets the password, clears the lockout, verifies the email,
revokes all sessions and discards pending challenges. It does **not** clear
`twoFactorEnabled`, and must never start to: 2FA an email can reset is email
security wearing a costume.

**Open question, not an oversight:** `users.twoFactorSecret` is still stored in
plaintext. It now goes through `lib/two-factor-secret.ts`, which stamps a version
tag (`v0:`) on every stored value — so switching to encryption is that one file
plus a backfill, and `openSecret` can read `v0` and `v1` at once while it runs.
Encrypting it is the same unresolved decision as token encryption key management,
which `CLAUDE.md` lists as blocking E10. Resolve both together rather than
inventing a key strategy here.

---

## Google OAuth

next-auth's only job. It performs the handshake and hands back a verified email;
the session that follows is issued by our session module like any other.

Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, which are **not yet in any
env file or the Zod schema**. Until they exist, Google signup and login cannot work.
They are absent rather than blank on purpose: the Zod schema validates at startup,
so a required-but-empty variable would crash the app rather than merely disable a
button.
