import { z } from 'zod'

const schema = z.object({
  NODE_ENV:             z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL:         z.string().url(),
  ADMIN_SESSION_SECRET: z.string().min(32),
  ADMIN_IP_ALLOWLIST:   z.string().default(''),
  R2_PUBLIC_URL:        z.string().url(),
  REDIS_URL:            z.string().min(1),

  /**
   * Where `apps/web` is served. E13-04 publishes blocks by calling that app's
   * library routes rather than writing R2 itself, so there is one implementation
   * of "what a published block is". See lib/library-client.ts.
   *
   * Optional: an admin deployment without it still does everything else, and the
   * blocks screen says the console is not configured instead of failing at the
   * moment somebody presses publish.
   */
  WEB_APP_URL: z.string().url().optional(),
  /**
   * The shared secret those routes check. **This is the variable's proper
   * home.** `apps/web/lib/library-auth.ts` calls it "a placeholder for E13's
   * admin auth" — the panel is what replaces the placeholder, by being the one
   * service that holds the token and gating it behind a staff session and a
   * role instead of a bearer header anybody could hold.
   */
  LIBRARY_PUBLISH_TOKEN: z.string().min(16).optional(),
})

export type Env = z.infer<typeof schema>

/**
 * Missing variables are fatal when serving, not when building. See the long
 * note in apps/web/lib/env.ts — same reasoning, same flag, set only by the
 * build script.
 */
function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (parsed.success) return parsed.data

  // Asserted, not parsed: during a build these are expected to be absent.
  if (process.env.SKIP_ENV_VALIDATION === '1') return process.env as unknown as Env

  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
  throw new Error(`Invalid environment variables:\n${problems}`)
}

export const env = load()
