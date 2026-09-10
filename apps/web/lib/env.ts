import { z } from 'zod'

/**
 * Validated environment variables.
 * Import `env` from here — never touch `process.env` directly.
 * The app crashes on startup if any required variable is missing or malformed.
 */
const schema = z.object({
  // Not set in .env — Next supplies it. Declared here so the rest of the app can
  // reach it through `env` rather than reaching around this module.
  NODE_ENV:                           z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL:                       z.string().url(),
  NEXTAUTH_SECRET:                    z.string().min(32),
  NEXTAUTH_URL:                       z.string().url(),
  // Optional on purpose. These validate at startup, so requiring them would
  // crash the app for anyone who has not set up a Google OAuth client yet —
  // and Google sign-in is one path among two, not the product. Absent means the
  // button does not render; see lib/oauth.ts.
  GOOGLE_CLIENT_ID:                   z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET:               z.string().min(1).optional(),
  STRIPE_SECRET_KEY:                  z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET:              z.string().startsWith('whsec_'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  R2_ACCESS_KEY_ID:                   z.string().min(1),
  R2_SECRET_ACCESS_KEY:               z.string().min(1),
  R2_BUCKET_NAME:                     z.string().min(1),
  R2_PUBLIC_URL:                      z.string().url(),
  /**
   * The account endpoint, and **the bucket must not be in it.**
   *
   * `https://<account>.r2.cloudflarestorage.com` — no bucket, no path, no
   * trailing slash. The SDK is handed `Bucket` separately and puts it in the
   * host itself, so an endpoint carrying `/souqstudio-dev` writes every object
   * to `souqstudio-dev/<key>` while `publicUrl()` builds a link to `<key>`.
   *
   * **Nothing about that failure is visible from the app.** The presign
   * succeeds, the PUT returns 200, and only the rendered image is missing — it
   * shipped in one `.env.local` for weeks and reached the dev deployment. So it
   * is a startup error now rather than a note in `docs/STATUS.md`.
   */
  R2_ENDPOINT:                        z.string().url(),
  /**
   * The prefix this environment's block library is published to and read from —
   * `https://assets.souqstudio.com/library/production/`, say.
   *
   * **Optional, and its absence is a complete library rather than a broken
   * one.** Unset means the repo: the generated blocks plus
   * `packages/engine/blocks/*.json`, which is what a laptop with no credentials
   * gets and what the harness draws. Set means R2 is the source of truth and the
   * compiled-in library is not consulted at all.
   *
   * **The environment's prefix is written out here rather than derived from
   * `NODE_ENV`.** `docs/block-library-from-r2.md` §5 asks which prefix dev reads,
   * and a path assembled in code is one typo away from putting a half-finished
   * design in front of every shop — with nothing visible until it ships. A URL
   * on the Railway dashboard can be read and checked by a person.
   */
  BLOCK_LIBRARY_URL:                  z.string().url().optional(),
  /**
   * What authorises a write to that prefix.
   *
   * **Not a session, and not a role.** Anything that can write there puts a
   * block document in front of every shop on the platform — §5's trust boundary
   * — and the highest role this app has is the owner of one organization, which
   * is nowhere near that. A shared secret is a placeholder for E13's admin auth
   * and is documented as one; what it must never become is `requireOrgRole`.
   *
   * Optional so that an environment without it still boots. The publish and sync
   * routes refuse when it is unset, which is the right answer for a deployment
   * that is not meant to publish.
   */
  LIBRARY_PUBLISH_TOKEN:              z.string().min(32).optional(),
  REDIS_URL:                          z.string().min(1),
  RESEND_API_KEY:                     z.string().startsWith('re_'),
  // Resend requires a verified sender. Accepts a bare address or the
  // "Name <address@domain>" form.
  EMAIL_FROM:                         z.string().min(3),
  OPENAI_API_KEY:                     z.string().startsWith('sk-'),
  ANTHROPIC_API_KEY:                  z.string().startsWith('sk-ant-'),
  REMBG_SERVICE_URL:                  z.string().url(),
})

/**
 * The bucket must not be in the endpoint, in either form it can hide.
 *
 * `R2_ENDPOINT` is the bare account endpoint —
 * `https://<account>.r2.cloudflarestorage.com`. The SDK is handed `Bucket`
 * separately and builds the host from it, so an endpoint that already carries
 * the bucket writes every object somewhere `publicUrl()` cannot address:
 *
 *   endpoint + /souqstudio-dev   → PUT .../souqstudio-dev/<key>, stored at
 *                                  `souqstudio-dev/<key>`, linked at `<key>`
 *   souqstudio-dev.<account>...  → the SDK prepends the bucket again
 *
 * **Nothing about either failure is visible from the app.** The presign
 * succeeds, the PUT returns 200, and only the rendered image is missing. The
 * first shape sat in one `.env.local` for weeks and is in the dev deployment as
 * this is written — `docs/STATUS.md` records the first discovery and the second.
 * A note in a status file did not stop it happening again, so it is a startup
 * error now.
 */
const withEndpointCheck = schema.superRefine((value, ctx) => {
  const endpoint = new URL(value.R2_ENDPOINT)
  const bucket = value.R2_BUCKET_NAME

  if (endpoint.pathname !== '/' || endpoint.hostname.startsWith(`${bucket}.`)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['R2_ENDPOINT'],
      message:
        `must be the bare account endpoint with no path and no bucket — ` +
        `https://<account>.r2.cloudflarestorage.com. ` +
        `"${bucket}" belongs in R2_BUCKET_NAME and nowhere else.`,
    })
  }
})

export type Env = z.infer<typeof schema>

/**
 * `next build` imports every route module to collect page data, so this file
 * runs at build time as well as at runtime — and a build machine is not a
 * deploy machine. Railway injects the service variables into the container that
 * *runs* the app; a build that demands a Stripe key it will never call is a
 * build that fails for the wrong reason.
 *
 * So a missing variable is only fatal when the process is actually serving.
 * `SKIP_ENV_VALIDATION=1` is set in the build script and nowhere else, which
 * means nothing is relaxed at runtime: `pnpm start` runs without the flag, and
 * a missing variable still stops the server before it takes a request.
 *
 * The thrown message lists the offending names. A raw ZodError prints sixteen
 * nested objects and buries them.
 */
function load(): Env {
  const parsed = withEndpointCheck.safeParse(process.env)
  if (parsed.success) return parsed.data

  if (process.env.SKIP_ENV_VALIDATION === '1') {
    // Asserted, not parsed: the whole point of the flag is that these values
    // are absent during a build. Anything reading them here reads undefined,
    // which is why nothing may construct a client at module scope — see the
    // note in lib/stripe.ts.
    return process.env as unknown as Env
  }

  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid environment variables:\n${problems}`)
}

export const env = load()
