import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { issueCode } from '@/lib/verification'

/**
 * E1-02 — start a password reset.
 *
 * **Always answers the same way**, whether or not the address has an account.
 * Note the deliberate asymmetry with signup, which must say "that email is
 * taken" because there is no other way to let someone proceed. Here there is,
 * so an identical response is the only safe one. Do not "make these consistent".
 */

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  // Even a malformed address gets the neutral answer — an "invalid email" reply
  // for one input and "sent" for another is still a signal.
  if (!parsed.success) return neutral()

  const { email } = parsed.data
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })

  // The cooldown result is deliberately discarded. Surfacing "wait 3 minutes"
  // for a registered address while an unregistered one gets a clean "sent" is
  // exactly the disclosure this endpoint exists to avoid. The throttle still
  // applies — no email goes out — the caller simply is not told which case
  // they are in.
  if (user) await issueCode(email, 'password_reset')

  // No branch in the response, and none in the visible timing: issuing a code is
  // a couple of indexed writes plus a queue push, not a bcrypt hash.
  return neutral()
}

function neutral() {
  return ok({ sent: true })
}
