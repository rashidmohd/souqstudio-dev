import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { getPlan, planDirection } from '@/lib/plans'
import { changePlan, downgradeConflicts } from '@/lib/subscription'

/**
 * E3-01 — changing plan.
 *
 * **One route for both directions, and the client does not choose which.** The
 * direction falls out of the target plan's tier, and the consequences differ
 * enough — charge now versus schedule for the period end — that letting a
 * request name its own direction would be letting it name its own price.
 *
 * A downgrade whose limits the organization currently exceeds is refused with
 * the conflicts listed, not silently resolved. Deciding which of six shops to
 * archive is the customer's call; E3-01 says they must resolve it before the
 * downgrade confirms.
 */

const schema = z.object({ planId: z.string().trim().min(1) })

/**
 * What would happen if this plan were chosen — the confirmation screen's read.
 *
 * The error shape carries a code and a sentence and nothing else, by
 * convention, so the *structured* conflicts have to be readable before the
 * change is attempted. E3-01 wants the warning shown while the customer is
 * still deciding, which is this call, not a rejected POST.
 */
export async function GET(req: NextRequest) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const planId = req.nextUrl.searchParams.get('planId')
  if (!planId) return fail('invalid_input', 'Choose a plan and try again.', 422)

  const [organization, target] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: session.user.organizationId },
      include: { plan: true },
    }),
    getPlan(planId),
  ])
  if (!target) return fail('plan_not_found', 'That plan is no longer available.', 404)

  const direction = planDirection(organization.plan, target)
  return ok({
    direction,
    plan: { id: target.id, name: target.name },
    conflicts: direction === 'downgrade' ? await downgradeConflicts(organization.id, target) : [],
    /** Whether this needs Checkout (no card on file yet) or applies in-app. */
    needsCheckout: !organization.stripeSubscriptionId,
  })
}

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

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
    include: { plan: true },
  })
  const target = await getPlan(parsed.data.planId)
  if (!target) return fail('plan_not_found', 'That plan is no longer available.', 404)

  const direction = planDirection(organization.plan, target)
  if (direction === 'same') {
    return fail('same_plan', `You are already on ${target.name}.`, 409)
  }

  if (direction === 'downgrade') {
    const conflicts = await downgradeConflicts(organization.id, target)
    if (conflicts.length > 0) {
      // 409, not 422: nothing about the request is malformed. The organization
      // is simply too big for the plan right now. The numbers behind this
      // sentence come from the GET above, which is what the screen renders.
      return fail('downgrade_conflict', conflictMessage(conflicts, target.name), 409)
    }
  }

  const result = await changePlan({ organization, from: organization.plan, to: target })

  if (!result.ok) {
    if (result.reason === 'no_subscription') {
      return fail(
        'no_subscription',
        'Start a subscription before changing plan.',
        409
      )
    }
    if (result.reason === 'not_self_serve') {
      return fail(
        'plan_not_self_serve',
        'That plan is arranged with our team. Contact us to switch.',
        409
      )
    }
    return fail('same_plan', `You are already on ${target.name}.`, 409)
  }

  return ok(
    result.effect === 'immediate'
      ? { effect: result.effect, plan: { id: target.id, name: target.name } }
      : {
          effect: result.effect,
          effectiveAt: result.effectiveAt.toISOString(),
          plan: { id: target.id, name: target.name },
        }
  )
}

/** Written for the owner to read: what is in the way, and by how much. */
function conflictMessage(
  conflicts: Awaited<ReturnType<typeof downgradeConflicts>>,
  planName: string
): string {
  const parts = conflicts.map((conflict) =>
    conflict.kind === 'shops'
      ? `${conflict.current} shops but ${planName} includes ${conflict.allowed}`
      : `${conflict.current} people but ${planName} includes ${conflict.allowed}`
  )
  return `You have ${parts.join(', and ')}. Remove the extras, then switch.`
}
