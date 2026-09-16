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
}: Props) {
  const mode = modeOf(value)
  const [generating, setGenerating] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
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
