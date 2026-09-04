'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { Role } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

/**
 * E2-04 — who can use this shop, and with what role in it.
 *
 * This is the screen where "the same or different role per shop" becomes
 * usable. The invite form assigns shops at invite time; everything after that
 * happens here.
 *
 * Owners are listed and locked: they reach every shop implicitly and hold no
 * grant row, so there is nothing to tick and unticking would be a lie.
 */

export type ShopMemberCandidate = {
  id: string
  name: string | null
  email: string
  /** Their organization role — the fallback when no per-shop role is set. */
  orgRole: Role
  /** Current grant on this shop: absent means no access. */
  granted: boolean
  /** Per-shop override, if any. Null means "use their organization role". */
  grantedRole: Role | null
}

type Draft = { granted: boolean; role: string }

export function ShopAccessField({
  shopId,
  candidates,
  assignableRoles,
}: {
  shopId: string
  candidates: ShopMemberCandidate[]
  assignableRoles: Role[]
}) {
  const router = useRouter()

  // 'inherit' is the sentinel for "no per-shop override" — the API wants the
  // key absent, and a select cannot hold undefined.
  const initial = React.useMemo(
    () =>
      Object.fromEntries(
        candidates.map((c) => [
          c.id,
          { granted: c.granted, role: c.grantedRole ?? 'inherit' } satisfies Draft,
        ])
      ),
    [candidates]
  )

  const [draft, setDraft] = React.useState<Record<string, Draft>>(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const dirty = React.useMemo(
    () =>
      candidates.some(
        (c) =>
          draft[c.id]?.granted !== initial[c.id]?.granted ||
          draft[c.id]?.role !== initial[c.id]?.role
      ),
    [candidates, draft, initial]
  )

  function update(id: string, patch: Partial<Draft>) {
    setDraft((prev) => ({
      ...prev,
      [id]: { granted: false, role: 'inherit', ...prev[id], ...patch },
    }))
    setSaved(false)
  }

  async function save() {
    setError(null)
    setSaved(false)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/shops/${shopId}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: candidates
            .filter((c) => c.orgRole !== 'owner' && draft[c.id]?.granted)
            .map((c) => {
              const role = draft[c.id]?.role
              return role && role !== 'inherit'
                ? { userId: c.id, role }
                : { userId: c.id }
            }),
        }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="font-ui text-body-sm text-secondary">
        Nobody to add yet. Invite someone from the team screen first.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {error}
        </p>
      ) : null}

      {saved && !dirty ? (
        <p
          role="status"
          className="rounded-control bg-positive-bg px-3 py-2 font-ui text-body-sm text-positive-fg"
        >
          Saved.
        </p>
      ) : null}

      <ul className="flex flex-col">
        {candidates.map((person) => {
          const isOwner = person.orgRole === 'owner'
          const row = draft[person.id]
          return (
            <li
              key={person.id}
              className="flex min-h-row flex-wrap items-center gap-3 border-b-hairline border-border-subtle py-3 last:border-b-0"
            >
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 rounded-chip border-hairline border-border-strong"
                  checked={isOwner || (row?.granted ?? false)}
                  disabled={isOwner}
                  onChange={(e) => update(person.id, { granted: e.target.checked })}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-ui text-body text-primary">
                    {person.name ?? person.email}
                  </span>
                  <span className="truncate font-ui text-body-sm text-secondary">
                    {person.name ? person.email : null}
                    {isOwner ? 'Owner — has every shop' : null}
                  </span>
                </span>
              </label>

              {!isOwner && row?.granted ? (
                <Select
                  label="Role in this shop"
                  className="w-field-select"
                  value={row.role}
                  onChange={(e) => update(person.id, { role: e.target.value })}
                  options={[
                    {
                      value: 'inherit',
                      label: `Same as their role (${person.orgRole})`,
                    },
                    ...assignableRoles.map((r) => ({
                      value: r,
                      label: r.charAt(0).toUpperCase() + r.slice(1),
                    })),
                  ]}
                />
              ) : null}
            </li>
          )
        })}
      </ul>

      {dirty ? (
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={save} loading={submitting}>
            Save access
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(initial)
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  )
}
