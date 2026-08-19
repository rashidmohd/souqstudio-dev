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
  R2_ENDPOINT:                        z.string().url(),
  REDIS_URL:                          z.string().min(1),
  RESEND_API_KEY:                     z.string().startsWith('re_'),
  // Resend requires a verified sender. Accepts a bare address or the
  // "Name <address@domain>" form.
  EMAIL_FROM:                         z.string().min(3),
  OPENAI_API_KEY:                     z.string().startsWith('sk-'),
  ANTHROPIC_API_KEY:                  z.string().startsWith('sk-ant-'),
  REMBG_SERVICE_URL:                  z.string().url(),
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
  const parsed = schema.safeParse(process.env)
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
