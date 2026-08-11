'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { Role, TeamMemberSummary } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { InviteForm } from '@/components/team/InviteForm'

/**
 * E2-03 and E2-04 — the team, and what can be done to each row.
 *
 * Members and pending invites are one list. The row action differs — a member
 * can be given a different role or removed, an invitation can be resent or
 * withdrawn — but "who is on my team" is one question and deserves one answer.
 */

type Pending =
  | { kind: 'remove'; member: TeamMemberSummary }
  | { kind: 'revoke'; member: TeamMemberSummary }

export function TeamList({
  members,
  assignableRoles,
  shops,
  currentUserId,
  isOwner,
}: {
  members: TeamMemberSummary[]
  assignableRoles: Role[]
  shops: Array<{ id: string; name: string }>
  currentUserId: string
  isOwner: boolean
}) {
  const router = useRouter()
  const [inviting, setInviting] = React.useState(false)
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busyRow, setBusyRow] = React.useState<string | null>(null)

  async function call(url: string, method: 'POST' | 'DELETE' | 'PATCH', body?: unknown) {
    setError(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return false
      }
      router.refresh()
      return true
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      return false
    }
  }

  async function changeRole(member: TeamMemberSummary, role: string) {
    setBusyRow(member.id)
    await call(`/api/v1/users/${member.id}`, 'PATCH', { role })
    setBusyRow(null)
  }

  async function runPending() {
    if (!pending) return
    setSubmitting(true)
    const ok =
      pending.kind === 'remove'
        ? await call(`/api/v1/users/${pending.member.id}`, 'DELETE')
        : await call(`/api/v1/invites/${pending.member.id}`, 'DELETE')
    setSubmitting(false)
    if (ok) setPending(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {error && !pending ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col">
        {members.map((member) => (
          <li
            key={`${member.kind}-${member.id}`}
            className="flex min-h-row flex-wrap items-center gap-3 border-b-hairline border-border-subtle py-3 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-ui text-body font-medium text-primary">
                  {member.name ?? member.email}
                </span>
                {member.id === currentUserId ? (
                  <span className="font-ui text-body-sm text-muted">You</span>
                ) : null}
                {/* Status as words, not a pill — StatusPill's enum has no
                    value for a pending invitation. See components/ui/select.tsx. */}
                {member.kind === 'invite' ? (
                  <span className="font-ui text-body-sm text-caution-fg">
                    {member.status === 'expired' ? 'Invitation expired' : 'Invited'}
                  </span>
                ) : null}
              </div>

              <p className="truncate font-ui text-body-sm text-secondary">
                {member.name ? `${member.email} · ` : ''}
                {member.shops.length === 0
                  ? 'No shops yet'
                  : member.shops.map((s) => s.name).join(', ')}
                {member.lastLoginAt ? (
                  <>
                    {' · last active '}
                    <span data-figure>
                      {new Date(member.lastLoginAt).toLocaleDateString()}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* An owner's role is not editable inline. Changing it is a
                  last-owner question, and a select that sometimes refuses on
                  change is a worse control than no select. */}
              {isOwner &&
              member.kind === 'member' &&
              member.id !== currentUserId &&
              member.role !== 'owner' ? (
                <Select
                  label="Role"
                  className="w-36"
                  value={member.role}
                  disabled={busyRow === member.id}
                  onChange={(e) => changeRole(member, e.target.value)}
                  options={assignableRoles.map((r) => ({
                    value: r,
                    label: r.charAt(0).toUpperCase() + r.slice(1),
                  }))}
                />
              ) : (
                <span className="font-ui text-body-sm text-secondary">
                  {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                </span>
              )}

              {member.kind === 'invite' ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => call(`/api/v1/invites/${member.id}/resend`, 'POST')}
                  >
                    Resend
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setPending({ kind: 'revoke', member })}
                  >
                    Withdraw
                  </Button>
                </>
              ) : isOwner && member.id !== currentUserId ? (
                <Button
                  variant="danger"
                  onClick={() => setPending({ kind: 'remove', member })}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!inviting ? (
        <div>
          <Button variant="primary" onClick={() => setInviting(true)}>
            Invite someone
          </Button>
        </div>
      ) : (
        <Card>
          <h2 className="mb-4 font-display text-heading text-primary">
            Invite a teammate
          </h2>
          <InviteForm
            assignableRoles={assignableRoles}
            shops={shops}
            onDone={() => setInviting(false)}
            onCancel={() => setInviting(false)}
          />
        </Card>
      )}

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            setError(null)
          }
        }}
        title={
          pending?.kind === 'remove'
            ? `Remove ${pending.member.name ?? pending.member.email}`
            : `Withdraw the invitation to ${pending?.member.email ?? ''}`
        }
        description={
          pending?.kind === 'remove'
            ? 'They lose access immediately and are signed out everywhere. Their offer books are kept.'
            : 'The link in their email stops working. You can invite them again later.'
        }
        primaryAction={{
          label:
            pending?.kind === 'remove'
              ? `Remove ${pending.member.name ?? pending.member.email}`
              : 'Withdraw invitation',
          onClick: runPending,
          destructive: true,
          loading: submitting,
        }}
        secondaryAction={{ label: 'Cancel', onClick: () => setPending(null) }}
      >
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
          >
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}
