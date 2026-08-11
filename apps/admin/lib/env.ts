import { z } from 'zod'

const schema = z.object({
  DATABASE_URL:         z.string().url(),
  ADMIN_SESSION_SECRET: z.string().min(32),
  ADMIN_IP_ALLOWLIST:   z.string().default(''),
  R2_PUBLIC_URL:        z.string().url(),
  REDIS_URL:            z.string().min(1),
})

export const env = schema.parse(process.env)
