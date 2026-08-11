import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole, requireShopAccess } from '@/lib/authz'
import { syncShopQuantity } from '@/lib/billing'

/**
 * E2-02 — bring a paused shop back.
 *
 * **No plan-limit check here, deliberately.** A deactivated shop still counts
 * against `assertShopLimit` — it holds its slot, because it keeps its name,
 * brand and offer books and reactivating it is one button. That is what makes
 * the deactivate-then-add loop impossible at create time, and it also means
 * reactivating changes no count. Checking the limit here would refuse at the
 * cap for a request that adds nothing.
 */

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const access = await requireShopAccess(session, params.id, 'owner', {
    allowInactive: true,
  })
  if (!access.ok) return access.response

  if (access.value.shop.isActive) {
    return ok({ shop: { id: params.id, isActive: true, deactivatedAt: null } })
  }

  const shop = await prisma.shop.update({
    where: { id: params.id },
    data: { isActive: true, deactivatedAt: null },
    select: { id: true, name: true, isActive: true, deactivatedAt: true },
  })

  try {
    await syncShopQuantity(session.user.organizationId)
  } catch {
    // Deliberately swallowed — see lib/billing.ts.
  }

  return ok({ shop })
}
