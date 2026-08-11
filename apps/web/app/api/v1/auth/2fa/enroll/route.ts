import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { reauthenticate } from '@/lib/reauth'
import { sealSecret } from '@/lib/two-factor-secret'
import { generateTotpSecret, totpUri, totpQrDataUri, formatManualKey } from '@/lib/totp'
import { issueEnrollment, ENROLLMENT_TTL_MS } from '@/lib/two-factor'

/**
 * E1-03 — start setting up two-factor.
 *
 * Generates a secret, parks it in `two_factor_enrollments`, and returns it as a
 * QR and a typeable key. Nothing is switched on here: the secret only becomes a
 * credential once a live code proves the authenticator app holds it. An
 * abandoned setup leaves a row that expires and nothing on the user.
 *
 * **The response body is a live credential** — the QR *is* the secret — so it
 * is sent `no-store`. No other route in this codebase needs that, because no
 * other route returns one.
 */

const schema = z.object({ password: z.string().min(1) })

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Enter your password to continue.', 422)
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  })
  if (user?.twoFactorEnabled) {
    return fail(
      'already_enabled',
      'Two-factor authentication is already on for this account.',
      409
    )
  }

  // A dead inbox means the last recovery channel is gone before setup starts.
  if (!session.user.emailVerifiedAt) {
    return fail(
      'email_unverified',
      'Verify your email address before turning on two-factor authentication.',
      403
    )
  }

  const reauth = await reauthenticate(
    session.user.id,
    { password: parsed.data.password },
    { requireSecondFactor: false }
  )
  if (!reauth.ok) return reauth.response

  const secret = generateTotpSecret()
  await issueEnrollment(session.user.id, sealSecret(secret))

  const uri = totpUri(secret, session.user.email)

  return ok(
    {
      otpauthUri: uri,
      qrDataUri: await totpQrDataUri(uri),
      manualKey: formatManualKey(secret),
      expiresInSeconds: Math.round(ENROLLMENT_TTL_MS / 1000),
    },
    200,
    NO_STORE
  )
}
