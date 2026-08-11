import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { listTeam } from '@/lib/team'

/**
 * E2-03 — the team list.
 *
 * Whole-organization read, scoped write. A manager sees everyone but can only
 * change access to the shops they run — see PUT /users/:id/shops. That is the
 * simpler answer and the more permissive one; narrowing the read to "only
 * people in my shops" is a defensible alternative and is flagged as an open
 * question in the plan rather than decided here.
 */
export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'manager')
  if (!gate.ok) return gate.response

  return ok(await listTeam(session))
}
