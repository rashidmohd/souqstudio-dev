import type { NextRequest } from 'next/server'
import { prisma, TOPUP_PACK } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { purchaseCredits } from '@/lib/subscription'

/**
 * E3-03 — buying credits with the card on file.
 *
 * **The response says the purchase was charged, not that the credits arrived.**
 * They are granted by the `invoice.paid` webhook, which is what makes a
 * duplicate delivery harmless and a delayed capture still land. The screen
 * refetches the balance after this returns and shows the new total when it
 * appears — usually within a second or two, and correct even when it is not.
 */

const schema = z.object({
  /** How many 100-credit packs. Capped: a mistyped 500 is a $4,000 charge. */
  packs: z.number().int().min(1).max(20).default(1),
})

export async function POST(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  // Spending money is the owner's decision, the same rule that governs adding
  // a shop in POST /api/v1/shops.
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
    return fail('invalid_input', 'Choose how many credit packs to buy.', 422)
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  })

  const result = await purchaseCredits({
    organization,
    packs: parsed.data.packs,
    pack: TOPUP_PACK,
  })

  if (!result.ok) {
    if (result.reason === 'declined') {
      return fail(
        'card_declined',
        // Stripe's decline messages are written for a cardholder and are safe
        // to pass through. The fallback covers the ones that are not set.
        result.message ?? 'Your card was declined. Try a different card.',
        402
      )
    }
    if (result.reason === 'no_payment_method') {
      return fail('no_payment_method', 'Add a payment method before buying credits.', 409)
    }
    return fail('no_subscription', 'Start a subscription before buying credits.', 409)
  }

  return ok({ topupId: result.topupId, credits: result.credits, invoiceId: result.invoiceId }, 202)
}
