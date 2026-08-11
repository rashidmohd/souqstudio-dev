import 'server-only'

import { prisma } from '@souqstudio/db'
import type { Role, TeamMemberSummary } from '@souqstudio/types'
import { toRole } from '@/lib/authz'
import { inviteStatus, toShopGrants } from '@/lib/invites'
import type { VerifiedSession } from '@/lib/session'

/**
 * The team list. E2-03, E2-04.
 *
 * Members and pending invites are one list, not two. To the person reading the
 * screen "who is on my team" includes the colleague invited an hour ago who has
 * not clicked the link yet — showing them in a separate section below means
 * inviting the same person twice is the obvious mistake to make.
 *
 * Not paginated in the same sense as shops: the two sources cannot share a
 * cursor, so this returns the whole team. That is defensible while the roles
 * are a fixed four and a plan's `maxUsers` is small; it becomes wrong the day
 * an enterprise account arrives, and there is a bound below to make the failure
 * loud rather than silent.
 */

const MAX_TEAM = 500

export async function listTeam(session: VerifiedSession): Promise<{
  items: TeamMemberSummary[]
  truncated: boolean
}> {
  const organizationId = session.user.organizationId

  const [users, invites, shops] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, removedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      take: MAX_TEAM + 1,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        lastLoginAt: true,
        twoFactorEnabled: true,
        shopAccess: { select: { shopId: true, role: true } },
      },
    }),
    prisma.invite.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null },
      orderBy: [{ createdAt: 'asc' }],
      take: MAX_TEAM,
      select: {
        id: true,
        email: true,
        role: true,
        shopGrants: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
      },
    }),
    prisma.shop.findMany({
      where: { organizationId, archivedAt: null },
      select: { id: true, name: true },
    }),
  ])

  const shopName = new Map(shops.map((s) => [s.id, s.name]))

  const members: TeamMemberSummary[] = users.slice(0, MAX_TEAM).map((user) => {
    const orgRole = toRole(user.role)
    return {
      id: user.id,
      kind: 'member',
      email: user.email,
      name: user.name,
      role: orgRole,
      status: 'accepted',
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      twoFactorEnabled: user.twoFactorEnabled,
      shops:
        orgRole === 'owner'
          ? // The owner reaches every shop without a grant row, so listing
            // their grants would show an owner with access to nothing.
            shops.map((s) => ({ shopId: s.id, name: s.name, role: 'owner' as Role }))
          : user.shopAccess.flatMap((grant) => {
              const name = shopName.get(grant.shopId)
              // An archived shop's grants are not shown. The row survives so
              // the grant is restored if the shop comes back.
              if (!name) return []
              return [
                {
                  shopId: grant.shopId,
                  name,
                  role: grant.role ? toRole(grant.role) : orgRole,
                },
              ]
            }),
    }
  })

  const pending: TeamMemberSummary[] = invites.map((invite) => ({
    id: invite.id,
    kind: 'invite',
    email: invite.email,
    name: null,
    role: toRole(invite.role),
    status: inviteStatus(invite),
    lastLoginAt: null,
    twoFactorEnabled: false,
    shops: toShopGrants(invite.shopGrants).flatMap((grant) => {
      const name = shopName.get(grant.shopId)
      if (!name) return []
      return [{ shopId: grant.shopId, name, role: grant.role ?? toRole(invite.role) }]
    }),
  }))

  return {
    // Members first, then who is still on their way in.
    items: [...members, ...pending],
    truncated: users.length > MAX_TEAM,
  }
}
