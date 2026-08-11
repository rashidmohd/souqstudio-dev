import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { shopWhere } from '@/lib/authz'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { readChecklist } from '@/lib/checklist'
import type { VerifiedSession } from '@/lib/session'

/**
 * E1-05 — the getting-started checklist.
 *
 * `DELETE` dismisses it for the person asking, not for the organization: the
 * items track shop and org progress, but wanting it off your screen is a
 * personal preference and a manager hiding it must not hide it from the owner.
 *
 * Dismissal is refused until the first offer book is published, which is the
 * condition E1-05 sets. Checked here rather than trusted from the client — the
 * button is hidden before then, and a hidden button is not a rule.
 */

/**
 * The checklist's view of the account.
 *
 * `shopIds` is every shop the session can reach, not just the active one:
 * "have you published an offer book" is a question about the organization, and
 * an owner with three branches who published from the second has finished the
 * item. The brand kit is the *active* shop's effective kit, because "have you
 * set up your brand" is a question about the shop being looked at.
 */
async function checklistFor(session: VerifiedSession) {
  const [shop, shops, dismissed] = await Promise.all([
    getActiveShop(session),
    prisma.shop.findMany({ where: await shopWhere(session), select: { id: true } }),
    dismissedAt(session.user.id),
  ])

  const brandKit = shop
    ? (
        await readEffectiveBrand({
          organizationId: shop.organizationId,
          shopId: shop.id,
          brandOverride: shop.brandOverride,
        })
      ).brandKit
    : {}

  return readChecklist({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    shopIds: shops.map((s) => s.id),
    brandKit,
    dismissedAt: dismissed,
  })
}

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  return ok(await checklistFor(session))
}

export async function DELETE() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const state = await checklistFor(session)

  if (!state.dismissible) {
    return fail(
      'not_dismissible',
      'Publish your first offer book, then you can hide this.',
      409
    )
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { checklistDismissedAt: new Date() },
  })

  return ok({ dismissed: true })
}

async function dismissedAt(userId: string): Promise<Date | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { checklistDismissedAt: true },
  })
  return user?.checklistDismissedAt ?? null
}
