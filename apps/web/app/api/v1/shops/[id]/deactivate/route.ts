import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole, requireShopAccess } from '@/lib/authz'
import { syncShopQuantity } from '@/lib/billing'

/**
 * E2-02 — pause a shop.
 *
 * A deactivated shop keeps everything and stops generating content. This is a
 * **quantity decrement** on the subscription, not `pause_collection`: E3 lists
 * subscription pause as V2, and pausing the whole subscription because one
 * branch closed for Ramadan would stop billing for the branches still trading.
 *
 * Reversible, so it gets no confirmation dialog — the design system's rule is
 * to prefer undo over confirm and reserve dialogs for the irreversible.
 */

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const access = await requireShopAccess(session, params.id, 'owner')
  if (!access.ok) return access.response

  // Leaving an organization with no active shop is not a state anything else
  // handles: home would render an empty switcher and the checklist would ask
  // them to set up a brand they cannot reach.
  const remaining = await prisma.shop.count({
    where: {
      organizationId: session.user.organizationId,
      archivedAt: null,
      isActive: true,
      id: { not: params.id },
    },
  })
  if (remaining === 0) {
    return fail(
      'last_active_shop',
      'This is your only active shop. Activate another before pausing this one.',
      409
    )
  }

  const shop = await prisma.shop.update({
    where: { id: params.id },
    data: { isActive: false, deactivatedAt: new Date() },
    select: { id: true, name: true, isActive: true, deactivatedAt: true },
  })

  try {
    await syncShopQuantity(session.user.organizationId)
  } catch {
    // Deliberately swallowed — see lib/billing.ts.
  }

  return ok({ shop })
}
