'use client'

import * as React from 'react'
import { Image as ImageIcon, Sparkles, Trash2 } from 'lucide-react'
import type { BrandColor, ColorValue, PageBackground, TokenRef } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ColorControl } from '@/components/card-designer/ColorControl'
import { uploadArtwork } from '@/lib/upload-artwork'
import { MAX_BLUR_RADIUS, renderBlurred } from '@/lib/blur-image'
import { CoverPicker } from '@/components/editor/CoverPicker'

/**
 * The paper behind every card in the book. E6 —
 * `docs/E6-create-flow.md` §11.
 *
 * **The page ground was a constant until now.** Every renderer painted
 * `--sq-tpl-paper` and a `PageGrid` had no way to say otherwise, so a shop whose
 * brand is a deep navy could put navy on every *card* and still print them on
 * white paper with white gutters between them. That is a different design from
 * the one they thought they were making.
 *
 * **Three modes, and the middle one covers two things on purpose.** A flat
 * colour and a gradient are one choice to an owner — "what colour is the page" —
 * and `ColorControl` already asks it that way, with a Solid/Gradient segmented
 * control inside. Splitting them here would be four modes for three decisions,
 * and would also mean a second gradient editor.
 *
 * **A generated cover arrives by the same door as an uploaded one.** E8-04
 * draws from the shop's character and its own photographs and stores the result
 * at `{org}/{shop}/covers/…`; this control
 * already turns an R2 key into `{ from: 'asset' }`, and that key satisfies the
 * background route's org-prefix tenancy check unchanged. So "Generate" sits
 * beside "Upload" and everything downstream — the fit control, the strength
 * slider, `assetResolver`, the painter — cannot tell the two apart.
 *
 * **`ColorControl` is reused from the card designer rather than rebuilt.** It
 * carries the palette rows, the mechanics row, the hex box, the eight gradient
 * directions and the stop editor; a second colour picker in this product is how
 * the two start offering different palettes. The component inventory's rule is
 * that a component already in the file is used as specified, and this is that.
 */
type Props = {
  value: PageBackground | null
  onChange: (value: PageBackground | null) => void
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  disabled: boolean
  /**
   * The page's aspect — width ÷ height — which decides the shape a generated
   * ground is drawn at. Omitted hides the generate button entirely, so a caller
   * that does not know its page shape offers upload alone rather than drawing a
   * story-shaped ground onto an A4 page.
   */
  aspect?: number | undefined
  /**
   * Where an `assetId` becomes a URL, for the blur control alone.
   *
   * **Blurring needs the original's bytes**, because it re-renders from the
   * unblurred picture every time rather than blurring what is already blurred —
   * two passes of a Gaussian is a third, wider one, and the slider would stop
   * meaning anything after the second drag. Omitted hides the blur slider; the
   * rest of the control is unaffected.
   */
  assetBaseUrl?: string | undefined
}

type Mode = 'none' | 'color' | 'image'

/** What mode a stored background is in. */
function modeOf(value: PageBackground | null): Mode {
  if (value === null) return 'none'
  return value.from === 'asset' ? 'image' : 'color'
}

