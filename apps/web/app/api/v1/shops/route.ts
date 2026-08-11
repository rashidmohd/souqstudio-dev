import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { assertShopLimit, syncShopQuantity } from '@/lib/billing'
import { listShops } from '@/lib/shops'

/**
 * E2-02 — the shop list, and adding one.
 *
 * Adding a shop is self-served and instant: the form is the whole flow, and the
 * shop is active the moment it is created. Nothing here waits on SouqStudio,
 * which is the promise the product makes in CLAUDE.md.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
})

export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const params = req.nextUrl.searchParams
  const limit = Number(params.get('limit'))

  return ok(
    await listShops(session, {
      cursor: params.get('cursor') ?? undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      includeArchived: params.get('includeArchived') === 'true',
    })
  )
}

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  // Adding a shop changes the bill, so it is the owner's decision. A manager
  // runs the shops they are given; they do not commit the organization to
  // another line on the invoice.
  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the highlighted fields and try again.', 422)
  }

  const limit = await assertShopLimit(session.user.organizationId)
  if (!limit.ok) {
    return fail(
      'shop_limit_reached',
      `Your plan covers ${limit.limit} shops. Upgrade to add another.`,
      409
    )
  }

  const shop = await prisma.shop.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      location: parsed.data.location ?? null,
      phone: parsed.data.phone ?? null,
      // Inheritance is free — nothing is copied, and `brandKit` is left unset
      // rather than seeded. A new branch shows the organization's brand
      // immediately and keeps showing it as the organization's changes, which
      // is the whole point of E2-05.
      brandOverride: 'inherit',
    },
    select: { id: true, name: true, location: true, phone: true, isActive: true },
  })

  // Never fail the request on this. A shop that is not yet billed is fixable by
  // reconciliation; refusing a shop the customer is entitled to is not.
  try {
    await syncShopQuantity(session.user.organizationId)
  } catch {
    // Deliberately swallowed — see lib/billing.ts.
  }

  return ok({ shop }, 201)
}
