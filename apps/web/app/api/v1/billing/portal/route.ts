import { prisma } from '@souqstudio/db'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { env } from '@/lib/env'
import { createPortalSession } from '@/lib/subscription'

/**
 * E3-05 — a session for the Stripe Customer Portal.
 *
 * POST rather than GET because it creates something at Stripe with a
 * short-lived URL, and because a link that could be prefetched by a browser
 * would burn sessions nobody asked for.
 *
 * The portal covers payment methods and invoice history. Plan changes, shop
 * add-ons and credit top-ups stay in-app — see `createPortalSession()` for why.
 */
export async function POST() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: session.user.organizationId },
  })

  const url = await createPortalSession(organization, `${env.NEXTAUTH_URL}/settings/billing`)
  if (!url) {
    return fail(
      'no_customer',
      'Start a subscription before managing payment details.',
      409
    )
  }

  return ok({ url })
}
