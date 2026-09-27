'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'

/**
 * Publish one block, then sync. E13-04.
 *
 * **Two buttons, not one, because they are two decisions.** Publishing writes
 * the document to the bucket and changes nothing that any shop sees. Syncing is
 * what gives the library to every shop, and it prunes: a seeded block the
 * library no longer lists is archived or deleted. Publishing three blocks
 * should be three writes and one sync, and a single combined button would make
 * that impossible to express.
 *
 * The screen says so out loud after a publish, because the two-step is the part
 * people get wrong.
 */

const CATEGORIES = [
  'offer-card',
  'header',
  'panel',
  'footer',
  'social-post',
  'seasonal',
] as const

type PublishResponse = { id: string; prefix: string; version: string; count: number }

export function PublishPanel({
  blockId,
  suggestedId,
  name,
  description,
  category,
}: {
  blockId: string
  /** The row's own id when it is a library id, else the copy it was last published as, else empty. */
  suggestedId: string
  name: string
  description: string
  category: string
}) {
  const router = useRouter()
  // A draft with no copy yet starts from its own name. The field used to start
  // empty under a "blk_ramadan_band" placeholder, and that is the id an offer
  // card went out under on 26 September.
  const [libraryId, setLibraryId] = useState(suggestedId === '' ? idFromName(name) : suggestedId)
  const [chosenCategory, setChosenCategory] = useState(category)
  const [published, setPublished] = useState<PublishResponse | null>(null)
  const [synced, setSynced] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'publish' | 'sync' | null>(null)

  async function publish() {
    setPending('publish')
    setError(null)
    try {
      const response = await fetch('/api/v1/admin/library/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          blockId,
          ...(libraryId.trim() === '' ? {} : { id: libraryId.trim() }),
          ...(chosenCategory === '' ? {} : { category: chosenCategory }),
          name,
          ...(description === '' ? {} : { description }),
        }),
      })
      const result = (await response.json()) as ApiResult<PublishResponse>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      setPublished(result.data)
      setSynced(null)
      router.refresh()
    } catch {
      setError('The server did not answer. Nothing was published, so try again.')
    } finally {
      setPending(null)
    }
  }

  async function sync() {
    setPending('sync')
    setError(null)
    try {
      const response = await fetch('/api/v1/admin/library/sync', { method: 'POST' })
      const result = (await response.json()) as ApiResult<{ source: string }>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      setSynced(result.data.source)
      router.refresh()
    } catch {
      setError('The server did not answer. Check whether the sync ran before retrying.')
    } finally {
      setPending(null)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-subhead text-primary">Publish to the library</h2>
        <p className="text-body-sm text-secondary">
          Publishing writes the document to the bucket. Shops see it after a sync.
        </p>
      </div>

      {error === null ? null : <ErrorState title="Not published" body={error} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Library id"
          htmlFor="libraryId"
          hint="Permanent and public. A cuid is a database key, not a name."
        >
          <Input
            id="libraryId"
            value={libraryId}
            onChange={(event) => setLibraryId(event.target.value)}
            placeholder={idFromName(name)}
          />
        </Field>

        <Field label="Group" htmlFor="libraryCategory">
          <Select
            id="libraryCategory"
            value={chosenCategory}
            onChange={(event) => setChosenCategory(event.target.value)}
          >
            <option value="">Keep the group on the row</option>
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" onClick={() => void publish()} loading={pending === 'publish'}>
          Publish
        </Button>
        <Button type="button" onClick={() => void sync()} loading={pending === 'sync'}>
          Sync to every shop
        </Button>
      </div>

      {published === null ? null : (
        <div className="flex flex-col gap-1 rounded-block bg-sand p-3">
          <p className="text-body text-charcoal">
            Published as{' '}
            <span data-figure="" dir="ltr" className="font-figure text-data">
              {published.id}
            </span>
            . The library now holds{' '}
            <span data-figure="" dir="ltr" className="font-figure text-data">
              {published.count}
            </span>{' '}
            blocks at version{' '}
            <span data-figure="" dir="ltr" className="font-figure text-data">
              {published.version}
            </span>
            .
          </p>
          <p className="text-body-sm text-secondary">
            No shop sees it yet. Sync when you have finished publishing.
          </p>
        </div>
      )}

      {synced === null ? null : (
        <div className="rounded-block bg-sand p-3">
          <p className="text-body text-charcoal">
            Synced from {synced}. Every shop now has this library.
          </p>
        </div>
      )}
    </Card>
  )
}

/** A library id made from a block's name: "Price pill on tinted panel" → "blk_price_pill_on_tinted_panel". */
function idFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return slug === '' ? '' : `blk_${slug}`
}
