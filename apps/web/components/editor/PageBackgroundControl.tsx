'use client'

import * as React from 'react'
import { Image as ImageIcon, Trash2 } from 'lucide-react'
import type { BrandColor, ColorValue, PageBackground, TokenRef } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ColorControl } from '@/components/card-designer/ColorControl'
import { uploadArtwork } from '@/lib/upload-artwork'

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
}

type Mode = 'none' | 'color' | 'image'

/** What mode a stored background is in. */
function modeOf(value: PageBackground | null): Mode {
  if (value === null) return 'none'
  return value.from === 'asset' ? 'image' : 'color'
}

export function PageBackgroundControl({ value, onChange, palette, token, disabled }: Props) {
  const mode = modeOf(value)
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
