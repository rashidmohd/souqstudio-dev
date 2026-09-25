'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'

/**
 * Publish, retire or return one gallery shape to draft. E13-04.
 *
 * Only offered to a super admin, the same bar the route puts on it: publishing
 * changes every shop's designer. Retiring never touches a block that already
 * uses the shape; the outline is a copy in that block.
 */
export function ShapeActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function set(next: 'draft' | 'published' | 'archived') {
    setBusy(next)
    setError(null)
    try {
      const response = await fetch(`/api/v1/admin/shapes/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const result = (await response.json()) as ApiResult<unknown>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      router.refresh()
    } catch {
      setError('Not changed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {status !== 'published' ? (
          <Button
            type="button"
            variant="secondary"
            loading={busy === 'published'}
            onClick={() => void set('published')}
          >
            Publish
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            loading={busy === 'archived'}
            onClick={() => void set('archived')}
          >
            Retire
          </Button>
        )}
        {status === 'archived' ? (
          <Button
            type="button"
            variant="ghost"
            loading={busy === 'draft'}
            onClick={() => void set('draft')}
          >
            Back to draft
          </Button>
        ) : null}
      </div>
      {error === null ? null : (
        <p role="alert" className="text-body-sm text-critical-fg">
          {error}
        </p>
      )}
    </div>
  )
}
