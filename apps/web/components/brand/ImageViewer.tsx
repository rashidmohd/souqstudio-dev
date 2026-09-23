'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog } from '@souqstudio/designer/components/ui/dialog'

/**
 * One generated image, large. E8.
 *
 * **Because choosing between four faces at thumbnail size is not choosing.** The
 * picker showed four squares in a grid and clicking one *kept* it — so the only
 * way to see a character properly was to commit to it. Viewing and committing
 * are now different actions, which is the substance of this rather than the
 * lightbox.
 *
 * **Steps through the set rather than opening one.** The owner is comparing, not
 * inspecting: four variations of one shop's character differ in ways a grid of
 * squares hides, and closing and reopening between each is how somebody gives up
 * and picks the first. Arrow keys work for the same reason.
 *
 * A feature component rather than a design-system primitive — it is a
 * composition of `Dialog`, not a new control, so it is not in the component
 * inventory. If a third feature wants it, that is when it earns promotion.
 */

export type ViewerImage = {
  url: string
  /** What this image is, used as the dialog's title and the alt text. */
  label: string
  /**
   * The proportions it was drawn at, as a CSS `aspect-ratio` — `'3 / 4'`.
   *
   * **Optional, and square when it is absent**, which is what a character is.
   * A cover is not: they are drawn at six different shapes, and a 9:16 story
   * cover letterboxed inside a square box is shown at barely half the size the
   * dialog has room for — while the owner is looking at it to judge whether it
   * works, which is the one job this screen has.
   */
  aspectRatio?: string
}

type Props = {
  images: ViewerImage[]
  /** Which one is showing. Null closes the viewer. */
  index: number | null
  onIndexChange: (index: number | null) => void
  /** Rendered under the image — a "Keep this" button, typically. */
  action?: (index: number) => React.ReactNode
}

export function ImageViewer({ images, index, onIndexChange, action }: Props) {
  const open = index !== null
  const current = index === null ? undefined : images[index]

  const step = React.useCallback(
    (by: number) => {
      if (index === null || images.length === 0) return
      onIndexChange((index + by + images.length) % images.length)
    },
    [index, images.length, onIndexChange]
  )

  /**
   * Arrows move between images.
   *
   * On `window` rather than on the dialog, because the native `<dialog>` holds
   * focus and the element the key lands on is whatever inside it was focused
   * last — a button, usually, which would swallow nothing but is not a reliable
   * place to listen. Escape is the platform's and is not handled here.
   */
  React.useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  if (current === undefined) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => onIndexChange(next ? index : null)}
      size="lg"
      title={current.label}
      {...(images.length > 1
        ? {
            description: `${(index ?? 0) + 1} of ${images.length}`,
          }
        : {})}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {images.length > 1 ? (
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous"
              className="inline-flex size-control shrink-0 items-center justify-center rounded-pill border border-border-strong text-primary hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          ) : null}

          {/*
           * `object-contain`, never `cover`. A generated character is a
           * full-length figure on a plain ground, and cropping one to fill a
           * frame cuts its feet off — which is the one thing an owner is looking
           * at this to check.
           *
           * **No box of its own unless the caller knows the shape.** This forced
           * `aspect-square` on anything without a stated ratio, which is every
           * character — and a *photo* character is a wide picture, so it
           * letterboxed into a tall empty frame with the figure as a band across
           * the middle. Left alone, the picture is its own shape and the only
           * thing imposed is a cap so it cannot push the dialog past the screen.
           *
           * A cover states its ratio, and there the box is worth having: it
           * reserves the right space before the bytes arrive, so the dialog does
           * not resize under the owner as they step through.
           *
           * **`min-w-0` and `flex-1` rather than `w-full`.** `w-full` is 100% of
           * the row, and the row also holds two 44px arrows and the gaps between
           * them — so the picture was always wider than the space left for it,
           * which is where the horizontal scrollbar came from.
           */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.label}
            className="min-w-0 flex-1 rounded-block border border-border-subtle bg-stone-0 object-contain max-h-media-cap"
            {...(current.aspectRatio === undefined
              ? {}
              : { style: { aspectRatio: current.aspectRatio } })}
          />

          {images.length > 1 ? (
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next"
              className="inline-flex size-control shrink-0 items-center justify-center rounded-pill border border-border-strong text-primary hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {action === undefined || index === null ? null : action(index)}
      </div>
    </Dialog>
  )
}
