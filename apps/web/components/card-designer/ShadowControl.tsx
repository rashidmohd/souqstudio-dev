'use client'

import type { BrandColor, FlatColor, Shadow, TokenRef } from '@souqstudio/types'
import { SHADOW_PEAK } from '@souqstudio/engine'
import { Slider } from '@/components/ui/slider'
import { ColorControl } from '@/components/card-designer/ColorControl'
import { showPercent } from '@/lib/percent-field'

/**
 * A cast shadow: its colour, where it falls, and how soft it is.
 *
 * **Every value is a percent of the card**, like the border and the type size
 * beside it, because the stored numbers are fractions of the block's geometric
 * mean — which is what lets one block read the same at 1080 square and in an A4
 * column.
 *
 * **How it is drawn is not a control and must not become one.** A soft shadow
 * is n concentric vector copies of the shape at a constant alpha, and n is
 * derived at paint from the blur and the output scale — about 16 on screen and
 * about 48 at 300 dpi. Every filter Chromium offers instead rasterizes at a
 * resolution nothing in the document can set, and `filter: drop-shadow()` over
 * text takes the font out of the PDF entirely. E14 §2.4, and
 * `pnpm --filter @souqstudio/engine export:check` is the measurement.
 *
 * **Darkness is a control now, and closing that gap is what stops a shadow
 * being a glow.** It used to be fixed at `SHADOW_PEAK`, so the only way to
 * soften a shadow was to lighten its colour — and a pale shadow on a pale
 * ground reads as light coming *out* of the shape. A green card with a green
 * shadow is the case that showed it. `FlatColor` carries no alpha and the
 * element's own `opacity` fades the element with it, so it lives on `Shadow`.
 */
type Props = {
  value: Shadow | undefined
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  disabled?: boolean | undefined
  /**
   * Whether this element may have a *soft* shadow.
   *
   * **False on text, and it is measured rather than cautious.** A shape's ring
   * is one path; a glyph has no box to expand, so its ring is the string again
   * under a wider stroke — and Chromium outlines stroked text into explicit
   * path geometry on the way to a PDF. That is roughly 24 kB a ring: one softly
   * shadowed price came to 663 kB and 26,385 curve operators, where twenty-four
   * ringed bursts together came to 274 kB. So a price wears a hard shadow,
   * which is what a retail "SAVE 20%" actually wears, and the document schema
   * refuses any blur on text rather than clamping it.
   */
  allowBlur: boolean
  onChange: (shadow: Shadow | undefined) => void
}

/** Percent of the card. Well inside the schema's own ±50% and 0–25%. */
const OFFSET = { min: -10, max: 10 }
const BLUR = { min: 0, max: 10 }

/** What an owner gets when they switch one on: down and to the end, and soft. */
const DEFAULT: Omit<Shadow, 'color'> = { x: 0.004, y: 0.008, blur: 0.012 }

export function ShadowControl({
  value,
  palette,
  token,
  disabled = false,
  allowBlur,
  onChange,
}: Props) {
  /** A shadow with no blur, for the elements that may not have one. */
  const seed = allowBlur ? DEFAULT : { ...DEFAULT, blur: 0 }

  return (
    <div className="flex flex-col gap-2">
      <ColorControl
        label="Shadow"
        value={value?.color}
        palette={palette}
        token={token}
        disabled={disabled}
        // Turning it off removes the whole shadow rather than making it
        // transparent: a shadow nobody can see is one the next person has to
        // work out the meaning of, and it costs paths on every render.
        onClear={() => onChange(undefined)}
        onChange={(color: FlatColor) => onChange({ ...(value ?? seed), color })}
        {...(allowBlur
          ? {}
          : { hint: 'Text takes a hard shadow. A soft one cannot be printed at a sane file size.' })}
      />

      {value === undefined ? null : (
        <div className="flex flex-col gap-2">
          {/* **Across and down, not left and right.** The app ships in Arabic;
              a shadow's offset is light direction and never mirrors — §5.5 — so
              the words describe the artboard rather than the reading order.

              **Sliders rather than number boxes.** A shadow is judged by eye
              and nudged, which is a gesture a spinner is bad at: the shadow lab
              is three sliders and a swatch, and it is how these numbers were
              chosen in the first place. Each one carries its own value, so what
              is on screen can be reported and repeated on a second block. */}
          <Slider
            label="Across"
            min={OFFSET.min}
            max={OFFSET.max}
            step={0.1}
            unit="%"
            disabled={disabled}
            value={Number(showPercent(value.x))}
            onValueChange={(next) => onChange({ ...value, x: next / 100 })}
          />
          <Slider
            label="Down"
            min={OFFSET.min}
            max={OFFSET.max}
            step={0.1}
            unit="%"
            disabled={disabled}
            value={Number(showPercent(value.y))}
            onValueChange={(next) => onChange({ ...value, y: next / 100 })}
          />

          {allowBlur ? (
            <Slider
              label="Softness"
              min={BLUR.min}
              max={BLUR.max}
              step={0.1}
              unit="%"
              disabled={disabled}
              value={Number(showPercent(value.blur))}
              hint="Zero is a hard edge. Percent of the card, like the offsets."
              onValueChange={(next) => onChange({ ...value, blur: next / 100 })}
            />
          ) : null}

          {/* **Darkness, which had no control at all until now.**

              Without it the only way to soften a shadow was to lighten its
              colour — and a light shadow on a light ground is a *glow*: it
              reads as light coming out of the shape rather than falling behind
              it. That is what a mid-green shadow under a green card looks like,
              and the fix is a dark colour at low opacity rather than a pale one
              at full. */}
          <Slider
            label="Darkness"
            min={5}
            max={90}
            step={5}
            unit="%"
            disabled={disabled}
            value={Math.round((value.opacity ?? SHADOW_PEAK) * 100)}
            hint="A shadow is a dark colour turned down, never a pale one turned up."
            onValueChange={(next) => onChange({ ...value, opacity: next / 100 })}
          />
        </div>
      )}
    </div>
  )
}
