/**
 * lib/env.ts validates and throws at import time, by design — a missing
 * variable should stop the app booting rather than surface as a null halfway
 * through a checkout. That means anything importing it transitively needs a
 * complete environment before the first import runs, which is what this file
 * is for.
 *
 * These are shaped to satisfy the Zod schema and nothing more. They are not
 * credentials and must never resemble one closely enough to be mistaken for a
 * real key; the prefixes are there because the schema checks them.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  NEXTAUTH_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  NEXTAUTH_URL: 'http://localhost:3000',
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_placeholder',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
  R2_ACCESS_KEY_ID: 'test',
  R2_SECRET_ACCESS_KEY: 'test',
  R2_BUCKET_NAME: 'test',
  R2_PUBLIC_URL: 'https://assets.test.local',
  R2_ENDPOINT: 'https://r2.test.local',
  REDIS_URL: 'redis://localhost:6379',
  RESEND_API_KEY: 're_test_placeholder',
  EMAIL_FROM: 'test@souqstudio.test',
  OPENAI_API_KEY: 'sk-test-placeholder',
  ANTHROPIC_API_KEY: 'sk-ant-test-placeholder',
  REMBG_SERVICE_URL: 'http://localhost:7000',
}

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] ??= value
}
