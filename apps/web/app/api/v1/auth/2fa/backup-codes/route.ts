import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { reauthenticate } from '@/lib/reauth'
import { revokeOtherSessions } from '@/lib/session'
import { regenerateBackupCodes } from '@/lib/two-factor'

/**
 * E1-03 — replace every backup code.
 *
 * **There is no GET here, and there never will be.** Backup codes exist in
 * plaintext in exactly two places: the response to this route, and the response
 * to enroll/confirm. Nothing stores them, nothing can look them up, and the
 * download the owner takes is built in the browser from what is already on
 * screen. An endpoint that could hand them back later would turn a stolen
 * session into ten permanent bypasses of the second factor, which is the one
 * property that makes hashing them worth doing at all.
 *
 * Regenerating voids the old set, used and unused alike.
 */

const schema = z.object({
  password: z.string().min(1),
  method: z.enum(['totp', 'backup']),
  code: z.string().trim().min(1).max(64),
})

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
    return fail(
      'invalid_input',
      'Enter your password and a code from your authenticator app or a backup code.',
      422
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  })
  if (!user?.twoFactorEnabled) {
    return fail('not_enabled', 'Turn on two-factor authentication first.', 409)
  }

  const reauth = await reauthenticate(session.user.id, parsed.data, {
    requireSecondFactor: true,
  })
  if (!reauth.ok) return reauth.response

  const backupCodes = await regenerateBackupCodes(session.user.id)
  const otherSessionsRevoked = await revokeOtherSessions(session.user.id, session.sessionId)

  return ok({ backupCodes, otherSessionsRevoked }, 200, NO_STORE)
}
