import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { reauthenticate } from '@/lib/reauth'
import { revokeAllSessions } from '@/lib/session'
import { disableTwoFactor } from '@/lib/two-factor'

/**
 * E1-03 — the owner clears a teammate's two-factor.
 *
 * The recovery path for the commonest real failure: someone changes phone,
 * loses the authenticator, and cannot find the codes they downloaded. Handing
 * this to the owner rather than to SouqStudio support is what keeps the product
 * self-served, and it grants nothing new — an owner can already remove a
 * teammate or take over their account at the data level.
 *
 * **It does not solve an owner who loses their own device and codes.** That
 * needs a Super Admin action in E13, which has no two-factor story today. Until
 * it exists, that case is a manual database edit. Named in the epic rather than
 * papered over here.
 *
 * Deliberately sends no email: there is no security-alert template, E12
 * specifies none, and adding one spans packages/types, packages/email and the
 * worker registry. The teammate finds out at their next sign-in, when the
 * enrollment gate meets them. Worth closing when E12 next moves.
 */

const schema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
  method: z.enum(['totp', 'backup']),
  code: z.string().trim().min(1).max(64),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  if (session.user.role !== 'owner') {
    return fail('forbidden', 'Only the organization owner can reset two-factor for a teammate.', 403)
  }

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

  if (parsed.data.userId === session.user.id) {
    return fail(
      'cannot_reset_self',
      'Use the disable option to turn off your own two-factor authentication.',
      409
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, organizationId: true, twoFactorEnabled: true },
  })

  // Same response whether the user does not exist or belongs to someone else's
  // organization — an owner has no business learning which is which.
  if (!target || target.organizationId !== session.user.organizationId) {
    return fail('not_found', 'That teammate is not in your organization.', 404)
  }

  if (!target.twoFactorEnabled) {
    return fail('not_enabled', 'That teammate does not have two-factor authentication on.', 409)
  }

  const reauth = await reauthenticate(session.user.id, parsed.data, {
    requireSecondFactor: true,
  })
  if (!reauth.ok) return reauth.response

  await disableTwoFactor(target.id)

  // The full revoke, with the tokenVersion bump — unlike a self-service change,
  // a credential here has changed hands, and whoever was signed in as the
  // teammate is exactly who this might be protecting them from.
  await revokeAllSessions(target.id)

  return ok({ reset: true, userId: target.id })
}
