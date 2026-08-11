// Loads apps/worker/.env for local development. Unlike Next.js, a bare Node
// process reads no .env file on its own. On Railway the variables are already
// in the process environment and this is a no-op — it never overwrites them.
import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  // Railway assigns the port and expects the process to bind it. Locally
  // nothing sets it, so the documented 3001 stands as the default.
  PORT:                 z.coerce.number().default(3001),
  DATABASE_URL:         z.string().url(),
  REDIS_URL:            z.string(),
  RESEND_API_KEY:       z.string().startsWith('re_'),
  // Resend requires a verified sender. Accepts a bare address or the
  // "Name <address@domain>" form.
  EMAIL_FROM:           z.string().min(3),
  OPENAI_API_KEY:       z.string().startsWith('sk-'),
  ANTHROPIC_API_KEY:    z.string().startsWith('sk-ant-'),
  REMBG_SERVICE_URL:    z.string().url(),
  R2_ACCESS_KEY_ID:     z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME:       z.string(),
  R2_PUBLIC_URL:        z.string().url(),
  R2_ENDPOINT:          z.string().url(),
})

export const env = schema.parse(process.env)
