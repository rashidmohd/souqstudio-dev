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

export const env = schema.parse(process.env)
export type Env = z.infer<typeof schema>
