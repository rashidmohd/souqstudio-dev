'use client'

import type { BrandColor, FlatColor, Shadow, TokenRef } from '@souqstudio/types'
import { Input } from '@/components/ui/input'
import { ColorControl } from '@/components/card-designer/ColorControl'
import { readPercent, showPercent } from '@/lib/percent-field'

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
 * **There is no opacity here and that is a gap rather than a decision.**
 * `FlatColor` carries no alpha and the element's own `opacity` is the wrong
 * control, because it fades the element along with its shadow. `SHADOW_PEAK` in
 * the engine stands in until somebody decides whether a shop may set it.
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
          <div className="flex gap-2">
            {/* **Across and down, not left and right.** The app ships in
                Arabic; a shadow's offset is light direction and never mirrors
                — §5.5 — so the words have to describe the artboard rather than
                the reading order. */}
            <Input
              label="Across"
              type="number"
              min={OFFSET.min}
              max={OFFSET.max}
              step={0.1}
              figure
              disabled={disabled}
              value={showPercent(value.x)}
              onChange={(event) =>
                onChange({ ...value, x: readPercent(event.target.value, OFFSET, 0) })
              }
            />
            <Input
              label="Down"
              type="number"
              min={OFFSET.min}
              max={OFFSET.max}
              step={0.1}
              figure
              disabled={disabled}
              value={showPercent(value.y)}
              onChange={(event) =>
                onChange({ ...value, y: readPercent(event.target.value, OFFSET, 0) })
              }
            />
          </div>

          {allowBlur ? (
            <Input
              label="Softness"
              type="number"
              min={BLUR.min}
              max={BLUR.max}
              step={0.1}
              figure
              disabled={disabled}
              value={showPercent(value.blur)}
              hint="Zero is a hard edge. Percent of the card, like the offsets."
              onChange={(event) =>
                onChange({ ...value, blur: readPercent(event.target.value, BLUR, 0) })
              }
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
