import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { listInvoices } from '@/lib/subscription'

/**
 * E3-04 — invoice history, read straight from Stripe.
 *
 * Not cached and not mirrored into a table. An invoice is a financial record
 * that Stripe already keeps, versions and regenerates when a tax detail
 * changes; a copy here would be a second answer to "what were they charged"
 * that is wrong exactly when it matters.
 *
 * The PDF links are Stripe-hosted and short-lived, which is why they are
 * fetched per request rather than stored.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  })

  const requested = Number(req.nextUrl.searchParams.get('limit'))
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 50) : 12

  return ok({ items: await listInvoices(organization, limit) })
}
