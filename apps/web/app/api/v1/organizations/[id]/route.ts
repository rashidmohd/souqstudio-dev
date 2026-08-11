import type { NextRequest } from 'next/server'
import { prisma } from '@souqstudio/db'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { assertShopLimit } from '@/lib/billing'
import { shopCounts } from '@/lib/shops'

/**
 * E2-01 — organization settings.
 *
 * The `:id` in the path is **validated, never used as a filter.** Every query
 * below is scoped by `session.user.organizationId`; the segment only has to
 * match it. Keeping the id in the URL follows the path already published in
 * souqstudio-technical → references/api-conventions.md, but the rule that
 * matters is the one in CLAUDE.md: never trust a client-sent organizationId.
 */

/**
 * A UAE TRN is 15 digits. Enforced only for `country: 'AE'` — the field is
 * "VAT / TRN" and a customer in Saudi or Oman has a differently shaped number,
 * so refusing theirs would make the field unusable for them.
 */
const TRN_LENGTH = 15

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email(),
    vatNumber: z.string().trim().max(40).nullable(),
    country: z.string().trim().length(2).toUpperCase(),
    timezone: z.string().trim().min(1).max(60),
  })
  .partial()

type Params = { params: { id: string } }

/** Same answer for another organization's id and one that does not exist. */
function guard(sessionOrgId: string, id: string) {
  return sessionOrgId === id
    ? null
    : fail('not_found', 'That organization could not be found.', 404)
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const wrong = guard(session.user.organizationId, params.id)
  if (wrong) return wrong

  const [organization, counts, limit, pendingInvites, userCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        vatNumber: true,
        country: true,
        timezone: true,
        logoUrl: true,
        planId: true,
        billingStatus: true,
        requireTwoFactor: true,
        requireTwoFactorSince: true,
        plan: { select: { name: true, maxShops: true, maxUsers: true } },
      },
    }),
    shopCounts(session.user.organizationId),
    assertShopLimit(session.user.organizationId),
    prisma.invite.count({
      where: {
        organizationId: session.user.organizationId,
        acceptedAt: null,
        revokedAt: null,
      },
    }),
    prisma.user.count({
      where: { organizationId: session.user.organizationId, removedAt: null },
    }),
  ])

  if (!organization) {
    return fail('not_found', 'That organization could not be found.', 404)
  }

  return ok({
    organization: {
      ...organization,
      requireTwoFactorSince: organization.requireTwoFactorSince?.toISOString() ?? null,
    },
    counts: { ...counts, users: userCount, pendingInvites },
    limits: {
      maxShops: limit.ok ? null : limit.limit,
      maxUsers: organization.plan?.maxUsers ?? null,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const wrong = guard(session.user.organizationId, params.id)
  if (wrong) return wrong

  // Billing contact, VAT number and legal country are the organization's
  // identity on an invoice. That is the owner's, not a manager's.
  const gate = requireOrgRole(session, 'owner')
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_body', 'That request could not be read. Try again.', 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_input', 'Check the highlighted fields and try again.', 422)
  }
  const { name, email, vatNumber, country, timezone } = parsed.data

  // Validated against the runtime's own zone database rather than a list we
  // would have to maintain and would get wrong the next time a country moves
  // its clocks.
  if (timezone !== undefined && !isKnownTimezone(timezone)) {
    return fail('invalid_timezone', 'Choose a timezone from the list.', 422)
  }

  const effectiveCountry = country ?? (await currentCountry(session.user.organizationId))
  if (vatNumber && effectiveCountry === 'AE') {
    const digits = vatNumber.replace(/\s/g, '')
    if (!/^\d+$/.test(digits) || digits.length !== TRN_LENGTH) {
      return fail(
        'invalid_trn',
        `A UAE TRN is ${TRN_LENGTH} digits. Check the number on your FTA certificate.`,
        422
      )
    }
  }

  const organization = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(vatNumber !== undefined ? { vatNumber } : {}),
      ...(country !== undefined ? { country } : {}),
      ...(timezone !== undefined ? { timezone } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      vatNumber: true,
      country: true,
      timezone: true,
      logoUrl: true,
    },
  })

  return ok({ organization })
}

function isKnownTimezone(value: string): boolean {
  try {
    // Throws RangeError on an unknown zone. `supportedValuesOf` would be
    // cleaner but is not guaranteed across the runtimes this ships on.
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

async function currentCountry(organizationId: string): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { country: true },
  })
  return organization?.country ?? 'AE'
}
