# Environment

**Never read `process.env` directly.** Every app has a Zod-validated `env` module. Import
from it. The app crashes at startup if a required variable is missing or malformed — a
loud failure on deploy beats a `undefined` reaching Stripe at 2am.

| App | Module |
| --- | --- |
| `apps/web` | `apps/web/lib/env.ts` |
| `apps/admin` | `apps/admin/lib/env.ts` |
| `apps/worker` | `apps/worker/src/lib/env.ts` |

```typescript
import { env } from '@/lib/env'

const stripe = new Stripe(env.STRIPE_SECRET_KEY)   // typed, guaranteed present
```

Validation is not just presence — prefixes are checked, so a publishable key pasted into
the secret key slot fails at boot rather than at the first charge.

---

## apps/web

```bash
# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Auth — next-auth vars cover the Google OAuth handshake only. Our own session
# layer issues the cookie; see references/auth.md.
NEXTAUTH_SECRET=          # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=         # Google Cloud Console → Credentials → OAuth client
GOOGLE_CLIENT_SECRET=     # absent until Google sign-in is built; see auth.md

# Stripe
STRIPE_SECRET_KEY=sk_
STRIPE_WEBHOOK_SECRET=whsec_
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_

# Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=souqstudio
R2_PUBLIC_URL=https://assets.souqstudio.com
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com

# Redis (Upstash) — producer side only
REDIS_URL=rediss://

# Email
RESEND_API_KEY=re_

# AI
OPENAI_API_KEY=sk-
ANTHROPIC_API_KEY=sk-ant-

# Background removal
REMBG_SERVICE_URL=http://localhost:8000
```

## apps/worker

Same database, Redis, R2, email and AI credentials. No `NEXTAUTH_*`, no Stripe — the
worker does not authenticate users or handle payments.

## apps/admin

```bash
DATABASE_URL=
ADMIN_SESSION_SECRET=     # separate from NEXTAUTH_SECRET
ADMIN_IP_ALLOWLIST=       # comma-separated, enforced in middleware
R2_PUBLIC_URL=
REDIS_URL=
```

Admin auth is a separate path against `admin_users`, not the shop-owner `users` table.
Its session secret must not be shared with the web app.

---

## V2 — not yet wired

```bash
WATI_API_KEY=             # WhatsApp Business API
WATI_ENDPOINT=
META_APP_ID=              # Instagram / Facebook publishing
META_APP_SECRET=
```

Add to the Zod schema as `.optional()` until the features ship, then make them required.

---

## Rules

- **`NEXT_PUBLIC_` prefix means the browser can read it.** Only the Stripe publishable
  key carries it. Never prefix a secret.
- **Secrets never reach the client.** OpenAI, Anthropic, Stripe secret, R2 credentials
  and the Resend key are server-side only. AI calls happen in the worker; the browser
  never holds a provider key.
- **`.env.example` in every app** lists every variable with a safe placeholder. Update it
  in the same commit that adds a variable, or the next person's boot fails with no clue
  what is missing.
- **`.env` and `.env.local` are gitignored.** Verify before committing.

---

## Open item

Meta OAuth access tokens are stored encrypted at rest with AES-256 per E10, but **key
management is undecided** — where the encryption key lives, how it rotates, and what
happens to stored tokens when it does. Raise this before building E10.
