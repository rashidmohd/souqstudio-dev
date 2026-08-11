import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireCompliantSession } from '@/lib/session'
import { assignableRoles, atLeast, toRole } from '@/lib/authz'
import { listTeam } from '@/lib/team'
import { TeamList } from '@/components/team/TeamList'

export const metadata: Metadata = { title: 'Team · SouqStudio' }

/**
 * E2-03 and E2-04 — team management.
 *
 * Editors and viewers do not get a team screen at all. There is nothing here
 * they may do, and a page that renders a list of colleagues with every control
 * disabled is worse than one that is not in the rail: it invites the question
 * "why can't I" and answers it nowhere.
 */
export default async function TeamSettingsPage() {
  const session = await requireCompliantSession()
  const role = toRole(session.user.role)

  if (!atLeast(role, 'manager')) redirect('/')

  const [team, shops] = await Promise.all([
    listTeam(session),
    prisma.shop.findMany({
      where: { organizationId: session.user.organizationId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Team</h1>
        <p className="font-ui text-body text-secondary">
          Who can sign in, and which shops each of them can use.
        </p>
      </div>

      {team.truncated ? (
        <p
          role="status"
          className="rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          Only the first <span data-figure>500</span> people are shown.
        </p>
      ) : null}

      <TeamList
        members={team.items}
        // Filtered on the server. Rendering all four roles and letting the API
        // refuse would show a manager an option that can never work.
        assignableRoles={assignableRoles(role)}
        shops={shops}
        currentUserId={session.user.id}
        isOwner={role === 'owner'}
      />
    </div>
  )
}
