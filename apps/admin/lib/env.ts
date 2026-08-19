import { z } from 'zod'

const schema = z.object({
  DATABASE_URL:         z.string().url(),
  ADMIN_SESSION_SECRET: z.string().min(32),
  ADMIN_IP_ALLOWLIST:   z.string().default(''),
  R2_PUBLIC_URL:        z.string().url(),
  REDIS_URL:            z.string().min(1),
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
