import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { getBillingSummary } from '@/lib/billing-summary'

/**
 * E3-01 — the billing screen's whole read.
 *
 * Owner only, including the read. What an organization pays, how close it is to
 * its limits and when it next gets charged is the owner's business; a manager
 * runs shops. The credit balance a manager actually needs shows up next to the
 * AI actions that spend it, not here.
 */
export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  return ok(await getBillingSummary(session.user.organizationId))
}
