'use client'

import * as React from 'react'
import { COVER_SHAPE_NOTE, type CoverShape } from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { MachineOutput } from '@/components/ui/machine-output'
import { coverRatio, shapeFor } from '@/lib/cover-shape'

/**
 * Choose one of the shop's kept covers for this page. E8-04.
 *
 * **Generation is not here.** A cover is a brand asset, made once on `/brand`
 * and reused; making it inside a book was what left a shop paying five credits
 * again the next week for the same Ramadan cover. This screen only picks.
 *
 * **A cover drawn at the wrong shape is not hidden, it is marked.** A story
 * cover on an A4 page is cropped to a sliver by `fit: 'cover'` — but it is still
 * the owner's cover and they may have a reason, so the mismatch is a note on the
 * thumbnail rather than a filter that makes their own work disappear.
 */

type Cover = {
  id: string
  url: string
  key: string
  campaign: string
  style: string
  shape: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The page's aspect — width ÷ height. Decides which covers fit. */
  aspect: number
  /** Handed the R2 key of the cover chosen. */
  onChosen: (assetId: string) => void
}

export function CoverPicker({ open, onOpenChange, aspect, onChosen }: Props) {
  const [covers, setCovers] = React.useState<Cover[] | null>(null)
  const wanted = shapeFor(aspect)

  React.useEffect(() => {
    if (!open) return
    let live = true
    void read<{ covers: Cover[] }>('/api/v1/covers')
      .then((found) => {
        if (live) setCovers(found.covers)
      })
      .catch(() => {
        if (live) setCovers([])
      })
    return () => {
      live = false
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Your covers"
      description="Made in your brand kit. Choose one for this page."
      size="lg"
    >
      {covers === null ? (
        <p className="font-ui text-body-sm text-secondary">Loading your covers…</p>
      ) : covers.length === 0 ? (
        /*
          **An empty state that says where to go, not just that there is
          nothing.** This screen cannot generate, so "no covers yet" with no
          route out of it is a dead end — the same fault that moved character
          creation out of a dialog in the first place.
        */
        <p className="font-ui text-body-sm text-secondary">
          You have no covers yet. Make one in your brand kit, under Covers, and it will be here
          for every book.
        </p>
      ) : (
        <MachineOutput label="Generated in your brand kit">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {covers.map((cover) => {
              const fits = cover.shape === wanted
              return (
                <button
                  key={cover.id}
                  type="button"
                  className="group overflow-hidden rounded-card border border-default bg-surface text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                  onClick={() => {
                    onChosen(cover.key)
                    onOpenChange(false)
                  }}
                >
                  {/*
                    Its own shape, which is also what makes the note under it
                    legible: a cover drawn 9:16 now *looks* 9:16 beside a page
                    that is not, so "will be cropped on this page" is something
                    the owner can see rather than only read.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cover.url}
                    alt=""
                    className="block w-full object-cover transition-transform group-hover:scale-105"
                    style={{ aspectRatio: coverRatio(cover.shape) }}
                  />
                  <span className="block p-2 font-ui text-body-sm text-secondary">
                    {label(cover.campaign)}
                    {fits ? null : (
                      <span className="block text-muted">
                        {COVER_SHAPE_NOTE[cover.shape as CoverShape] ?? cover.shape} — will be
                        cropped on this page
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </MachineOutput>
      )}
    </Dialog>
  )
}

/** Sentence case, from the stored slug. The engine's label map may no longer
 *  carry an occasion a kept cover was made for, so this never indexes it. */
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
