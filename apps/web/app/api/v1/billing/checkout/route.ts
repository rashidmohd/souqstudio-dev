import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { env } from '@/lib/env'
import { getPlan } from '@/lib/plans'
import { startCheckout } from '@/lib/subscription'

/**
 * E3-01 — subscribing for the first time.
 *
 * Separate from the plan-change route because it is a different operation:
 * there is no card on file yet, so this returns a Stripe Checkout URL and the
 * subscription does not exist until the customer completes it. Every later plan
 * change happens in-app, instantly, through `POST /api/v1/billing/plan`.
 */

const schema = z.object({ planId: z.string().trim().min(1) })

export async function POST(req: NextRequest) {
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
  if (!parsed.success) return fail('invalid_input', 'Choose a plan and try again.', 422)

  const [organization, plan] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: session.user.organizationId } }),
    getPlan(parsed.data.planId),
  ])
  if (!plan) return fail('plan_not_found', 'That plan is no longer available.', 404)

  const result = await startCheckout({
    organization,
    plan,
    successUrl: `${env.NEXTAUTH_URL}/settings/billing?checkout=complete`,
    cancelUrl: `${env.NEXTAUTH_URL}/settings/billing`,
  })

  if (!result.ok) {
    if (result.reason === 'already_subscribed') {
      return fail(
        'already_subscribed',
        'You already have a subscription. Change your plan instead.',
        409
      )
    }
    return fail(
      'plan_not_self_serve',
      'That plan is arranged with our team. Contact us to get started.',
      409
    )
  }

  // The URL is the whole response: the client redirects to it, and the
  // subscription comes back to us through checkout.session.completed.
  return ok({ url: result.url })
}
