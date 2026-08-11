import type { NextRequest } from 'next/server'
import { prisma, getCreditSnapshot } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { planFeatures } from '@/lib/plans'

/**
 * E3-03 — credit pooling.
 *
 * Pooled is the default and needs no configuration: every shop draws on the
 * organization balance. Allocated caps each shop, and is a Business-plan
 * feature — the plan check is the `allocatedCredits` flag, never a plan name,
 * so a legacy or Enterprise plan carrying the flag gets it too.
 *
 * **An allocation is a ceiling on the shared balance, not a wallet.** Assigning
 * 200 credits to a shop does not move 200 credits anywhere; it stops that shop
 * spending more than 200 this period. The allocations therefore do not have to
 * sum to the balance, and deliberately are not made to — a group that wants
 * three branches capped at 100 each out of 500 should not have to account for
 * the other 200.
 */

const schema = z.object({
  pooling: z.enum(['pooled', 'allocated']).optional(),
  allocations: z
    .array(
      z.object({
        shopId: z.string().trim().min(1),
        /** Zero is meaningful: this shop may not generate this period. */
        allocated: z.number().int().min(0).max(1_000_000),
      })
    )
    .max(200)
    .optional(),
})

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const organizationId = session.user.organizationId
  const [organization, shops, snapshot] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { creditPooling: true, plan: { select: { features: true } } },
    }),
    prisma.shop.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true, creditAllocation: { select: { allocated: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    getCreditSnapshot(organizationId),
  ])

  // Spend per shop this period, so the screen can show a cap against what has
  // actually been used rather than a number with no context.
  const spend = await prisma.usageEvent.groupBy({
    by: ['shopId'],
    where: { organizationId, createdAt: { gte: snapshot.periodStart } },
    _sum: { creditsUsed: true },
  })
  const spentByShop = new Map(spend.map((row) => [row.shopId, row._sum.creditsUsed ?? 0]))

  return ok({
    pooling: organization.creditPooling,
    available: planFeatures(organization.plan).allocatedCredits,
    balance: { total: snapshot.total, periodEnd: snapshot.periodEnd.toISOString() },
    shops: shops.map((shop) => ({
      id: shop.id,
      name: shop.name,
      allocated: shop.creditAllocation?.allocated ?? null,
      usedThisPeriod: spentByShop.get(shop.id) ?? 0,
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the highlighted fields and try again.', 422)
  }

  const organizationId = session.user.organizationId
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { creditPooling: true, plan: { select: { features: true } } },
  })

  const wantsAllocated =
    parsed.data.pooling === 'allocated' ||
    (parsed.data.pooling === undefined && organization.creditPooling === 'allocated')

  if (wantsAllocated && !planFeatures(organization.plan).allocatedCredits) {
    return fail(
      'plan_required',
      'Assigning credits per shop is on the Business plan. Upgrade to use it.',
      409
    )
  }

  // Every shop id is checked against the session's organization. A foreign id
  // must not be able to create an allocation row pointing into another tenant.
  if (parsed.data.allocations?.length) {
    const ids = parsed.data.allocations.map((entry) => entry.shopId)
    const owned = await prisma.shop.count({
      where: { id: { in: ids }, organizationId, archivedAt: null },
    })
    if (owned !== new Set(ids).size) {
      return fail('not_found', 'One of those shops is not in your organization.', 404)
    }
  }

  await prisma.$transaction([
    ...(parsed.data.pooling
      ? [
          prisma.organization.update({
            where: { id: organizationId },
            data: { creditPooling: parsed.data.pooling },
          }),
        ]
      : []),
    ...(parsed.data.allocations ?? []).map((entry) =>
      prisma.shopCreditAllocation.upsert({
        where: { shopId: entry.shopId },
        update: { allocated: entry.allocated },
        create: { organizationId, shopId: entry.shopId, allocated: entry.allocated },
      })
    ),
  ])

  return ok({ pooling: parsed.data.pooling ?? organization.creditPooling })
}