export function PageBackgroundControl({
  value,
  onChange,
  palette,
  token,
  disabled,
  aspect,
  assetBaseUrl,
}: Props) {
  const mode = modeOf(value)
  const [generating, setGenerating] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [blurring, setBlurring] = React.useState(false)

  /**
   * The blur slider's live position, in percent of the image's shorter edge.
   *
   * **Local, because the committed value and the thumb are not the same thing
   * here.** Every other control in this panel writes on change and the write is
   * debounced; this one re-renders an image and uploads it, so it writes on
   * release. The thumb has to move in between or the control feels broken.
   *
   * Percent rather than the stored fraction so the readout says `3%` instead of
   * `0.03` — `Slider` shows its value and a number nobody can act on is the
   * defect its own comment describes.
   */
  const storedBlur =
    value !== null && value.from === 'asset'
      ? Math.round((value.blur?.radius ?? 0) * 1000) / 10
      : 0
  const [blurPercent, setBlurPercent] = React.useState(storedBlur)
  React.useEffect(() => setBlurPercent(storedBlur), [storedBlur])
  const [error, setError] = React.useState<string | null>(null)
  const file = React.useRef<HTMLInputElement>(null)

  /**
   * The colour an owner gets when they switch from paper.
   *
   * **`surface` rather than a literal white**, so the page follows the shop's
   * brand the way every other ground in the product does. It is also visibly a
   * *choice* the moment the shop's surface is not white, which is the feedback
   * that says the control worked.
   */
  function toColor() {
    onChange({ from: 'role', ref: 'surface' })
  }

  /**
   * Re-render the background at a new blur radius.
   *
   * **Always from the original, never from what is on screen.** Blurring an
   * already blurred picture compounds — two passes at r are one pass at
   * r√2 — so the slider would drift further with every drag and dragging it
   * back to zero would leave a soft picture. `blur.from` is kept for exactly
   * this.
   *
   * **Zero restores the original rather than rendering it.** There is nothing to
   * draw and nothing to upload; the background simply points back at the picture
   * the owner chose, and the blurred derivative is abandoned in the bucket. That
   * is deliberate: an owner nudging a slider must not be able to destroy the
   * only copy of their photograph, and an orphaned object costs less than a
   * background nobody can un-blur.
   */
  async function setBlur(radius: number) {
    if (value === null || value.from !== 'asset' || assetBaseUrl === undefined) return
    // Releasing without having moved is not a change. Without this, every click
    // on the track's thumb costs a render and an upload.
    if (radius === (value.blur?.radius ?? 0)) return

    const original = value.blur?.from ?? value.assetId
    setError(null)

    if (radius <= 0) {
      const { blur: _dropped, ...rest } = value
      onChange({ ...rest, assetId: original })
      return
    }

    setBlurring(true)
    try {
      const base = assetBaseUrl.replace(/\/$/, '')
      const rendered = await renderBlurred(`${base}/${original}`, radius)
      if (rendered === null) {
        setError('That image could not be blurred. Try again.')
        // The thumb goes back to what is actually stored. Leaving it where the
        // owner dropped it would claim a blur the page is not drawing.
        setBlurPercent(storedBlur)
        return
      }

      const assetId = await uploadArtwork(rendered)
      if (assetId === null) {
        setError('That blurred image could not be saved. Try again.')
        setBlurPercent(storedBlur)
        return
      }

      onChange({ ...value, assetId, blur: { from: original, radius } })
    } finally {
      setBlurring(false)
    }
  }

  async function pick(chosen: File) {
    setError(null)
    setUploading(true)
    try {
      const assetId = await uploadArtwork(chosen)
      if (assetId === null) {
        setError('That image could not be uploaded. Try again.')
        return
      }
      // `cover` and full strength to begin with: an owner who picked a
      // photograph wants to see the photograph. Knocking it back is the next
      // thing they reach for, and the slider is right there.
      onChange({ from: 'asset', assetId, fit: 'cover', opacity: 1 })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">Background</h3>

      <Segmented
        label="Page background"
        value={mode}
        disabled={disabled}
        options={[
          { value: 'none', label: 'Paper' },
          { value: 'color', label: 'Colour' },
          { value: 'image', label: 'Image' },
        ]}
        onChange={(next) => {
          if (next === 'none') return onChange(null)
          if (next === 'color') return toColor()
          // Image cannot be entered by switching: there is nothing to show until
          // a file exists, and a mode that renders an empty box is a mode the
          // owner has to undo. The picker opens instead, and the background only
          // changes once bytes are in the bucket.
          file.current?.click()
        }}
      />

      {/*
        **Outside the mode blocks, and available in every mode.** Switching the
        segmented control to Image opens the file picker for the reason stated
        above — there is nothing to show until a file exists. That leaves an
        owner who wants a *generated* ground with no way in, so the button is
        here rather than inside the image mode they cannot reach yet. It keeps
        the same contract the picker does: the background changes only once
        there is a key, and closing the dialog changes nothing.
      */}
      {aspect !== undefined ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => setGenerating(true)}
          >
            <Sparkles className="size-4" aria-hidden="true" strokeWidth={1.75} />
            Your covers
          </Button>
        </div>
      ) : null}

      {aspect !== undefined ? (
        <CoverPicker
          open={generating}
          onOpenChange={setGenerating}
          aspect={aspect}
          onChosen={(assetId: string) =>
            onChange({ from: 'asset', assetId, fit: 'cover', opacity: 1 })
          }
        />
      ) : null}

      {mode === 'color' && value !== null && value.from !== 'asset' ? (
        <ColorControl
          label="Page colour"
          allowGradient
          value={value satisfies ColorValue}
          onChange={onChange}
          palette={palette}
          token={token}
          disabled={disabled}
          hint="Behind every card, and in the gutters between them."
        />
      ) : null}

      {mode === 'image' && value !== null && value.from === 'asset' ? (
        <div className="flex flex-col gap-2">
          <Select
            label="How it fills the page"
            value={value.fit ?? 'cover'}
            disabled={disabled}
            options={[
              { value: 'cover', label: 'Fill the page, cropping the edges' },
              { value: 'contain', label: 'Fit inside, nothing is cut off' },
            ]}
            onChange={(event) =>
              onChange({ ...value, fit: event.target.value === 'contain' ? 'contain' : 'cover' })
            }
          />

          {/*
            **The control that keeps the page readable**, and the reason it is
            here rather than left to the owner's image editor. Two of the seeded
            offer cards have no ground element at all — they are designs, not
            fallbacks — so their product text sits straight on whatever is
            behind them. A photograph at full strength under those is an
            unreadable flyer, and knocking the image back is what a designer
            reaches for.
          */}
          <Slider
            label="Image strength"
            min={0.1}
            max={1}
            step={0.05}
            value={value.opacity ?? 1}
            disabled={disabled}
            onValueChange={(next) => onChange({ ...value, opacity: next })}
            hint="Fade it back so the cards stay readable."
          />

          {/*
            **Blur, and it is pixels rather than a filter.** E14 §2.4 measured
            what `feGaussianBlur` costs on the export path — Chromium rasterises
            the element at a resolution nothing in the document can set, about
            220dpi against a 300dpi target — so the picture is re-rendered
            blurred and stored, and the page draws an ordinary image.

            **It commits on release, not while dragging.** Every step would be a
            render, an upload and a write; `onCommit` is what the slider has for
            gestures whose result is expensive. The number moves under the
            thumb, the picture changes when the owner lets go.

            Hidden without `assetBaseUrl`, because there is nowhere to read the
            original from — see the prop's note.
          */}
          {assetBaseUrl === undefined ? null : (
            <Slider
              label="Blur"
              min={0}
              max={MAX_BLUR_RADIUS * 100}
              step={0.5}
              unit="%"
              value={blurPercent}
              disabled={disabled || blurring}
              onValueChange={setBlurPercent}
              // Release, not change: `onChange` fires per step and each one
              // would be a render, an upload and a write. Both events, because
              // a slider is a keyboard control as much as a pointer one.
              onPointerUp={() => void setBlur(blurPercent / 100)}
              onKeyUp={() => void setBlur(blurPercent / 100)}
              hint={
                blurring
                  ? 'Blurring the image…'
                  : 'Softens the photograph so the cards read against it.'
              }
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              loading={uploading}
              onClick={() => file.current?.click()}
            >
              <ImageIcon className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <Trash2 className="size-4" aria-hidden="true" strokeWidth={1.75} />
              Remove
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        Hidden, and driven by the buttons above. A bare file input cannot be
        styled to the system and says "No file chosen" in the browser's own
        words; the button is the control and this is the mechanism.
      */}
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          // Cleared so choosing the same file twice fires again — a `change`
          // event needs the value to differ, and re-picking a file the owner
          // just replaced is an ordinary thing to do.
          event.target.value = ''
          if (chosen !== undefined) void pick(chosen)
        }}
      />

      {error ? (
        <p className="font-ui text-body-sm text-critical-fg" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
