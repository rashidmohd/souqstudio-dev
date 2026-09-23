'use client'

import type { BrandColor, Extrude, FlatColor, TokenRef } from '@souqstudio/types'
import { Slider } from '../ui/slider'
import { ColorControl } from './ColorControl'
import { showPercent } from '../../lib/percent-field'

/**
 * The side of the letters: a colour and a direction to push them in.
 *
 * **Three dimensions, drawn as copies rather than as light.** What an owner
 * wants when they ask for 3D text is a price with a solid side to it, and there
 * are two ways to draw one. A bevel — `feSpecularLighting`, real lighting maths
 * — rasterises the element and takes the font out of the PDF entirely: measured
 * at 762×203 px with zero text-drawing operators, which is the one disqualifying
 * class of result `harness/export-check.ts` exists to catch. A price that has
 * become a picture is unselectable, unsearchable, and resampled by any printer
 * that reprocesses it. So there is no bevel here and there should never be one.
 *
 * An extrusion is the other way, and it is both cheaper and printable: the
 * string repeated behind itself toward a vanishing point. Each copy is another
 * text run rather than outlined geometry, so it costs about a fifth of a
 * kilobyte — 4.7, 5.6, 6.4 and 8.1 kB at 0, 4, 8 and 16 copies, every one
 * vector and still text. The whole effect with a gradient face and an outline
 * measured 17.3 kB for one price.
 *
 * **How many copies is not a control and must not become one.** It is derived
 * at paint from the offset and the output scale, exactly as a shadow's ring
 * count is: how many it takes to read solid depends on the surface, and a stored
 * count is a price that looks right on screen and striped at 300 dpi.
 *
 * **The offsets are bounded much tighter than a shadow's**, because an extrusion
 * hangs outside the element's box and the fit ladder does not know about it yet.
 * A deep one on a tight cell would overhang its neighbour.
 *
 * Across and down, never start and end: this is a direction in the artboard, and
 * like a shadow's offset it does not mirror in an Arabic edition — §5.5.
 */
type Props = {
  value: Extrude | undefined
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  disabled?: boolean | undefined
  onChange: (extrude: Extrude | undefined) => void
}

/**
 * Percent of the card, and well inside the schema's own ±8%.
 *
 * Tighter than the shadow's ±10 for the overhang reason above, and because an
 * extrusion travelling further than about a glyph's width stops reading as depth
 * and starts reading as a second, blurred word.
 */
const OFFSET = { min: -6, max: 6 }

/** Down and to the end, which is where a retail price ticket puts its side. */
const DEFAULT: Omit<Extrude, 'color'> = { x: 0.006, y: 0.006 }

export function ExtrudeControl({ value, palette, token, disabled = false, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <ColorControl
        label="3D depth"
        value={value?.color}
        palette={palette}
        token={token}
        disabled={disabled}
        // Turning it off removes the extrusion rather than making it match the
        // face: copies nobody can see still cost a text run each on every
        // render. The same argument `ShadowControl` makes.
        onClear={() => onChange(undefined)}
        onChange={(color: FlatColor) => onChange({ ...(value ?? DEFAULT), color })}
        hint="The side of the letters. A darker version of the text colour reads as depth."
      />

      {value === undefined ? null : (
        <div className="flex flex-col gap-2">
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
            hint="Where the letters lean. Percent of the card, like the outline."
          />
        </div>
      )}
    </div>
  )
}
