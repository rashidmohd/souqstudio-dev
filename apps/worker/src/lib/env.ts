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

  /**
   * Which model reads a picture of a card. E8-07.
   *
   * **Defaults to the one that is known to work.** An environment that has
   * never heard of this variable runs exactly as it did before Qwen existed,
   * and switching back is unsetting it — the same one-line rollback
   * `BLOCK_LIBRARY_URL` has. Never derived from `NODE_ENV`: a person on the
   * Railway dashboard should be able to read which model is answering.
   */
  MAGIC_BLOCK_PROVIDER: z.enum(['anthropic', 'qwen']).default('anthropic'),
  /**
   * Optional, because most deployments do not use Qwen — but required in
   * practice when `MAGIC_BLOCK_PROVIDER` says `qwen`, which is checked below
   * rather than here so the message can say what to do about it.
   */
  DASHSCOPE_API_KEY:    z.string().min(1).optional(),
  /**
   * **The region is a decision, not a default to be inherited quietly.**
   * DashScope serves Beijing and Singapore from different hosts and an account
   * created against one is not authorised on the other — the failure is a 401
   * that reads exactly like a bad key, which is an afternoon to diagnose. The
   * fallback here is the international endpoint because the shops are in the
   * Gulf; a China-mainland account needs `dashscope.aliyuncs.com`.
   */
  DASHSCOPE_BASE_URL:   z.string().url().default('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  /** Overridable because the Qwen vision family moves faster than this repo. */
  QWEN_VISION_MODEL:    z.string().min(1).default('qwen-vl-max'),
  R2_ACCESS_KEY_ID:     z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME:       z.string(),
  R2_PUBLIC_URL:        z.string().url(),
  R2_ENDPOINT:          z.string().url(),
})

/**
 * A provider selected without the key it needs fails at the first job rather
 * than at boot, and the shop owner sees a failed generation instead of the
 * deployment refusing to start. Checked here so it is the second.
 */
const parsed = schema.superRefine((value, ctx) => {
  if (value.MAGIC_BLOCK_PROVIDER === 'qwen' && value.DASHSCOPE_API_KEY === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DASHSCOPE_API_KEY'],
      message:
        'MAGIC_BLOCK_PROVIDER is "qwen", so DASHSCOPE_API_KEY must be set. ' +
        'Unset MAGIC_BLOCK_PROVIDER to go back to Claude.',
    })
  }
})

export const env = parsed.parse(process.env)
