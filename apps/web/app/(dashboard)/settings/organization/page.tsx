import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { toRole } from '@/lib/authz'
import { shopCounts } from '@/lib/shops'
import { ORG_DELETE_BUILT } from '@/lib/features'
import { OrganizationForm } from '@/components/organization/OrganizationForm'

export const metadata: Metadata = { title: 'Organization · SouqStudio' }

/**
 * E2-01 — organization settings.
 *
 * Readable by anyone in the organization, editable only by the owner. The
 * fields here are what appears on an invoice, so a manager seeing them is
 * useful and a manager changing them is not.
 */
export default async function OrganizationSettingsPage() {
  const session = await requireCompliantSession()

  const [organization, counts, users] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        vatNumber: true,
        country: true,
        timezone: true,
      },
    }),
    shopCounts(session.user.organizationId),
    prisma.user.count({
      where: { organizationId: session.user.organizationId, removedAt: null },
    }),
  ])

  if (!organization) notFound()

  const isOwner = toRole(session.user.role) === 'owner'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Organization</h1>
        <p className="font-ui text-body text-secondary">
          Who you are on an invoice, and the settings every shop inherits.
        </p>
      </div>

      <p className="font-ui text-body-sm text-secondary">
        <span data-figure>{counts.total}</span>
        {counts.total === 1 ? ' shop' : ' shops'}
        {counts.inactive > 0 ? (
          <>
            {' ('}
            <span data-figure>{counts.inactive}</span>
            {' paused)'}
          </>
        ) : null}
        {' · '}
        <span data-figure>{users}</span>
        {users === 1 ? ' person' : ' people'}
      </p>

      <OrganizationForm
        organization={{
          id: organization.id,
          name: organization.name,
          email: organization.email,
          vatNumber: organization.vatNumber ?? '',
          country: organization.country,
          timezone: organization.timezone,
        }}
        canEdit={isOwner}
      />

      {/* E2-01 specifies deleting an organization, and it is deliberately not
          built: it needs a data export with no format, no delivery mechanism
          and no retention rule, on job infrastructure that does not exist, and
          it collides with E3's 90-day post-cancellation window. Shown disabled
          with the reason visible rather than omitted, so an owner looking for
          it learns where it is rather than concluding it is hidden. */}
      {isOwner && !ORG_DELETE_BUILT ? (
        <div className="flex flex-col gap-2 rounded-card border-hairline border-border-subtle p-4">
          <h2 className="font-display text-heading text-primary">Delete organization</h2>
          <p className="font-ui text-body-sm text-secondary">
            Not available yet. Deleting an organization exports your data first, and that
            export is still being built. Contact support if you need to close your account.
          </p>
        </div>
      ) : null}
    </div>
  )
}
