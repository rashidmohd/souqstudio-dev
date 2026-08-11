import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { reauthenticate } from '@/lib/reauth'

/**
 * E1-03 — require two-factor for everyone in the organization.
 *
 * Lives under /auth/2fa/ rather than /organizations/:id so that every
 * two-factor route, and every re-authentication path, sits in one place. It
 * should move under the organization resource when E2 builds it; E2 has no
 * story for this policy today.
 *
 * Three things stop an owner locking their own organization out:
 *
 *   1. They must have two-factor on themselves before they can require it, so
 *      they have completed the flow they are imposing.
 *   2. Turning it on needs a live second factor, so an intruder sitting in an
 *      owner session cannot use the policy switch as denial of service against
 *      the whole company.
 *   3. The gate is an enrollment screen, not a refusal. The worst case is
 *      "everyone has to set it up", never "nobody can get in".
 *
 * Teammates' sessions are deliberately left alone when the flag flips. The gate
 * catches them on their next request; killing their sessions would lose work
 * and add nothing.
 */

const schema = z.object({
  required: z.boolean(),
  password: z.string().min(1),
  method: z.enum(['totp', 'backup']),
  code: z.string().trim().min(1).max(64),
})

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireApiSession({ allowPendingTwoFactor: true })
  if (!session) return response

  // Read from the session, never the body — for both of these.
  if (session.user.role !== 'owner') {
    return fail('forbidden', 'Only the organization owner can change this setting.', 403)
  }
  const organizationId = session.user.organizationId

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
  const { required } = parsed.data

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { twoFactorEnabled: true },
  })
  if (required && !user?.twoFactorEnabled) {
    return fail(
      'enable_your_own_first',
      'Turn on two-factor authentication for your own account before requiring it for the team.',
      409
    )
  }

  const reauth = await reauthenticate(session.user.id, parsed.data, {
    requireSecondFactor: true,
  })
  if (!reauth.ok) return reauth.response

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      requireTwoFactor: required,
      requireTwoFactorSince: required ? new Date() : null,
    },
  })

  return ok({ required })
}
