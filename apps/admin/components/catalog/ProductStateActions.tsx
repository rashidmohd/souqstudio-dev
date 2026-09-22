'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'

/**
 * Archive, restore and promote. E13-02.
 *
 * Separate from the edit form on purpose. These are the three things that
 * change what a shop sees without changing a single field on the row, and each
 * writes its own audit entry.
 *
 * **Archiving is confirmed rather than undoable**, which is the opposite of the
 * design system's usual preference. Undo is better for anything reversible, and
 * this is reversible — but the row is shared: between the archive and the undo,
 * every shop on the platform loses the product from search. The confirmation
 * names the product, per the destructive-actions rule.
 */
export function ProductStateActions({
  productId,
  productName,
  archived,
  isPrivate,
}: {
  productId: string
  productName: string
  archived: boolean
  isPrivate: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function run(action: 'archive' | 'restore' | 'promote') {
    setPending(action)
    setError(null)
    try {
      const response = await fetch(`/api/v1/admin/catalog/products/${productId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = (await response.json()) as ApiResult<unknown>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setError('The server did not answer. Nothing changed, so try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : <ErrorState body={error} />}

      <div className="flex flex-wrap gap-2">
        {isPrivate ? (
          <Button
            type="button"
            onClick={() => void run('promote')}
            loading={pending === 'promote'}
          >
            Promote to universal
          </Button>
        ) : null}

        {archived ? (
          <Button
            type="button"
            onClick={() => void run('restore')}
            loading={pending === 'restore'}
          >
            Restore
          </Button>
        ) : confirming ? (
          <>
            <Button
              type="button"
              variant="danger"
              onClick={() => void run('archive')}
              loading={pending === 'archive'}
            >
              {`Archive ${productName}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
            Archive
          </Button>
        )}
      </div>

      {confirming && !archived ? (
        <p className="text-body-sm text-secondary">
          It disappears from search for every shop. Offer books already using it keep
          rendering, and you can restore it here.
        </p>
      ) : null}
    </div>
  )
}
