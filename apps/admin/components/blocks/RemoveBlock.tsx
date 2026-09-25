'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'

/**
 * Take a block out: unpublish it from the library, or delete a draft or an
 * archived block. E13-04.
 *
 * **Two clicks, because neither is undone by a third.** The first arms the
 * button and says what will happen; the second does it. A native `confirm()`
 * would do the same with less said, and saying it is the point: unpublishing
 * changes nothing until a sync, and a delete may turn into an archive.
 *
 * The routes make every one of these decisions again; this only decides what to
 * offer.
 */
export function RemoveBlock({
  blockId,
  libraryId,
  mode,
}: {
  blockId: string
  /** The block's `blk_` id, for unpublishing. */
  libraryId: string | null
  mode: 'unpublish' | 'delete'
}) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const response =
        mode === 'unpublish'
          ? await fetch('/api/v1/admin/library/unpublish', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: libraryId }),
            })
          : await fetch(`/api/v1/admin/blocks/${blockId}`, { method: 'DELETE' })
      const result = (await response.json()) as ApiResult<{
        deleted?: boolean
        archivedInstead?: boolean
      }>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      if (mode === 'delete' && result.data.deleted === true) {
        router.push('/blocks')
        return
      }
      setNote(
        mode === 'unpublish'
          ? 'Unpublished. Shops still have it until the library is synced: use Sync above.'
          : 'A book still uses this block, so it was archived instead of deleted. It is out of every picker.'
      )
      setArmed(false)
      router.refresh()
    } catch {
      setError('Nothing changed. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const what =
    mode === 'unpublish'
      ? 'This takes it out of the library. The next sync removes it from shops, and archives it where a book already uses it, so no sent flyer changes.'
      : 'This deletes the block and its saved versions for good. If a book uses it, it is archived instead.'

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm text-secondary">{what}</p>
      <div className="flex flex-wrap gap-2">
        {armed ? (
          <>
            <Button type="button" variant="danger" loading={busy} onClick={() => void run()}>
              {mode === 'unpublish' ? 'Yes, unpublish it' : 'Yes, delete it'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setArmed(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="danger" onClick={() => setArmed(true)}>
            {mode === 'unpublish' ? 'Unpublish from library' : 'Delete block'}
          </Button>
        )}
      </div>
      {note === null ? null : <p className="rounded-block bg-sand p-3 text-body text-charcoal">{note}</p>}
      {error === null ? null : <ErrorState title="Not done" body={error} />}
    </div>
  )
}
