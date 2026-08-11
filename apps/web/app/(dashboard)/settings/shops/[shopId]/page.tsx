import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import type { Role } from '@souqstudio/types'
import { requireCompliantSession } from '@/lib/session'
import { assignableRoles, requireShopAccess, toRole } from '@/lib/authz'
import { readEffectiveBrand } from '@/lib/brand-kit'
import { ShopForm } from '@/components/shop/ShopForm'
import { BrandOverrideField } from '@/components/shop/BrandOverrideField'
import { ShopAccessField } from '@/components/shop/ShopAccessField'
import type { ShopMemberCandidate } from '@/components/shop/ShopAccessField'

export const metadata: Metadata = { title: 'Shop settings · SouqStudio' }

/**
 * E2-02, E2-04 and E2-05 — one shop's settings.
 *
 * The home for the three things the shop list has no room for: the shop's own
 * details, how much of the organization's brand it replaces, and who can use
 * it. E2-05 says the override level is "set per shop in shop settings" — this
 * is that screen.
 *
 * Authorization goes through `requireShopAccess` rather than a hand-rolled
 * check, so a shop id typed into the URL by someone who cannot reach it is a
 * 404 and not a leak. `notFound()` renders that as the platform's own page.
 */
export default async function ShopSettingsPage({
  params,
}: {
  params: { shopId: string }
}) {
  const session = await requireCompliantSession()

  const access = await requireShopAccess(session, params.shopId, 'viewer', {
    allowArchived: true,
    allowInactive: true,
  })
  if (!access.ok) notFound()

  const { shop, role } = access.value
  const orgRole = toRole(session.user.role)
  const isOwner = orgRole === 'owner'
  const canManage = role === 'owner' || role === 'manager'

  const [brand, people, grants] = await Promise.all([
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId, removedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.userShopAccess.findMany({
      where: { shopId: shop.id },
      select: { userId: true, role: true },
    }),
  ])

  const grantOf = new Map(grants.map((g) => [g.userId, g.role]))

  const candidates: ShopMemberCandidate[] = people.map((person) => {
    const granted = grantOf.has(person.id)
    // `grantOf.get` returns `string | null | undefined` — three states, two of
    // which mean "no per-shop override". Read once and narrow, rather than
    // calling twice and asserting the second call non-null.
    const override = grantOf.get(person.id)
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      orgRole: toRole(person.role),
      granted,
      grantedRole: override ? (toRole(override) as Role) : null,
    }
  })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/settings/shops"
          className="font-ui text-body-sm text-link underline-offset-2 hover:underline"
        >
          Shops
        </Link>
        <h1 className="font-display text-title text-primary">{shop.name}</h1>
        <p className="font-ui text-body text-secondary">
          {shop.archivedAt
            ? 'This shop has been removed. Its offer books are archived.'
            : shop.isActive
              ? 'Active — making offer books.'
              : 'Paused — its data is kept and it makes nothing new.'}
        </p>
      </div>

      {shop.archivedAt ? (
        // Nothing below is editable for an archived shop, so nothing below is
        // rendered. A form that saves into a shop nobody can reach is worse
        // than no form.
        <p
          role="status"
          className="rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          Removed shops cannot be changed.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-heading text-primary">Details</h2>
            {canManage ? (
              <ShopForm
                shopId={shop.id}
                initial={{
                  name: shop.name,
                  location: shop.location ?? '',
                  phone: shop.phone ?? '',
                }}
              />
            ) : (
              <p className="font-ui text-body-sm text-muted">
                You need to be a manager of this shop to change its details.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-heading text-primary">Brand</h2>
              <p className="font-ui text-body-sm text-secondary">
                What this shop’s offer books look like, and where that comes from.
              </p>
            </div>

            {isOwner ? (
              <BrandOverrideField
                shopId={shop.id}
                value={shop.brandOverride}
                source={brand.source}
              />
            ) : (
              <p className="font-ui text-body-sm text-muted">
                {brand.override === 'inherit'
                  ? 'This shop uses your organization’s brand. Only the owner can change that.'
                  : 'This shop has its own brand settings. Only the owner can change that.'}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-heading text-primary">Who can use it</h2>
              <p className="font-ui text-body-sm text-secondary">
                Access changes take effect immediately.
              </p>
            </div>

            {canManage ? (
              <ShopAccessField
                shopId={shop.id}
                candidates={candidates}
                assignableRoles={assignableRoles(orgRole)}
              />
            ) : (
              <ul className="flex flex-col">
                {candidates
                  .filter((c) => c.granted || c.orgRole === 'owner')
                  .map((person) => (
                    <li
                      key={person.id}
                      className="flex min-h-row items-center justify-between gap-3 border-b-hairline border-border-subtle py-3 last:border-b-0"
                    >
                      <span className="truncate font-ui text-body text-primary">
                        {person.name ?? person.email}
                      </span>
                      <span className="font-ui text-body-sm text-secondary">
                        {person.grantedRole ?? person.orgRole}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
