'use client'

import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MachineOutput } from '@/components/ui/machine-output'
import { CoverDialog } from '@/components/brand/CoverDialog'
import { ImageViewer } from '@/components/brand/ImageViewer'
import { coverRatio } from '@/lib/cover-shape'

/**
 * The shop's kept covers. E8-04.
 *
 * **Here rather than in the editor, because a cover is a brand asset.** It
 * shipped as a page background made inside one book, which meant it could never
 * be reused — the same shop paying five credits again the next week for the same
 * Ramadan cover. Made once here, picked from any book's page background.
 */

type Cover = {
  id: string
  url: string
  key: string
  campaign: string
  style: string
  shape: string
}

export function CoverGallery() {
  const [covers, setCovers] = React.useState<Cover[] | null>(null)
  const [making, setMaking] = React.useState(false)
  const [viewing, setViewing] = React.useState<number | null>(null)

  const load = React.useCallback(() => {
    void read<{ covers: Cover[] }>('/api/v1/covers')
      .then((found) => setCovers(found.covers))
      .catch(() => setCovers([]))
  }, [])

  React.useEffect(load, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-ui text-body-sm text-secondary">
          A cover is drawn from your character, your shop and your colours. Make one here and any
          offer book can use it.
        </p>
        <Button type="button" onClick={() => setMaking(true)}>
          <Sparkles className="size-4" aria-hidden="true" strokeWidth={1.75} />
          Generate a cover
        </Button>
      </div>

      {covers === null ? (
        <p className="font-ui text-body-sm text-secondary">Loading…</p>
      ) : covers.length === 0 ? (
        <p className="font-ui text-body-sm text-secondary">
          No covers yet. Generating costs <span data-figure>5</span> credits and draws{' '}
          <span data-figure>3</span> covers — all three are saved here.
        </p>
      ) : (
        <MachineOutput label="Generated from your character and your shop">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {covers.map((cover, index) => (
              <li key={cover.id}>
                <button
                  type="button"
                  className="w-full overflow-hidden rounded-card border border-border-subtle bg-surface text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                  onClick={() => setViewing(index)}
                >
                  {/*
                    The shape it was drawn at, never a square. `coverRatio`
                    carries the reasoning; the short of it is that a square
                    thumbnail of a 16:9 cover is a crop of the cover rather than
                    the cover, and an owner picking between two of them is
                    picking between two crops.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover.url}
                    alt={`${label(cover.campaign)} cover`}
                    className="block w-full object-cover transition-transform duration-fast ease-sq hover:scale-105"
                    style={{ aspectRatio: coverRatio(cover.shape) }}
                  />
                  <span className="block p-2 font-ui text-body-sm text-secondary">
                    {label(cover.campaign)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </MachineOutput>
      )}

      <CoverDialog open={making} onOpenChange={setMaking} onKept={load} />

      {viewing !== null && covers !== null ? (
        <ImageViewer
          images={covers.map((cover) => ({
            url: cover.url,
            label: `${label(cover.campaign)} cover`,
            aspectRatio: coverRatio(cover.shape),
          }))}
          index={viewing}
          onIndexChange={setViewing}
        />
      ) : null}
    </div>
  )
}

/** Sentence case from the stored slug, never an index into the engine's label
 *  map — a kept cover may name an occasion no longer offered. */
function label(campaign: string): string {
  const words = campaign.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const body = (await response.json().catch(() => null)) as {
    data: T | null
    error: { message: string } | null
  } | null
  if (body?.error) throw new Error(body.error.message)
  if (!response.ok || body?.data === null || body?.data === undefined) {
    throw new Error('Those could not be loaded.')
  }
  return body.data
}
