'use client'

import * as React from 'react'
import { COVER_SHAPE_NOTE, type CoverShape } from '@souqstudio/engine'
import { Dialog } from '@/components/ui/dialog'
import { MachineOutput } from '@/components/ui/machine-output'
import { shapeFor } from '@/lib/cover-shape'

/**
 * Choose one of the shop's generated images for this page. E8-04.
 *
 * **It was the cover picker, and covers were all it could offer.** A shop that
 * had paid for a mascot and eight poses of it could not put any of them on a
 * page: this screen read `/api/v1/covers` and nothing else did. The images all
 * live at an R2 key under the same organization prefix, the background route's
 * tenancy check is that prefix, and `assetResolver` turns any of them into a
 * URL — so what was missing was never a mechanism, only a list. That list is
 * `/api/v1/brand/generated`, which the card designer's artwork dialog reads too.
 *
 * **Generation is not here.** A cover is a brand asset, made once on `/brand`
 * and reused; making it inside a book was what left a shop paying five credits
 * again the next week for the same Ramadan cover. This screen only picks.
 *
 * **A cover drawn at the wrong shape is not hidden, it is marked.** A story
 * cover on an A4 page is cropped to a sliver by `fit: 'cover'` — but it is still
 * the owner's cover and they may have a reason, so the mismatch is a note on the
 * thumbnail rather than a filter that makes their own work disappear. The note
 * is on covers alone: a character is a figure on a plain ground, drawn square
 * and never intended to fill a page, so telling an owner it "will be cropped"
 * would be warning them about the normal way to use it.
 */

type Generated = {
  id: string
  kind: 'cover' | 'character' | 'pose'
  key: string
  url: string
  label: string
  ratio: string
  /** Which page shape it was drawn for. Covers only — see the route. */
  shape?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The page's aspect — width ÷ height. Decides which covers fit. */
  aspect: number
  /** Handed the R2 key of the image chosen. */
  onChosen: (assetId: string) => void
}

/** The order the groups appear in, and what each one is called. */
const GROUPS: ReadonlyArray<{ kind: Generated['kind']; label: string }> = [
  { kind: 'cover', label: 'Covers' },
  { kind: 'character', label: 'Characters' },
  { kind: 'pose', label: 'Poses' },
]

export function GeneratedPicker({ open, onOpenChange, aspect, onChosen }: Props) {
  const [images, setImages] = React.useState<Generated[] | null>(null)
  const wanted = shapeFor(aspect)

  React.useEffect(() => {
    if (!open) return
    let live = true
    void read<{ images: Generated[] }>('/api/v1/brand/generated')
      .then((found) => {
        if (live) setImages(found.images)
      })
      .catch(() => {
        if (live) setImages([])
      })
    return () => {
      live = false
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Your generated images"
      description="Everything you have made in your brand kit — covers, characters and poses. Choose one for this page."
      size="lg"
    >
      {images === null ? (
        <p className="font-ui text-body-sm text-secondary">Loading your images…</p>
      ) : images.length === 0 ? (
        /*
          **An empty state that says where to go, not just that there is
          nothing.** This screen cannot generate, so "nothing yet" with no route
          out of it is a dead end — the same fault that moved character creation
          out of a dialog in the first place.
        */
        <p className="font-ui text-body-sm text-secondary">
          You have not generated anything yet. Make a cover or a character in your brand kit and
          it will be here for every book.
        </p>
      ) : (
        <MachineOutput label="Generated in your brand kit">
          <div className="flex flex-col gap-4">
            {GROUPS.map((group) => {
              const mine = images.filter((image) => image.kind === group.kind)
              if (mine.length === 0) return null

              return (
                <section key={group.kind} className="flex flex-col gap-2">
                  <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {mine.map((image) => (
                      <button
                        key={image.id}
                        type="button"
                        className="group overflow-hidden rounded-card border border-default bg-surface text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                        onClick={() => {
                          onChosen(image.key)
                          onOpenChange(false)
                        }}
                      >
                        {/*
                          Its own shape, which is also what makes the note below
                          legible: a cover drawn 9:16 now *looks* 9:16 beside a
                          page that is not, so "will be cropped on this page" is
                          something the owner can see rather than only read.

                          `contain` for a figure, `cover` for a cover: a
                          character on a plain ground has its feet at the edge of
                          the frame, and a tile that crops to fill cuts them off.
                        */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt=""
                          className={`block w-full transition-transform group-hover:scale-105 ${
                            image.kind === 'cover' ? 'object-cover' : 'bg-stone-0 object-contain'
                          }`}
                          style={{ aspectRatio: image.ratio }}
                          loading="lazy"
                        />
                        <span className="block p-2 font-ui text-body-sm text-secondary">
                          {image.label}
                          {mismatch(image, wanted)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </MachineOutput>
      )}
    </Dialog>
  )
}

/**
 * The shape warning, for covers alone and only when it is wrong.
 *
 * A cover is the one kind drawn *to be* a page, so it is the one kind that can
 * be drawn at the wrong page shape. Everything else is artwork placed on a page
 * and is no more "cropped" than a photograph is — which is why this reads the
 * `shape` the route sends rather than inferring one from the ratio: absent is a
 * real answer and it means "not that sort of picture".
 */
function mismatch(image: Generated, wanted: CoverShape): React.ReactNode {
  if (image.shape === undefined || image.shape === wanted) return null

  return (
    <span className="block text-muted">
      {/* Asserted because `shape` is a stored column and the map is keyed by the
          shapes we currently offer — a row naming an older one indexes to
          `undefined`, which is what the fallback is for. The assertion is how
          the lookup is spelled, not a claim that the value is one of them. */}
      {COVER_SHAPE_NOTE[image.shape as CoverShape] ?? image.shape} — will be cropped on this page
    </span>
  )
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
