'use client'

import * as React from 'react'
import type { ImageSource } from '@souqstudio/types'
import { Slider } from '../ui/slider'
import { MAX_BLUR_RADIUS, renderBlurred } from '../../lib/blur-image'
import { uploadArtwork } from '../../lib/upload-artwork'

/**
 * Blur, for a picture an owner uploaded into a block. E7.
 *
 * **It renders pixels rather than setting a filter**, which is the whole design
 * and is not negotiable: E14 §2.4 measured `feGaussianBlur` rasterising its own
 * element at a resolution Chromium picks — about 220dpi against a 300dpi target
 * and reachable from nothing in the document — so filters are banned on
 * anything that reaches the export path. The blurred picture is produced once,
 * stored as its own asset, and drawn by an `<image>` carrying no filter at all.
 * `lib/blur-image.ts` has the measurement and the mechanics.
 *
 * **Uploads only.** The caller renders this for `from: 'asset'` and the union
 * makes that the only member with a `blur` field, because a product image is
 * chosen from the catalog at render time and a logo belongs to whichever shop
 * draws the block. Neither is a single file that could have been blurred in
 * advance.
 *
 * **The same control the page background has**, deliberately shaped the same
 * way: the thumb moves live and the picture changes on release, because each
 * commit is a render, an upload and a write.
 */
export function ImageBlurControl({
  source,
  assetBaseUrl,
  disabled,
  onChange,
}: {
  source: Extract<ImageSource, { from: 'asset' }>
  assetBaseUrl: string
  disabled: boolean
  onChange: (source: ImageSource) => void
}) {
  const [working, setWorking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /*
   * Percent of the image's shorter edge, because `Slider` shows its value and
   * `0.03` is not a number an owner can act on or repeat on a second block.
   */
  const stored = Math.round((source.blur?.radius ?? 0) * 1000) / 10
  const [percent, setPercent] = React.useState(stored)
  React.useEffect(() => setPercent(stored), [stored])

  async function commit(radius: number) {
    if (radius === (source.blur?.radius ?? 0)) return

    // Always the original. Blurring an already blurred picture compounds — two
    // passes at r are one at r√2 — so the slider would drift with every drag
    // and dragging back to zero would leave a soft picture.
    const original = source.blur?.from ?? source.assetId
    setError(null)

    if (radius <= 0) {
      /*
       * **Zero points back at the original rather than rendering one.** The
       * blurred derivative is left in the bucket: an owner nudging a slider
       * must not be able to destroy the only copy of their artwork, and an
       * orphaned object is the cheaper of the two mistakes.
       */
      onChange({ from: 'asset', assetId: original })
      return
    }

    setWorking(true)
    try {
      const base = assetBaseUrl.replace(/\/$/, '')
      const rendered = await renderBlurred(`${base}/${original}`, radius)
      if (rendered === null) {
        setError('That image could not be blurred. Try again.')
        setPercent(stored)
        return
      }

      const assetId = await uploadArtwork(rendered)
      if (assetId === null) {
        setError('That blurred image could not be saved. Try again.')
        setPercent(stored)
        return
      }

      onChange({ from: 'asset', assetId, blur: { from: original, radius } })
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Slider
        label="Blur"
        min={0}
        max={MAX_BLUR_RADIUS * 100}
        step={0.5}
        unit="%"
        value={percent}
        disabled={disabled || working}
        onValueChange={setPercent}
        // Release, not change: every step would be a render, an upload and a
        // write. Both events, because a slider is a keyboard control too.
        onPointerUp={() => void commit(percent / 100)}
        onKeyUp={() => void commit(percent / 100)}
        hint={working ? 'Blurring the image…' : 'Softens the picture behind whatever sits on it.'}
      />
      {error === null ? null : (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
