import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'

/**
 * Your own name. The first route anyone has had for editing themselves —
 * `/users/:id` is E2-03's team management, which is owner-only and refuses to
 * act on the caller at all.
 *
 * **The path is `me`, not `:id`.** A route that took an id would have to prove
 * the id was the caller's before doing anything, and the id it should act on is
 * already on the session. Same reasoning as the organizationId rule in
 * CLAUDE.md, one scope down: never trust a client-sent identity.
 *
 * `name` is the only field. Email is the login identifier and changing it needs
 * a verification round trip that does not exist yet — the form renders it
 * read-only and says why, rather than accepting a change it cannot make safely.
 * Role is not self-assignable for the obvious reason.
 *
 * Standard `requireApiSession()`, so somebody who owes their organization's
 * two-factor enrollment cannot get here. Only the 2FA routes and logout opt out
 * of that, and renaming yourself is not a way to satisfy a policy.
 */

const patchSchema = z.object({ name: z.string().trim().min(1).max(120) })

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  // Two ways to fail and two things to say about it. The limit is deliberately
  // not in either message: a bare numeral in a sentence reorders in an Arabic
  // layout, and an error string has nowhere to carry the figure wrapper.
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big')
    return fail(
      'invalid_input',
      tooLong ? 'That name is too long.' : 'Enter your name.',
      422
    )
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name },
    select: { id: true, email: true, name: true, role: true },
  })

  return ok({ user })
}
