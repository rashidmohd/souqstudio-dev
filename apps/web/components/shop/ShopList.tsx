'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { ShopSummary } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { ShopForm } from '@/components/shop/ShopForm'

/**
 * E2-02 — the shop list and everything that can be done to a row.
 *
 * The pending-action union and one shared dialog are lifted from
 * TwoFactorSettings, which solved the same problem: several row actions, only
 * some of them destructive, all needing the same confirm-and-report plumbing.
 *
 * Rendered as rows rather than through DataTable. A shop row carries a logo, a
 * name, a branch and a status stacked in one cell on a phone — DataTable's
 * column model would need every one of those to be its own column, and on a
 * 375px screen that is a horizontal scroll for the primary screen of the epic.
 * The team list is the table.
 */

type Pending =
  | { kind: 'deactivate'; shop: ShopSummary }
  | { kind: 'reactivate'; shop: ShopSummary }
  | { kind: 'archive'; shop: ShopSummary }

export function ShopList({
  shops,
  canManage,
  activeShopId,
}: {
  shops: ShopSummary[]
  /** Owner-only actions are hidden rather than shown disabled with no reason. */
  canManage: boolean
  activeShopId: string | null
}) {
  const router = useRouter()
  const [adding, setAdding] = React.useState(false)
  const [pending, setPending] = React.useState<Pending | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function post(url: string, method: 'POST' | 'DELETE' | 'PUT', body?: unknown) {
    setSubmitting(true)
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
      setPending(null)
      router.refresh()
      return true
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function runPending() {
    if (!pending) return
    const { kind, shop } = pending
    if (kind === 'archive') await post(`/api/v1/shops/${shop.id}`, 'DELETE')
    else await post(`/api/v1/shops/${shop.id}/${kind}`, 'POST')
  }

  if (shops.length === 0 && !adding) {
    return (
      <EmptyState
        kind="empty"
        title="No shops yet"
        body="A shop is one branch — its own offer books, its own team, and the brand it inherits from you."
        action={{ label: 'Add your first shop', onClick: () => setAdding(true) }}
      />
    )
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
        {shops.map((shop) => (
          <li
            key={shop.id}
            className="flex min-h-row flex-wrap items-center gap-3 border-b-hairline border-border-subtle py-3 last:border-b-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-ui text-body font-medium text-primary">
                  {shop.name}
                </span>

                {/* Status as plain text rather than a StatusPill: the pill's
                    enum has no value for a shop that is switched off, and
                    adding one is an inventory amendment, not a call to make
                    here. Colour never carries the meaning alone — the word
                    does. See the note in components/ui/select.tsx. */}
                {shop.archivedAt ? (
                  <span className="font-ui text-body-sm text-muted">Removed</span>
                ) : shop.isActive ? (
                  <span className="font-ui text-body-sm text-positive-fg">Active</span>
                ) : (
                  <span className="font-ui text-body-sm text-caution-fg">Paused</span>
                )}

                {shop.id === activeShopId ? (
                  <span className="rounded-chip bg-selected-bg px-2 py-px font-ui text-label text-selected-fg">
                    Viewing
                  </span>
                ) : null}
              </div>

              <p className="truncate font-ui text-body-sm text-secondary">
                {shop.location ?? 'No branch set'}
                {' · '}
                <span data-figure>{shop.memberCount}</span>
                {shop.memberCount === 1 ? ' person' : ' people'}
                {shop.lastOfferBookAt ? (
                  <>
                    {' · last offer '}
                    <span data-figure>
                      {new Date(shop.lastOfferBookAt).toLocaleDateString()}
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            {/* Ghost row actions, always visible — hover does not exist on the
                tablet a shop owner is holding. */}
            <div className="flex shrink-0 items-center gap-1">
              {shop.id !== activeShopId && !shop.archivedAt ? (
                <Button
                  variant="ghost"
                  onClick={() => post('/api/v1/shops/active', 'PUT', { shopId: shop.id })}
                >
                  Switch to
                </Button>
              ) : null}

              {/* Settings, not Edit. The detail page carries the shop's
                  details *and* its brand inheritance *and* its people, and
                  three of those do not fit in a row. Viewers get the link too
                  — the page shows them what they may see and nothing else. */}
              {!shop.archivedAt ? (
                <Button variant="ghost" onClick={() => router.push(`/settings/shops/${shop.id}`)}>
                  Settings
                </Button>
              ) : null}

              {canManage && !shop.archivedAt ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setPending({
                        kind: shop.isActive ? 'deactivate' : 'reactivate',
                        shop,
                      })
                    }
                  >
                    {shop.isActive ? 'Pause' : 'Reactivate'}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setPending({ kind: 'archive', shop })}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {canManage && !adding ? (
        <div>
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add shop
          </Button>
        </div>
      ) : null}

      {adding ? (
        <Card>
          <h2 className="mb-4 font-display text-heading text-primary">Add a shop</h2>
          <ShopForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Card>
      ) : null}

      {/* Pausing and reactivating are reversible and would ideally be a toast
          with undo — but Toast has props and no mounting mechanism in the
          inventory, so building one here would invent a second API. Confirming
          is the honest interim. Removing genuinely warrants the dialog. */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            setError(null)
          }
        }}
        title={
          pending?.kind === 'archive'
            ? `Remove ${pending.shop.name}`
            : pending?.kind === 'deactivate'
              ? `Pause ${pending.shop.name}`
              : `Reactivate ${pending?.shop.name ?? ''}`
        }
        description={
          pending?.kind === 'archive'
            ? 'Its offer books and analytics are kept and archived. This cannot be undone.'
            : pending?.kind === 'deactivate'
              ? 'It stops generating content and billing pauses for it. You can bring it back at any time.'
              : 'It starts generating content again and billing resumes for it.'
        }
        primaryAction={{
          label:
            pending?.kind === 'archive'
              ? `Remove ${pending.shop.name}`
              : pending?.kind === 'deactivate'
                ? 'Pause shop'
                : 'Reactivate shop',
          onClick: runPending,
          destructive: pending?.kind === 'archive',
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
