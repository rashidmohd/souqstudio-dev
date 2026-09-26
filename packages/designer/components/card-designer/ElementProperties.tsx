'use client'

import * as React from 'react'
import { AlignCenter, AlignLeft, AlignRight, Italic, Lock, Strikethrough } from 'lucide-react'
import type {
  BlockElement,
  BrandColor,
  CornerRadii,
  MarkCurrency,
  MarkCurrencyPlace,
  MarkPlace,
  MarkSatellite,
  ColorValue,
  PriceMark,
  PriceMarkPreset,
  PriceMarkRecipe,
  PriceMarkStyle,
  ShadowPreset,
  TextOverflow,
  TokenRef,
  TypeLevel,
} from '@souqstudio/types'
import {
  MARK_CURRENCY_GAP,
  MARK_CURRENCY_SCALE,
  MARK_MINOR_SCALE,
  MARK_NUDGE,
  MARK_SATELLITE_SCALE,
  TYPE_LEVELS,
} from '@souqstudio/types'
import {
  chipPathShape,
  layoutPriceMark,
  markGround,
  markRecipe,
  needsEvenOdd,
  POLYGON_SIDES,
  SHAPE_BOUNDS,
  PRICE_MARK_RECIPES,
  resolveColor,
  shapePath,
  type ChipShape,
  type MarkGround,
  type MarkPiece,
  type Rect,
  type ResolvedSatellite,
} from '@souqstudio/engine'
import { IMAGE_BINDINGS, TEXT_BINDINGS, bindingInScope, bindingKey, labelFor } from '@souqstudio/engine'
import type { OfferField } from '@souqstudio/engine'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { MachineOutput } from '../ui/machine-output'
import { Select } from '../ui/select'
import { ColorControl } from './ColorControl'
import { ExtrudeControl } from './ExtrudeControl'
import { StrokeControl } from './StrokeControl'
import { ShadowControl } from './ShadowControl'
import { ImageBlurControl } from './ImageBlurControl'
import { ShapeMark } from './ShapeMark'
import { SHAPE_VARIANTS, type PickableShape, type ShapeVariant } from '../../lib/block-elements'
import { Segmented, ToggleBar } from '../ui/segmented'
import { Slider } from '../ui/slider'
import { imagePadding } from '../blocks/draw'
import { describe } from './LayerList'
import { drawnSize, type Canvas } from '../../lib/drawn-size'
import { readPercent, showPercent } from '../../lib/percent-field'

/**
 * The properties panel. E7.
 *
 * **What an element *is* is decided here; where it sits is decided on the
 * canvas.** The box fields exist for the case direct manipulation is bad at —
 * "make these two exactly the same width" — and they are the same numbers the
 * drag writes, in percent because a fraction with four decimal places is not a
 * number anyone can type.
 *
 * Two rules the panel used to enforce by refusal, and now enforces by *shape*:
 *
 * - **Colour is a swatch first and a hex second.** Every element could once name
 *   only one of six slots, which is right for a block we ship and wrong for one
 *   the shop designed. See `ColorControl`.
 * - **Type snaps to the brand scale until the owner says otherwise.** A level is
 *   still what the fit ladder steps down, so a hand-set size degrades rather
 *   than overflows.
 *
 * The price mark used to be the exception and is not any more. **Its anatomy is
 * ours and its arrangement is theirs**: the raised fils landing on the cap line,
 * the three-decimal branch and LTR-in-Arabic are not negotiable and never will
 * be — but where the currency, the was-price and the tier tab *go* is design,
 * and locking those was the panel using E6 §3's argument past its reach. See
 * `PriceMarkFields`.
 */

type Props = {
  element: BlockElement | null
  repeats: boolean
  disabled: boolean
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  canvas: Canvas
  onChange: (element: BlockElement) => void
  /**
   * Where an `assetId` becomes a URL. The blur control on an uploaded image
   * re-renders from the unblurred original, so it needs somewhere to read it
   * from; omitted hides that one control and nothing else.
   */
  assetBaseUrl?: string | undefined
  /**
   * Take the selected price mark apart into layers.
   *
   * Supplied by the shell, because the split is computed against the artboard's
   * real size — a piece's position is a fraction of the block, and the solver
   * that knows where the pieces are works in the units the canvas draws in.
   */
  onSplit?: (() => void) | undefined
}

const LEVEL_LABEL: Record<TypeLevel, string> = {
  h1: 'Largest (h1)',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  body: 'Body',
  caption: 'Caption',
}

export function ElementProperties({
  element,
  repeats,
  disabled,
  palette,
  token,
  canvas,
  onChange,
  assetBaseUrl,
  onSplit,
}: Props) {
  if (element === null) {
    return (
      <p className="font-ui text-body-sm text-muted">
        Select something on the card to change it.
      </p>
    )
  }

  const color = { palette, token, disabled }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-subhead text-primary">{describe(element)}</h2>
        <p className="font-ui text-body-sm text-muted">{purpose(element)}</p>
      </div>

      {element.kind === 'text' ? (
        <TextFields
          element={element}
          repeats={repeats}
          disabled={disabled}
          color={color}
          onChange={onChange}
        />
      ) : null}

      {element.kind === 'shape' ? (
        <>
          {/*
            **No shape grid on an uploaded outline.** Every button in it writes
            a `variant`, and writing one over `art` swaps the owner's drawing
            for a rectangle with no way back — the element would still hold the
            outline, and nothing would draw it. The rest of the panel is
            unchanged, which is the point of an upload being a shape: fill,
            border, shadow, rotation and opacity all mean what they always mean.
          */}
          {element.variant === 'art' ? null : (
          <Field label="Shape">
            {/*
              **Ten in a 3×3 grid, and every mark is the shape itself.** A row
              of nine will not fit a 288px pane — the direction picker taught
              that the hard way — and an icon set has nothing that means "burst"
              other than a picture somebody drew of one, which would be a second
              drawing of a shape the engine already knows. `render` draws each
              option through `shapePath`, so the button and the card cannot
              disagree about what a tag looks like.
            */}
            <Segmented
              label="Shape"
              className="grid w-full grid-cols-3 rounded-control"
              disabled={disabled}
              value={element.variant ?? 'rect'}
              options={SHAPE_VARIANTS.map((option) => ({
                value: option.value,
                label: option.label,
                render: () => <ShapePreview variant={option.value} element={element} />,
              }))}
              onChange={(variant) => onChange({ ...element, variant })}
            />
          </Field>
          )}

          {/*
            **Only under the polygon, because it means nothing anywhere else.**
            A side count sitting permanently in the panel is a control an owner
            has to work out does not apply to the rectangle they have selected.

            A number field rather than a slider, which `Slider`'s own contract
            settles: it is for a bounded quantity an owner adjusts by eye, and
            explicitly not for a count. An owner reaching for this has a shape
            in mind and that shape has a number — "a hexagon" is six, and
            hunting for six on a ten-stop track is worse than typing it. It sits
            beside the corner radius, which is the same kind of control for the
            same reason.

            Turning it is the rotation control in Appearance, which every
            element already has — a triangle on its side is a rotated triangle,
            not an eleventh variant.
          */}
          {/*
            **Depth, as a slider, which is the split `Slider`'s own contract
            draws.** A side count is a count — an owner reaching for a hexagon
            has the number six in mind — and a curve is not: nobody wants "38%
            of the height", they want the sweep that looks right against the
            photograph above it. The result is the point, so the control is the
            one you drag while watching the card.

            It runs through zero to the negative side rather than pairing a
            depth with an up/down switch: an arch and the dish it becomes are
            one continuous adjustment, and a switch would make the owner find a
            second control to discover that.
          */}
          {element.variant === 'arch' || element.variant === 'wave' ? (
            <Slider
              label="Curve"
              min={Math.round(SHAPE_BOUNDS.curve.min * 100)}
              max={Math.round(SHAPE_BOUNDS.curve.max * 100)}
              step={1}
              unit="%"
              disabled={disabled}
              value={Math.round((element.curve ?? SHAPE_BOUNDS.curve.default) * 100)}
              hint="Below zero the curve turns the other way."
              onValueChange={(curve) => onChange({ ...element, curve: curve / 100 })}
            />
          ) : null}

          {element.variant === 'wave' ? (
            <Input
              label="Waves"
              type="number"
              min={SHAPE_BOUNDS.waves.min}
              max={SHAPE_BOUNDS.waves.max}
              step={1}
              figure
              disabled={disabled}
              value={element.waves ?? SHAPE_BOUNDS.waves.default}
              onChange={(event) =>
                onChange({
                  ...element,
                  waves: clamp(
                    Math.round(Number(event.target.value)),
                    SHAPE_BOUNDS.waves.min,
                    SHAPE_BOUNDS.waves.max
                  ),
                })
              }
            />
          ) : null}

          {/* Measured from the reading start, so it mirrors on its own in an
              Arabic edition — a bubble points at whoever is speaking, and that
              person is on the other side there. */}
          {element.variant === 'bubble' ? (
            <Slider
              label="Tail"
              min={0}
              max={100}
              step={1}
              unit="%"
              disabled={disabled}
              value={Math.round((element.tail ?? SHAPE_BOUNDS.tail.default) * 100)}
              hint="How far along the edge the tail sits, from the reading start."
              onValueChange={(tail) => onChange({ ...element, tail: tail / 100 })}
            />
          ) : null}

          {element.variant === 'polygon' ? (
            <Input
              label="Sides"
              type="number"
              min={POLYGON_SIDES.min}
              max={POLYGON_SIDES.max}
              step={1}
              figure
              disabled={disabled}
              value={element.sides ?? POLYGON_SIDES.default}
              hint="Three is a triangle, six a hexagon. Rotate it under Appearance."
              onChange={(event) =>
                onChange({
                  ...element,
                  sides: clamp(
                    Math.round(Number(event.target.value)),
                    POLYGON_SIDES.min,
                    POLYGON_SIDES.max
                  ),
                })
              }
            />
          ) : null}
          {/* **"None" is a real answer now**, and it is what makes an
              outline-only shape possible — a hairline rule box around a price,
              which used to be faked with one filled rectangle sitting on
              another. `opacity` cannot express it: it fades the border along
              with the fill. E14 §2.4. */}
          <ColorControl
            label="Fill"
            allowGradient
            value={element.fill}
            {...color}
            {...(element.variant === 'line'
              ? {}
              : { onClear: () => onChange({ ...element, fill: undefined }) })}
            onChange={(fill: ColorValue) => onChange({ ...element, fill })}
          />
          {/* A line has no interior — it draws its stroke along its own middle
              and the fill *is* the line — so a border on one is a second line
              nobody asked for. */}
          {element.variant === 'line' ? null : (
            <StrokeControl
              label="Border"
              value={element.stroke}
              {...color}
              hint="Turn the fill off for an outline on its own."
              onChange={(stroke) => onChange({ ...element, stroke })}
            />
          )}
          <ShadowControl
            value={element.shadow}
            {...color}
            allowBlur
            onChange={(shadow) => onChange({ ...element, shadow })}
          />
          {/*
            **Shown on the shapes that have corners, which is not "everything
            but the line".** It was, and on the other seven it was a control an
            owner could set to 40 and watch nothing happen — a burst computes
            its spikes, a tag computes its cut, and a circle has no corner to
            round. The polygon is the one that made that visible, because a
            rounded hexagon is a thing people expect and the number was right
            there promising it.

            So the number now does what it says on the polygon too — `regular`
            in the engine rounds its vertices to the same radius `rx` means on
            the rectangle, which is why one control can govern both — and it is
            absent on the shapes where it never could.
          */}
          {hasCorners(element.variant) ? (
            <CornerRadiusFields
              radius={element.radius}
              // Only a rectangle has four corners to name; see the component.
              corners={
                element.variant === undefined || element.variant === 'rect'
                  ? element.corners
                  : undefined
              }
              eachCorner={element.variant === undefined || element.variant === 'rect'}
              disabled={disabled}
              onChange={(next) => onChange({ ...element, ...next })}
            />
          ) : null}
        </>
      ) : null}

      {element.kind === 'image' ? (
        <>
          {/* **Images had no "Shows" control and text did.** So an owner who
              placed a logo could not tell what it was bound to, could not turn
              a product image into their mark, and had no way back if they
              picked the wrong one from the palette — the element was only ever
              what the palette made it. Same picker, same words, built from the
              same vocabulary. E14 §3.1 and §3.6. */}
          <Select
            label="Shows"
            disabled={disabled}
            value={bindingKey(element.source)}
            options={imageOptions(repeats, element.source)}
            onChange={(event) =>
              onChange({ ...element, source: parseImageSource(event.target.value, element.source) })
            }
          />
          <StrokeControl
            label="Border"
            value={element.stroke}
            {...color}
            onChange={(stroke) => onChange({ ...element, stroke })}
          />
          {/*
            **The product's own shadow, and it replaces the ring one.** Rings are
            grown from the element's rectangle, so on a cutout they draw the
            shadow of a rounded box; these are traced from the picture's alpha,
            rendered ahead of time and stored. E14 §2.4.

            Offered only on a product image, because that is the one source with
            a rendering pass behind it — an upload has none, and a logo belongs
            to whichever shop draws the block. The ring control below stays for
            those.
          */}
          {element.source.from === 'product' ? (
            <Select
              label="Product shadow"
              disabled={disabled}
              value={element.shadowPreset ?? 'none'}
              hint="Traced from the photo itself. It appears a moment after you pick it."
              options={[
                { value: 'none', label: 'No shadow' },
                { value: 'soft-drop', label: 'Soft drop' },
                { value: 'hard-drop', label: 'Hard drop' },
                { value: 'contact', label: 'Contact' },
                { value: 'grounded', label: 'Grounded' },
              ]}
              onChange={(event) => {
                const next = event.target.value
                if (next === 'none') {
                  const { shadowPreset: _cleared, ...rest } = element
                  onChange(rest)
                  return
                }
                onChange({ ...element, shadowPreset: next as ShadowPreset })
              }}
            />
          ) : null}
          <ShadowControl
            value={element.shadow}
            {...color}
            allowBlur
            onChange={(shadow) => onChange({ ...element, shadow })}
          />
          {/*
            **Blur, on an upload only.** The union is what says so: a product
            image is chosen from the catalog at render time and a logo belongs
            to whichever shop draws the block, so neither is a single file that
            could have been blurred in advance. Offering the control for them
            would be a slider that cannot do anything.

            Pixels rather than a filter, for the reason §2.4 measured — see
            `lib/blur-image.ts`. The painter draws an ordinary image and never
            learns a blur happened.
          */}
          {element.source.from === 'asset' && assetBaseUrl !== undefined ? (
            <ImageBlurControl
              source={element.source}
              assetBaseUrl={assetBaseUrl}
              disabled={disabled}
              onChange={(source) => onChange({ ...element, source })}
            />
          ) : null}
          <Select
          label="How it fills its box"
          disabled={disabled}
          value={element.fit ?? 'contain'}
          hint="A packshot fits inside. A background photo fills and crops."
          options={[
            { value: 'contain', label: 'Fit inside, nothing is cut off' },
            { value: 'cover', label: 'Fill the box, the edges crop' },
          ]}
          onChange={(event) =>
            onChange({ ...element, fit: event.target.value as 'contain' | 'cover' })
          }
          />
          {/*
            The gap between the box and the picture, which the dashed line on
            the canvas shows. Percent of the box's shorter edge, the unit the
            painter insets by, so the number and the line agree at any size.
          */}
          <Slider
            label="Padding"
            min={0}
            max={30}
            step={1}
            unit="%"
            disabled={disabled}
            value={Math.round(imagePadding(element) * 100)}
            hint="Space between the box and the picture. At 0% the picture reaches the edges."
            onValueChange={(padding) => onChange({ ...element, padding: padding / 100 })}
          />
        </>
      ) : null}

      {element.kind === 'chip' ? (
        <>
          <Select
            label="Position"
            disabled={disabled}
            value={element.anchor}
            hint="A corner badge may overhang the card by design."
            options={[
              { value: 'TOP_START', label: 'Top, reading-order start' },
              { value: 'TOP_END', label: 'Top, reading-order end' },
              { value: 'INLINE', label: 'Inline, inside the card' },
            ]}
            onChange={(event) =>
              onChange({ ...element, anchor: event.target.value as typeof element.anchor })
            }
          />
          {/*
            **Four shapes, not the nine a shape element gets.** A badge is a
            container for a word — see `ChipShape`. The marks are drawn through
            the same path function the badge itself uses, so the button and the
            card cannot disagree.
          */}
          <Segmented
            label="Badge shape"
            className="grid w-full grid-cols-5 rounded-control"
            disabled={disabled}
            value={element.shape ?? 'pill'}
            options={CHIP_SHAPE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              render: () => <ChipShapePreview shape={option.value} />,
            }))}
            onChange={(shape) => onChange({ ...element, shape })}
          />
          <ColorControl
            label="Badge colour"
            value={element.fill}
            fallback={token('accent')}
            hint="Left alone, it takes the promo tier's own colour."
            {...color}
            onChange={(fill) => onChange({ ...element, fill })}
          />
          <ColorControl
            label="Label colour"
            value={element.ink}
            fallback={token('surface')}
            hint="Left alone, it picks whichever of black or white reads on the badge."
            {...color}
            onChange={(ink) => onChange({ ...element, ink })}
          />
        </>
      ) : null}

      {element.kind === 'priceMark' ? (
        <PriceMarkFields
          element={element}
          disabled={disabled}
          color={color}
          onChange={onChange}
          {...(onSplit === undefined ? {} : { onSplit })}
        />
      ) : null}

      <Appearance element={element} disabled={disabled} onChange={onChange} />
      <BoxFields element={element} canvas={canvas} disabled={disabled} onChange={onChange} />
    </div>
  )
}

/**
 * A label above a control that is not an `Input` or a `Select`.
 *
 * Those two draw their own label, and a segmented control on its own would be a
 * row of buttons with no name — the panel reads as a list of decisions, and a
 * decision without a name is a puzzle.
 */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-label font-medium text-primary">{label}</span>
      {children}
      {hint === undefined ? null : (
        <p className="font-ui text-body-sm text-muted">{hint}</p>
      )}
    </div>
  )
}

type ColorProps = {
  palette: readonly BrandColor[]
  token: (ref: TokenRef) => string
  disabled: boolean
}

/**
 * A named run of controls inside one element's panel.
 *
 * **Local, and not a new entry in the component inventory.** It is a heading and
 * a hairline over a column — the panel's own `Field` is the same kind of thing —
 * and the inventory exists to stop two sessions producing two APIs for a shared
 * component, not to adjudicate a `<div>`. If a second panel needs it, it moves
 * and gets an entry then.
 *
 * It earns its place because the mark now carries nine colour slots. Nine
 * unlabelled swatches in a column is a list nobody reads; nine under "Colour
 * each part", after the three that most owners will actually touch, is a group
 * they can skip.
 */
function Group({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-ui text-label font-medium text-primary">{label}</h3>
        {hint === undefined ? null : (
          <p className="font-ui text-body-sm text-muted">{hint}</p>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * One orbiting part of the price mark: where it sits, how big it is, how far it
 * is nudged off the compass point.
 *
 * **One component for three parts, because the was-price, the FROM line and the
 * tier badge are the same kind of thing to the engine** — `ResolvedSatellite`,
 * with a place, a scale and a nudge. Three hand-written copies is how the
 * badge quietly ends up with a control the was-price does not have.
 *
 * **The nudge is in percent of the big number, not pixels.** That is the unit
 * the engine stores, and it is the one that survives the fit ladder: the mark
 * shrinks as one thing, so an offset measured against the price itself means
 * the same on a hero card and a dense one. A pixel offset would not, and is
 * also a number nobody can pick by eye — which is what `Slider` is for and
 * `Input` is not.
 */
function PartFields({
  label,
  part,
  hint,
  style,
  resolved,
  disabled,
  setRecipe,
}: {
  label: string
  part: 'compare' | 'prefix' | 'tier'
  hint?: string
  style: PriceMarkStyle
  resolved: ResolvedSatellite
  disabled: boolean
  setRecipe: (patch: Partial<PriceMarkRecipe>) => void
}) {
  // A partial over a partial, the same rule the preset follows: setting the
  // scale must not clear a place the owner chose two controls ago.
  const patch = (next: Partial<MarkSatellite>) =>
    setRecipe({ [part]: { ...(style.recipe?.[part] ?? {}), ...next } })

  const hidden = resolved.place === 'hidden'

  return (
    <Group label={label} {...(hint === undefined ? {} : { hint })}>
      <Select
        label="Position"
        disabled={disabled}
        value={resolved.place}
        options={PLACE_OPTIONS}
        onChange={(event) => patch({ place: event.target.value as MarkPlace })}
      />
      {/*
        Hidden is a position, and a size and a nudge for something that is not
        drawn are two controls that do nothing — which is worse than two
        controls that are absent.
      */}
      {hidden ? null : (
        <>
          <Slider
            label="Size"
            unit="%"
            hint="Against the big number. Nothing here may rival the price. That ceiling is ours."
            disabled={disabled}
            min={Math.round(MARK_SATELLITE_SCALE.min * 100)}
            max={Math.round(MARK_SATELLITE_SCALE.max * 100)}
            step={1}
            value={Math.round(resolved.scale * 100)}
            onValueChange={(next) => patch({ scale: next / 100 })}
          />
          <Slider
            label="Nudge across"
            unit="%"
            disabled={disabled}
            min={Math.round(MARK_NUDGE.min * 100)}
            max={Math.round(MARK_NUDGE.max * 100)}
            step={1}
            value={Math.round(resolved.dx * 100)}
            onValueChange={(next) => patch({ dx: next / 100 })}
          />
          <Slider
            label="Nudge down"
            unit="%"
            disabled={disabled}
            min={Math.round(MARK_NUDGE.min * 100)}
            max={Math.round(MARK_NUDGE.max * 100)}
            step={1}
            value={Math.round(resolved.dy * 100)}
            onValueChange={(next) => patch({ dy: next / 100 })}
          />
        </>
      )}
    </Group>
  )
}

/**
 * The price mark, opened as far as it goes.
 *
 * **The anatomy is ours and the arrangement is theirs.** E6 §3's rule — a price
 * is never assembled from text layers — still holds and always will: cap
 * alignment, the three-decimal KWD/OMR/BHD branch, LTR-in-Arabic and a mark that
 * shrinks as one thing cannot survive being cut into free boxes.
 *
 * **That argument only ever defended the anatomy, and this panel was using it to
 * defend the arrangement too.** Before this, an owner could choose two frames
 * and three colours; where the currency sat, where the was-price sat, where the
 * tab attached and how the cluster aligned were not theirs to decide, which
 * meant the product could make exactly one price design. Six of the eight
 * grounds the engine had shipped were not even reachable from here.
 *
 * So the gallery is the front door: eight marks we drew, each thumbnail laid out
 * by `layoutPriceMark` itself, so the button and the card cannot disagree about
 * what a shelf ticket looks like. The knobs below it refine one; every one of
 * them is a closed list or a clamped number, and `markRecipe` applies the bounds
 * again on the way to the canvas.
 */
function PriceMarkFields({
  element,
  disabled,
  color,
  onChange,
  onSplit,
}: {
  element: Extract<BlockElement, { kind: 'priceMark' }>
  disabled: boolean
  color: ColorProps
  onChange: (element: BlockElement) => void
  /** Absent when the caller cannot say how big the artboard is. */
  onSplit?: (() => void) | undefined
}) {
  const style = element.style ?? {}
  const set = (patch: Partial<typeof style>) =>
    onChange({ ...element, style: { ...style, ...patch } })
  // A partial over a partial: the preset keeps applying to every field the owner
  // has not spoken about. All-or-nothing would make moving the was-price a
  // re-authoring of the whole mark.
  const setRecipe = (patch: Partial<PriceMarkRecipe>) =>
    set({ recipe: { ...(style.recipe ?? {}), ...patch } })

  /**
   * Merge into the currency, whichever shape the document holds it in.
   *
   * A block written before the code had a size carries a bare placement string,
   * and spreading a string gives an object of numbered characters — so it is
   * normalised to `{ place }` first. Every seeded block is in that older shape,
   * which makes this the common path rather than the edge case.
   */
  const patchCurrency = (patch: Partial<MarkCurrency>) => {
    const held = style.recipe?.currency
    const base: MarkCurrency = typeof held === 'string' ? { place: held } : (held ?? {})
    setRecipe({ currency: { ...base, ...patch } })
  }

  const recipe = markRecipe(style)

  /**
   * What each narrow slot falls back to, resolved for the swatch only.
   *
   * **The painter is the authority and this mirrors it**, which is a duplication
   * worth naming: `draw.tsx` resolves narrow → broad → the old hard-coded token,
   * and a swatch showing anything else would be a control that lies about what
   * it is changing. The alternative — exporting the resolution from the painter
   * — would pull a client component's colour context into the panel for three
   * strings. If the painter's chain changes, this changes with it.
   *
   * The tier's own colour is not reachable here: `tint` falls back to it on the
   * card and the panel has no offer, so `accent` stands in — the same stand-in
   * the tint control above already used.
   */
  const broad = {
    tint: style.tint === undefined ? color.token('accent') : resolveColor(style.tint, color.token, color.palette),
    ink: style.ink === undefined ? color.token('ink') : resolveColor(style.ink, color.token, color.palette),
    surface:
      style.groundFill !== undefined
        ? resolveColor(style.groundFill, color.token, color.palette)
        : style.surface === undefined
          ? color.token('surface')
          : resolveColor(style.surface, color.token, color.palette),
    muted: color.token('inkMuted'),
  }

  /**
   * The badge label drawn in the badge's own colour.
   *
   * **The default that produces it is kept, and this is why it is safe to
   * keep.** A tab's label reads in the ground colour, which is right for a
   * saturated badge on a pale ground and invisible once an owner tints both —
   * and changing the default would redraw every block already published. So the
   * case is detected and named instead, next to the control that fixes it.
   */
  const tabFillResolved =
    style.tabFill !== undefined
      ? resolveColor(style.tabFill, color.token, color.palette)
      : broad.tint
  const tabInkResolved =
    style.tabInk !== undefined
      ? resolveColor(style.tabInk, color.token, color.palette)
      : broad.surface
  const tabClash = tabFillResolved.toLowerCase() === tabInkResolved.toLowerCase()

  return (
    <>
      {/*
        **The gallery, and it is the front door rather than an advanced option.**
        Same argument the seeded block library makes: a blank artboard produces
        something worse than our default and the owner blames the product. Most
        owners pick one of these and never open a knob.

        Two columns rather than four — the difference between a shelf ticket and
        a stacked mark is an *arrangement*, and an arrangement is unreadable at
        icon size. This is the most consequential decision on the element and it
        gets the room.
      */}
      <Field
        label="Mark style"
        hint="How the price is put together. Every one of them reads the same way."
      >
        <Segmented
          label="Mark style"
          className="grid w-full grid-cols-2 rounded-control"
          disabled={disabled}
          value={style.preset ?? 'classic-tag'}
          options={PRESET_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            render: () => <MarkPreview preset={option.value} />,
          }))}
          onChange={(preset) => set({ preset })}
        />
      </Field>

      {/*
        **Eight grounds, and six of them had no control here at all.** The engine
        has drawn them since the shape kit reached the mark; the panel still
        offered the two-option `frame` it shipped with, so the library worked
        around it by hand-placing a disc behind the price. Drawn through the same
        path function the card uses.
      */}
      {/*
        **The one click that hands the parts over.**

        The bindings to place a currency or a was-price by hand landed before
        this did, and on their own they asked an owner to add a text element,
        find the right source in a dropdown, switch the matching part off inside
        the mark, and position it back where it already was. That is not a
        feature, it is a procedure. This does all four and puts the pieces
        exactly where they already were.

        It is offered rather than automatic, and there is no button back: the
        mark is still the quicker way to set a price and most owners will never
        press this. Undo is what reverses it.
      */}
      {onSplit === undefined ? null : (
        <Field
          label="Separate parts"
          hint="Puts the currency and the was-price on their own layers, where they are, grouped with the price. The digits stay together."
        >
          <Button type="button" variant="secondary" disabled={disabled} onClick={onSplit}>
            Split into layers
          </Button>
        </Field>
      )}

      <Field label="Ground" hint="The shape behind the digits.">
        <Segmented
          label="Ground"
          className="grid w-full grid-cols-4 rounded-control"
          disabled={disabled}
          value={markGround(style)}
          options={GROUND_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            render: () => <GroundPreview ground={option.value} />,
          }))}
          onChange={(ground) => set({ ground })}
        />
      </Field>

      {/*
        **Three colours, then seven.** The broad slots stay first and stay the
        quick path — most owners set the badge colour and stop. What follows is
        the same mark with each part addressable, and it is here because three
        slots were painting seven parts: the currency, the was-price and the
        FROM line were welded to the muted ink in the painter and no price at
        all would change them.

        Every narrow slot falls back to the broad one it used to read, which is
        why opening this group on an existing block shows it exactly as drawn.
      */}
      <ColorControl
        label="Tag and badge colour"
        value={style.tint}
        fallback={color.token('accent')}
        hint="Left alone, it takes the promo tier's colour."
        {...color}
        onChange={(tint) => set({ tint })}
      />
      <ColorControl
        label="Number colour"
        value={style.ink}
        fallback={color.token('ink')}
        {...color}
        onChange={(ink) => set({ ink })}
      />
      <ColorControl
        label="Behind the numbers"
        value={style.surface}
        fallback={color.token('surface')}
        {...color}
        onChange={(surface) => set({ surface })}
      />

      <Group
        label="Colour each part"
        hint="Left alone, each one follows the three above, which is how this mark is drawn today."
      >
        <ColorControl
          label="Big number"
          value={style.majorInk}
          fallback={broad.ink}
          {...color}
          onChange={(majorInk) => set({ majorInk })}
        />
        <ColorControl
          label="Fils"
          value={style.minorInk}
          fallback={broad.ink}
          hint="Setting the fils back a step is the oldest trick on a shelf ticket."
          {...color}
          onChange={(minorInk) => set({ minorInk })}
        />
        <ColorControl
          label="Currency"
          value={style.currencyInk}
          fallback={broad.muted}
          {...color}
          onChange={(currencyInk) => set({ currencyInk })}
        />
        <ColorControl
          label="Was-price"
          value={style.compareInk}
          fallback={broad.muted}
          {...color}
          onChange={(compareInk) => set({ compareInk })}
        />
        <ColorControl
          label="From / each / per kg"
          value={style.prefixInk}
          fallback={broad.muted}
          {...color}
          onChange={(prefixInk) => set({ prefixInk })}
        />
        <ColorControl
          label="Ground fill"
          value={style.groundFill}
          fallback={broad.surface}
          {...color}
          onChange={(groundFill) => set({ groundFill })}
        />
        <ColorControl
          label="Ground outline"
          value={style.groundStroke}
          fallback={broad.tint}
          {...color}
          onChange={(groundStroke) => set({ groundStroke })}
        />
        <ColorControl
          label="Badge fill"
          value={style.tabFill}
          fallback={broad.tint}
          {...color}
          onChange={(tabFill) => set({ tabFill })}
        />
        <ColorControl
          label="Badge label"
          value={style.tabInk}
          fallback={broad.surface}
          {...(tabClash ? { hint: 'This reads the same colour as the badge behind it, so the label will not show.' } : {})}
          {...color}
          onChange={(tabInk) => set({ tabInk })}
        />
      </Group>

      {/*
        The knobs. Each one is a closed list, so the mark cannot leave the
        vocabulary however they are combined — and `markRecipe` clamps the two
        numeric ones again before the canvas sees them.
      */}
      {/*
        **The currency, as a part rather than only a position.** Its size was
        `CURRENCY_RATIO`, its gap to the digits was `GAP_RATIO`, and how it sat
        against them was implied by whether the place had `super-` in front of
        it — three constants in the engine, none of them reachable. A small
        riyal set tight against a large number and centred on it is the
        commonest shelf treatment in this market and could not be built at any
        setting.

        Its colour is in the group above, with the other six.
      */}
      <Group label="Currency">
        <Select
          label="Where it goes"
          disabled={disabled}
          value={recipe.currency.place}
          options={[
            { value: 'before', label: 'Before the price' },
            { value: 'after', label: 'After the price' },
            { value: 'super-before', label: 'Small, leading' },
            { value: 'super-after', label: 'Small, trailing' },
            { value: 'above', label: 'Above the price' },
            { value: 'below', label: 'Below the price' },
            { value: 'hidden', label: 'Somewhere else, I’ll place it' },
          ]}
          onChange={(event) => patchCurrency({ place: event.target.value as MarkCurrencyPlace })}
          {...(recipe.currency.place === 'hidden'
            ? {
                hint: 'Add a text layer bound to the currency and put it where you like.',
              }
            : {})}
        />

        {recipe.currency.place === 'hidden' ? null : (
          <>
            <Slider
              label="Size"
              unit="%"
              hint="Against the big number."
              disabled={disabled}
              min={Math.round(MARK_CURRENCY_SCALE.min * 100)}
              max={Math.round(MARK_CURRENCY_SCALE.max * 100)}
              step={1}
              value={Math.round(recipe.currency.scale * 100)}
              onValueChange={(next) => patchCurrency({ scale: next / 100 })}
            />

            {/*
              A code on its own line is separated by the strip it sits in, and
              sits across the price rather than beside it — so neither the gap
              nor the vertical alignment has anything to act on. Two controls
              that do nothing are worse than two that are absent.
            */}
            {recipe.currency.place === 'above' || recipe.currency.place === 'below' ? null : (
              <>
                <Slider
                  label="Gap to the price"
                  unit="%"
                  hint="Zero sets it tight against the digits, which is a real treatment."
                  disabled={disabled}
                  min={Math.round(MARK_CURRENCY_GAP.min * 100)}
                  max={Math.round(MARK_CURRENCY_GAP.max * 100)}
                  step={1}
                  value={Math.round(recipe.currency.gap * 100)}
                  onValueChange={(next) => patchCurrency({ gap: next / 100 })}
                />

                <Field label="Sits against the price">
                  <Segmented
                    label="Sits against the price"
                    className="grid w-full grid-cols-3 rounded-control"
                    disabled={disabled}
                    value={recipe.currency.align}
                    options={[
                      { value: 'top', label: 'Top' },
                      { value: 'middle', label: 'Middle' },
                      { value: 'baseline', label: 'Bottom' },
                    ]}
                    onChange={(align) =>
                      patchCurrency({ align: align as 'top' | 'middle' | 'baseline' })
                    }
                  />
                </Field>
              </>
            )}
          </>
        )}
      </Group>
      <Select
        label="Fils"
        disabled={disabled}
        hint="Raised fils sit on the cap line of the big number. That part is ours."
        value={recipe.minor}
        options={[
          { value: 'raised', label: 'Raised' },
          { value: 'baseline', label: 'On the line, with a point' },
          { value: 'hidden', label: 'Whole numbers only' },
        ]}
        onChange={(event) => setRecipe({ minor: event.target.value as PriceMarkRecipe['minor'] })}
      />
      {/*
        **Typed and clamped since recipes shipped, and never once offered.** The
        fils could be moved onto the baseline and hidden altogether but not
        sized, which left the commonest shelf treatment of all — small fils
        against a large price — reachable only by picking a different preset.
      */}
      {recipe.minor === 'hidden' ? null : (
        <Slider
          label="Fils size"
          unit="%"
          hint="Against the big number. 100% sets the whole price at one size, which is a real treatment."
          disabled={disabled}
          min={Math.round(MARK_MINOR_SCALE.min * 100)}
          max={Math.round(MARK_MINOR_SCALE.max * 100)}
          step={1}
          value={Math.round(recipe.minorScale * 100)}
          onValueChange={(next) => setRecipe({ minorScale: next / 100 })}
        />
      )}

      {/*
        **One group per part, and each says where, how big and how far off.**
        The compass alone said which corner and could not say how far into it,
        which is the gap an owner hits the moment the ground is a burst rather
        than a box — the point that reads as a corner on a rectangle is a spike
        on a circle. `scale` was typed and clamped from the day recipes shipped
        and had no control at all.

        Every one of the three is a closed list or a clamped number, and
        `markRecipe` applies the bounds again on the way to the canvas.
      */}
      <PartFields
        label="Was-price"
        part="compare"
        style={style}
        resolved={recipe.compare}
        disabled={disabled}
        setRecipe={setRecipe}
      />
      <PartFields
        label="From / each / per kg"
        part="prefix"
        style={style}
        resolved={recipe.prefix}
        disabled={disabled}
        setRecipe={setRecipe}
      />
      <PartFields
        label="Tier badge"
        part="tier"
        hint="The little tab reading “HALF PRICE”. Nudge it as far as you like, it stays joined to the price."
        style={style}
        resolved={recipe.tier}
        disabled={disabled}
        setRecipe={setRecipe}
      />
      <Field label="Sits">
        <Segmented
          label="Sits"
          className="grid w-full grid-cols-3 rounded-control"
          disabled={disabled}
          value={recipe.align.inline}
          options={[
            { value: 'start', label: 'Start', icon: AlignLeft },
            { value: 'center', label: 'Centre', icon: AlignCenter },
            { value: 'end', label: 'End', icon: AlignRight },
          ]}
          onChange={(inline) => setRecipe({ align: { ...recipe.align, inline } })}
        />
      </Field>

      {/*
        **The other half of `align`, which the recipe has always carried.** The
        panel offered the inline axis alone, so a price could be set flush to
        the start of a wide band and not to the top of a tall one — and a tall
        mark is what every stacked arrangement is.
      */}
      <Field label="Sits vertically">
        <Segmented
          label="Sits vertically"
          className="grid w-full grid-cols-3 rounded-control"
          disabled={disabled}
          value={recipe.align.block}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'middle', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' },
          ]}
          onChange={(block) => setRecipe({ align: { ...recipe.align, block } })}
        />
      </Field>

      <p className="flex items-start gap-2 rounded-control bg-sand-tint p-3 font-ui text-body-sm text-secondary">
        <Lock className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>
          Every part’s colour, size and position is yours. How the number is
          set stays ours, raised fils land on the cap line, fils for Kuwait and
          Bahrain get three digits, the price reads left to right in Arabic, the
          badge stays joined to the price however far you nudge it, and nothing
          in the mark grows to rival the price itself. Arrange it any way you
          like and it still reads as a price.
        </span>
      </p>
    </>
  )
}

/**
 * The eight marks, named for what a shop would call them rather than for what
 * they do to the geometry.
 */
const PRESET_OPTIONS: { value: PriceMarkPreset; label: string }[] = [
  { value: 'classic-tag', label: 'Classic' },
  { value: 'shelf-ticket', label: 'Shelf ticket' },
  { value: 'price-bomb', label: 'Price bomb' },
  { value: 'was-now-stack', label: 'Was and now' },
  { value: 'super-riyal', label: 'Small code' },
  { value: 'wide-band', label: 'One line' },
  { value: 'stacked-currency', label: 'Stacked' },
  { value: 'whole-number', label: 'Whole numbers' },
]

/**
 * One preset, drawn at thumbnail size by the function that draws it on the card.
 *
 * **The same rule the shape picker follows** — a second drawing of an
 * arrangement the engine already knows how to lay out is how the button and the
 * card start disagreeing. The sample price is real and carries a was-price and a
 * FROM line, because a preset's whole difference is *where those go*.
 */
const MARK_SAMPLE: PriceMark = {
  tierId: 'preview',
  major: '24',
  minor: '50',
  currency: 'AED',
  currencyPlacement: 'PREFIX',
  shape: 'TAG',
  comparePrice: '32.00',
  prefixLabel: 'FROM',
}

function MarkPreview({ preset }: { preset: PriceMarkPreset }) {
  const l = layoutPriceMark(MARK_SAMPLE, { x: 2, y: 2, width: 60, height: 32 }, {
    ground: 'none',
    recipe: PRICE_MARK_RECIPES[preset],
  })

  const piece = (p: MarkPiece | null, opacity: number, strike = false) =>
    p === null ? null : (
      <text
        x={p.x}
        y={p.baseline}
        fontSize={p.fontSize}
        fill="currentColor"
        opacity={opacity}
        direction="ltr"
        {...(strike ? { textDecoration: 'line-through' as const } : {})}
      >
        {p.text}
      </text>
    )

  /**
   * **48×27 rendered, 64×36 laid out.** The segment is `h-control` — 32px, and
   * 44px on a coarse pointer — so a 36px mark overflows the button it sits in
   * on every desktop. The viewBox keeps the layout arithmetic in comfortable
   * units and the attributes scale it to something that fits; changing the box
   * instead would have shrunk the type below the size the arrangement reads at.
   */
  return (
    <svg width={48} height={27} viewBox="0 0 64 36" aria-hidden="true">
      {piece(l.currency, 0.6)}
      {piece(l.major, 1)}
      {piece(l.minor, 1)}
      {piece(l.compare, 0.5, true)}
      {piece(l.prefix, 0.5)}
    </svg>
  )
}

const GROUND_OPTIONS: { value: MarkGround; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'box', label: 'Rounded box' },
  { value: 'burst', label: 'Burst' },
  { value: 'star', label: 'Star' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'tag', label: 'Tag' },
  { value: 'flash', label: 'Corner flash' },
  { value: 'arrow', label: 'Arrow' },
]

/** A ground at button size, drawn by the function the mark itself uses. */
function GroundPreview({ ground }: { ground: MarkGround }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      {ground === 'none' ? (
        // Digits with nothing behind them, which is the whole difference
        // between this option and the box beside it.
        <rect x={2} y={6} width={12} height={4} rx={1} fill="currentColor" />
      ) : ground === 'box' ? (
        <rect x={1} y={3} width={14} height={10} rx={2} fill="currentColor" />
      ) : (
        <path
          d={shapePath(ground, PREVIEW)}
          fill="currentColor"
          {...(needsEvenOdd(ground) ? { fillRule: 'evenodd' as const } : {})}
        />
      )}
    </svg>
  )
}

/**
 * The compass, in the shop's words.
 *
 * Nine positions rather than two numbers, and that is the bound that matters: an
 * owner picks between places we drew, so a satellite cannot end up half off the
 * ground at an aspect they never previewed.
 */
const PLACE_OPTIONS: { value: MarkPlace; label: string }[] = [
  { value: 'above-start', label: 'Above, at the start' },
  { value: 'above', label: 'Above, centred' },
  { value: 'above-end', label: 'Above, at the end' },
  { value: 'start', label: 'Beside, at the start' },
  { value: 'end', label: 'Beside, at the end' },
  { value: 'below-start', label: 'Below, at the start' },
  { value: 'below', label: 'Below, centred' },
  { value: 'below-end', label: 'Below, at the end' },
  { value: 'hidden', label: 'Hidden' },
]


/**
 * The box every shape mark in this panel is drawn in.
 *
 * Deliberately wider than it is tall: a ribbon and an arrow are length-shaped
 * things and a square preview of one reads as a blob, while a burst and a star
 * hold their proportion and centre themselves in it anyway — which is the
 * behaviour being previewed as much as the outline is.
 */
const PREVIEW: Rect = { x: 1, y: 3, width: 14, height: 10 }

/**
 * The corner radius: one number for all four corners, or one for each.
 *
 * **Each corner is offered where there are four of them** — a rectangle and a
 * text's ground. A polygon's corners are its vertices, as many as it has
 * sides, and a bubble's are its body's with a tail cut into one edge; four
 * named corners mean nothing on either, so they keep the single number.
 *
 * **Linked is the default and the stored shape of the choice**: `corners`
 * absent is "all corners", and switching back drops it. Switching back keeps
 * the largest corner rather than the first, because a card with one rounded
 * corner that loses it on a toggle reads as the toggle breaking something.
 */
function CornerRadiusFields({
  radius,
  corners,
  eachCorner,
  disabled,
  onChange,
}: {
  radius: number
  corners: CornerRadii | undefined
  /** False on the shapes whose corners are not a box's four. */
  eachCorner: boolean
  disabled: boolean
  onChange: (next: { radius: number; corners: CornerRadii | undefined }) => void
}) {
  const single = (
    <Input
      label="Corner radius"
      type="number"
      min={0}
      max={64}
      step={1}
      figure
      disabled={disabled}
      value={radius}
      onChange={(event) =>
        onChange({ radius: clamp(Number(event.target.value), 0, 64), corners })
      }
    />
  )
  if (!eachCorner) return single

  const linked = (): void => {
    if (corners === undefined) return
    onChange({
      corners: undefined,
      radius: Math.max(corners.topStart, corners.topEnd, corners.bottomEnd, corners.bottomStart),
    })
  }
  const each = (): void => {
    if (corners !== undefined) return
    const r = radius
    onChange({ radius, corners: { topStart: r, topEnd: r, bottomEnd: r, bottomStart: r } })
  }
  const setCorner = (key: keyof CornerRadii, value: number): void => {
    if (corners === undefined) return
    onChange({ radius, corners: { ...corners, [key]: clamp(value, 0, 64) } })
  }

  // Reading order in a two-by-two grid, so the chrome's own direction puts
  // each field over the corner it rounds.
  const fields: { key: keyof CornerRadii; label: string }[] = [
    { key: 'topStart', label: 'Top start' },
    { key: 'topEnd', label: 'Top end' },
    { key: 'bottomStart', label: 'Bottom start' },
    { key: 'bottomEnd', label: 'Bottom end' },
  ]

  return (
    <Field
      label="Corners"
      {...(corners === undefined
        ? {}
        : { hint: 'Start and end follow the language, so Arabic mirrors on its own.' })}
    >
      <Segmented
        label="Corners"
        disabled={disabled}
        value={corners === undefined ? 'all' : 'each'}
        options={[
          { value: 'all', label: 'All corners' },
          { value: 'each', label: 'Each corner' },
        ]}
        onChange={(mode) => (mode === 'all' ? linked() : each())}
      />
      {corners === undefined ? (
        single
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <Input
              key={field.key}
              label={field.label}
              type="number"
              min={0}
              max={64}
              step={1}
              figure
              disabled={disabled}
              value={corners[field.key]}
              onChange={(event) => setCorner(field.key, Number(event.target.value))}
            />
          ))}
        </div>
      )}
    </Field>
  )
}

/**
 * A ground behind the words: its colour, how big it is, its padding, its corners.
 *
 * **"None" removes the whole ground**, the way a border's does, rather than
 * leaving a padding and a radius attached to nothing.
 *
 * It starts at the box and a small padding: the box is what the owner is
 * looking at when they pick the colour, so the colour lands where they expect
 * it, and "Fit to text" is one tap away for a label that should hug its words.
 */
function TextBackgroundFields({
  element,
  disabled,
  color,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  disabled: boolean
  color: ColorProps
  onChange: (element: BlockElement) => void
}) {
  const background = element.background
  return (
    <div className="flex flex-col gap-2">
      <ColorControl
        label="Background"
        allowGradient
        value={background?.fill}
        {...color}
        hint="A colour behind the words. The text colour follows it so it stays readable."
        onClear={() => onChange({ ...element, background: undefined })}
        onChange={(fill: ColorValue) =>
          onChange({
            ...element,
            background:
              background === undefined
                ? { fill, padding: BACKGROUND_PADDING.default, radius: 3 }
                : { ...background, fill },
          })
        }
      />

      {background === undefined ? null : (
        <>
          <Field
            label="Background size"
            hint={
              background.fit === 'text'
                ? 'Grows and shrinks with the words, so a long name gets a longer label.'
                : 'Fills the box you drew.'
            }
          >
            <Segmented
              label="Background size"
              disabled={disabled}
              value={background.fit ?? 'box'}
              options={[
                { value: 'box', label: 'Fill the box' },
                { value: 'text', label: 'Fit to text' },
              ]}
              onChange={(fit) => onChange({ ...element, background: { ...background, fit } })}
            />
          </Field>
          <Input
            label="Padding"
            type="number"
            min={BACKGROUND_PADDING.min}
            max={BACKGROUND_PADDING.max}
            step={0.5}
            figure
            disabled={disabled}
            value={showPercent(background.padding)}
            hint="Percent of the card, on every side."
            onChange={(event) =>
              onChange({
                ...element,
                background: {
                  ...background,
                  padding: readPercent(event.target.value, BACKGROUND_PADDING),
                },
              })
            }
          />
          <CornerRadiusFields
            radius={background.radius}
            corners={background.corners}
            eachCorner
            disabled={disabled}
            onChange={(next) =>
              onChange({ ...element, background: { ...background, ...next } })
            }
          />
        </>
      )}
    </div>
  )
}

/**
 * A ground's padding as the percent the field shows. The ceiling is well inside
 * the schema's quarter, because past a tenth the words are lost in the label.
 */
const BACKGROUND_PADDING = { min: 0, max: 10, default: 0.02 }

/**
 * Whether a corner radius means anything on this shape.
 *
 * Absent is a rectangle — the schema's own default — so it answers with the
 * rectangle. Everything else computes its own outline and takes no radius.
 */
const hasCorners = (variant: ShapeVariant | undefined): boolean =>
  variant === undefined ||
  variant === 'rect' ||
  variant === 'polygon' ||
  variant === 'bubble'

/**
 * One shape at button size, drawn by the shared mark.
 *
 * **Each button draws the element's own settings**, so the picker stops being a
 * picture of a hexagon on an element that is a triangle — and switching between
 * the arch and the wave keeps the curve the owner already dialled in rather than
 * appearing to reset it. The shapes that take no parameters ignore all of this.
 *
 * The drawing itself moved to `ShapeMark` the day the shapes panel needed the
 * same thirteen marks. What is left here is the part that is about *this*
 * element.
 */
function ShapePreview({
  variant,
  element,
}: {
  variant: PickableShape
  /** The element being edited, so each button draws the settings it would keep. */
  element: Extract<BlockElement, { kind: 'shape' }>
}) {
  return (
    <ShapeMark
      variant={variant}
      options={{
        sides: element.sides,
        curve: element.curve,
        waves: element.waves,
        tail: element.tail,
      }}
    />
  )
}

const CHIP_SHAPE_OPTIONS: { value: ChipShape; label: string }[] = [
  { value: 'none', label: 'Text only' },
  { value: 'pill', label: 'Pill' },
  { value: 'burst', label: 'Burst' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'tag', label: 'Tag' },
]

/** A badge outline at button size, drawn by the function the badge uses. */
function ChipShapePreview({ shape }: { shape: ChipShape }) {
  const path = chipPathShape(shape)
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
      {shape === 'none' ? (
        // Two bars for words, and no ground behind them — which is the whole
        // difference between this option and the pill beside it.
        <>
          <rect x={2} y={5} width={12} height={2} rx={1} fill="currentColor" />
          <rect x={4} y={9} width={8} height={2} rx={1} fill="currentColor" />
        </>
      ) : path === null ? (
        <rect x={1} y={4} width={14} height={8} rx={4} fill="currentColor" />
      ) : (
        <path
          d={shapePath(path, PREVIEW)}
          fill="currentColor"
          {...(needsEvenOdd(path) ? { fillRule: 'evenodd' as const } : {})}
        />
      )}
    </svg>
  )
}

/** Rotation and opacity, which belong to the thing rather than to its kind. */
function Appearance({
  element,
  disabled,
  onChange,
}: {
  element: BlockElement
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {/*
        **Turn stays a field and opacity became a slider**, and the split is not
        arbitrary: an owner setting a rotation has a number in mind — square it
        up, tip it five degrees — while an owner setting opacity is looking at
        the card and stops when it looks right. A field makes that second
        judgement a round trip through a number they never wanted. See `Slider`.
      */}
      <Input
        label="Turn"
        type="number"
        min={-180}
        max={180}
        step={1}
        figure
        disabled={disabled}
        value={element.rotation ?? 0}
        hint="Degrees"
        onChange={(event) =>
          onChange({ ...element, rotation: clamp(Number(event.target.value), -180, 180) })
        }
      />
      <Slider
        label="Opacity"
        unit="%"
        min={0}
        max={100}
        step={1}
        disabled={disabled}
        value={Math.round((element.opacity ?? 1) * 100)}
        onValueChange={(next) => onChange({ ...element, opacity: clamp(next, 0, 100) / 100 })}
      />
    </div>
  )
}

function TextFields({
  element,
  repeats,
  disabled,
  color,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  repeats: boolean
  disabled: boolean
  color: ColorProps
  onChange: (element: BlockElement) => void
}) {
  const source = element.source

  return (
    <>
      <Select
        label="Shows"
        disabled={disabled}
        value={sourceKey(source)}
        // A repeating block offers product fields because it renders once per
        // offer and knows which one. A static block does not get them at all —
        // `bindingInScope` is that rule, and the options are built from it.
        options={bindingOptions(repeats)}
        onChange={(event) => onChange({ ...element, source: parseSource(event.target.value, source) })}
      />

      {source.from === 'static' ? (
        <>
          {/*
            **Beside the fields, never around them.** The mark goes the moment
            either line is edited, and wrapping the fields would remount them
            on that keystroke and throw the owner's cursor away.
          */}
          {source.machine === true ? (
            <MachineOutput label="Written by AI">
              <p className="font-ui text-body-sm text-secondary">
                Generative fill wrote this text. Edit either line and it becomes yours.
              </p>
            </MachineOutput>
          ) : null}
          {/*
            **A field you can press Return in.** It was an `Input`, which cannot
            hold a line break at all — so a two-line headline could only be made
            by narrowing the box until the wrap landed between the right two
            words, and it moved again the moment the card was drawn at another
            shape. `wrapText` keeps a typed break and wraps inside it, so the
            two mechanisms compose: the owner says where the line must break and
            the fit ladder still decides the rest.

            Three rows rather than four: this sits in a panel beside a dozen
            other controls, and a headline is rarely a paragraph.
          */}
          <Textarea
            label="Text"
            rows={3}
            disabled={disabled}
            value={source.textEn}
            hint="Return starts a new line."
            maxLength={280}
            onChange={(event) =>
              onChange({ ...element, source: ownText({ ...source, textEn: event.target.value }) })
            }
          />
          {/* Both languages, always. A line with no Arabic is a hole in the
              Arabic edition, and the owner who typed it will never see that
              edition. */}
          <Textarea
            label="Arabic text"
            rows={3}
            dir="rtl"
            disabled={disabled}
            value={source.textAr}
            hint="Shown in Arabic editions of a book."
            maxLength={280}
            onChange={(event) =>
              onChange({ ...element, source: ownText({ ...source, textAr: event.target.value }) })
            }
          />
        </>
      ) : null}

      <SizeFields element={element} disabled={disabled} onChange={onChange} />

      {/* The glyphs mirror in an Arabic interface, because they point somewhere
          and the value they set is logical rather than physical: `start` is the
          reading-order start, which is the right edge in Arabic. An arrow that
          pointed left while setting the right edge would be a lie. */}
      <Field
        label="Alignment"
        hint="Start and end follow the language, so Arabic mirrors on its own."
      >
        <Segmented
          label="Alignment"
          disabled={disabled}
          value={element.align}
          options={[
            { value: 'start', label: 'Reading-order start', icon: AlignLeft, mirror: true },
            { value: 'center', label: 'Centre', icon: AlignCenter },
            { value: 'end', label: 'Reading-order end', icon: AlignRight, mirror: true },
          ]}
          onChange={(align) => onChange({ ...element, align })}
        />
      </Field>

      {/*
        **A gradient is allowed on text, and an alpha stop is not.** The face of
        a price with a run from light to dark is the cheapest three-dimensional
        cue there is and what a retail ticket already wears; a stop that *fades*
        makes Chromium carry the whole thing with a page-sized soft mask at a
        resolution nothing in the document can set, which the export harness
        bans. So the gradient is offered and the opacity slider inside it is not.
      */}
      <ColorControl
        label="Text colour"
        allowGradient
        allowStopAlpha={false}
        value={element.color}
        palette={color.palette}
        token={color.token}
        disabled={color.disabled}
        onChange={(next) => onChange({ ...element, color: next })}
      />

      {/* **An outline on the glyphs**, which is retail typography rather than
          decoration — "SAVE 20%" in white with a red edge, or price digits over
          a photograph. The width is the outline you see: the painter doubles it
          and orders the paint `stroke fill`, because SVG centres a stroke and
          half of it would otherwise be lost into the counters. E14 §2.4. */}
      <TextBackgroundFields
        element={element}
        disabled={disabled}
        color={color}
        onChange={onChange}
      />

      <StrokeControl
        label="Outline"
        value={element.stroke}
        {...color}
        onChange={(stroke) => onChange({ ...element, stroke })}
      />

      {/* Hard only — see `allowBlur`. A soft shadow on text is 663 kB for one
          price, because Chromium outlines every stroked copy into path
          geometry, and the schema refuses it rather than clamping it. */}
      <ShadowControl
        value={element.shadow}
        {...color}
        allowBlur={false}
        onChange={(shadow) =>
          onChange({
            ...element,
            // `HardShadow` is `Shadow & { blur: 0 }`, and the control never
            // offers a softness field here — but the type is what makes that a
            // guarantee rather than a habit of this call site.
            ...(shadow === undefined ? { shadow: undefined } : { shadow: { ...shadow, blur: 0 } }),
          })
        }
      />

      {/* **An extrusion, not a bevel.** A real bevel rasterises the glyphs and
          takes the font out of the PDF; copies of the string keep it text and
          cost about a fifth of a kilobyte each. `ExtrudeControl` carries the
          measurements and the reason there is no lighting control here. */}
      <ExtrudeControl
        value={element.extrude}
        {...color}
        onChange={(extrude) => onChange({ ...element, extrude })}
      />

      <OverflowField element={element} disabled={disabled} onChange={onChange} />
    </>
  )
}

/**
 * Size, weight and case.
 *
 * **Snap to the brand scale is the default, not the law.** A level keeps the
 * hierarchy consistent across every block a shop owns and is what the fit ladder
 * steps down when a name is long — so it stays, and it stays the thing a size
 * falls back to. An owner sizing a headline by eye against their own artwork is
 * doing design rather than breaking a system, so the second control exists.
 */
function SizeFields({
  element,
  disabled,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  const free = element.size !== undefined

  return (
    <div className="flex flex-col gap-3 rounded-control border-hairline border-border-subtle p-3">
      <Select
        label="Size"
        disabled={disabled}
        value={free ? 'custom' : element.level}
        hint="A step on your brand's scale keeps every block consistent."
        options={[
          ...TYPE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] })),
          { value: 'custom', label: 'Set it myself' },
        ]}
        onChange={(event) => {
          const value = event.target.value
          if (value !== 'custom') {
            const { size: _dropped, ...rest } = element
            onChange({ ...rest, level: value as TypeLevel } as BlockElement)
            return
          }
          // Seeded from the level it was on, so switching to a custom size
          // starts where the eye already is rather than at some default.
          onChange({ ...element, size: 0.06 })
        }}
      />

      {free ? (
        <Input
          label="Size"
          type="number"
          min={0.5}
          max={40}
          step={0.5}
          figure
          disabled={disabled}
          value={Math.round((element.size ?? 0) * 1000) / 10}
          hint="Percent of the card. Stays right at any page size."
          onChange={(event) =>
            onChange({ ...element, size: clamp(Number(event.target.value), 0.5, 40) / 100 })
          }
        />
      ) : null}

      {/* **Weight stays a list; italics and case become buttons.** Four named
          weights are four values an owner picks between and cannot guess from a
          glyph — a `B` would collapse them to two. Italics and uppercase have
          one glyph each and everybody already knows both. */}
      <Select
        label="Weight"
        disabled={disabled}
        value={String(element.weight ?? 0)}
        options={[
          { value: '0', label: 'From the style' },
          { value: '400', label: 'Regular' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
          { value: '800', label: 'Heavy' },
        ]}
        onChange={(event) => {
          const weight = Number(event.target.value)
          if (weight === 0) {
            const { weight: _dropped, ...rest } = element
            onChange(rest as BlockElement)
            return
          }
          onChange({ ...element, weight })
        }}
      />

      {/* One group, because they are one thing an owner is deciding about this
          text — separately bordered squares read as unrelated controls.
          Italics are offered and warned about, never blocked: it is the shop's
          brand, and most Arabic-capable families ship no true italic.
          Uppercase draws as `TT` rather than as an icon, because in every design
          tool the mark for case *is* type.

          **Strikethrough sits here and nowhere else.** It is a formatting
          option, the same kind of thing as bold — not a property of what a layer
          is bound to. It briefly worked the other way: a layer showing the
          was-price struck itself, and no control could stop it. That is the
          system deciding a design question the owner is looking straight at on
          the canvas, and it left them with a rule they could see and not
          change. */}
      <Field label="Style">
        <ToggleBar
          label="Style"
          disabled={disabled}
          options={[
            { value: 'italic', label: 'Italic', icon: Italic, pressed: element.italic ?? false },
            {
              value: 'uppercase',
              label: 'UPPERCASE',
              glyph: 'TT',
              pressed: element.transform === 'uppercase',
            },
            {
              value: 'strike',
              label: 'Strikethrough',
              icon: Strikethrough,
              pressed: element.decoration === 'line-through',
            },
          ]}
          onToggle={(value, pressed) => {
            if (value === 'italic') onChange({ ...element, italic: pressed })
            else if (value === 'strike') {
              onChange({ ...element, decoration: pressed ? 'line-through' : 'none' })
            } else onChange({ ...element, transform: pressed ? 'uppercase' : 'none' })
          }}
        />
      </Field>
    </div>
  )
}

/**
 * The overflow control. A **first-class** control, which is the design system's
 * word and not a preference: it is the setting that decides whether a block
 * survives contact with the catalog, and a shop that discovers the answer on a
 * printed flyer has discovered it too late.
 */
function OverflowField({
  element,
  disabled,
  onChange,
}: {
  element: Extract<BlockElement, { kind: 'text' }>
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  const overflow = element.overflow
  const mode = overflow?.mode ?? 'default'

  function set(next: TextOverflow | undefined) {
    const { overflow: _dropped, ...rest } = element
    onChange(next === undefined ? (rest as BlockElement) : { ...rest, overflow: next })
  }

  return (
    <div className="flex flex-col gap-3 rounded-control border-hairline border-border-subtle p-3">
      <Select
        label="When the text is too long"
        disabled={disabled}
        value={mode}
        hint="Arabic runs longer than English, so this happens more than you would think."
        options={[
          { value: 'default', label: 'Decide for me' },
          { value: 'shrink', label: 'Shrink, down to a floor' },
          { value: 'clamp', label: 'Wrap to a set number of lines' },
          { value: 'truncate', label: 'One line, cut with an ellipsis' },
        ]}
        onChange={(event) => {
          const value = event.target.value
          if (value === 'default') return set(undefined)
          if (value === 'truncate') return set({ mode: 'truncate' })
          if (value === 'clamp') return set({ mode: 'clamp', lines: 2 })
          return set({ mode: 'shrink', floor: 'h5' })
        }}
      />

      {overflow?.mode === 'shrink' ? (
        <Select
          label="Never smaller than"
          disabled={disabled}
          value={overflow.floor}
          hint="Below the floor the card is flagged instead of shrinking further."
          options={TYPE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] }))}
          onChange={(event) => set({ mode: 'shrink', floor: event.target.value as TypeLevel })}
        />
      ) : null}

      {overflow?.mode === 'clamp' ? (
        <Input
          label="Lines"
          type="number"
          min={1}
          max={6}
          step={1}
          figure
          disabled={disabled}
          value={overflow.lines}
          onChange={(event) =>
            set({ mode: 'clamp', lines: clamp(Math.round(Number(event.target.value)), 1, 6) })
          }
        />
      ) : null}
    </div>
  )
}

/**
 * Position and size, in percent of the block.
 *
 * Percent rather than millimetres or pixels because the block has no size: the
 * same design is 1080 square in a carousel post and a third of a column in a
 * booklet. `start` rather than `left`, so the field means the same thing in both
 * directions.
 *
 * **And a line underneath saying what the percentages come to**, because width
 * and height are read against two edges that are not the same length: a circle
 * reads 32.5 by 18.5 on a story, which looks like the tool losing the shape and
 * leaves an owner no way to ask for a circle on purpose. See `drawnSize`.
 */
function BoxFields({
  element,
  canvas,
  disabled,
  onChange,
}: {
  element: BlockElement
  canvas: Canvas
  disabled: boolean
  onChange: (element: BlockElement) => void
}) {
  const set = (patch: Partial<typeof element.box>) =>
    onChange({ ...element, box: { ...element.box, ...patch } } as BlockElement)

  const drawn = drawnSize(element.box, canvas)

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-ui text-eyebrow uppercase tracking-wide text-secondary">
        Position and size
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <PercentField
          label="From the start"
          value={element.box.start}
          disabled={disabled}
          onChange={(start) => set({ start })}
        />
        <PercentField
          label="From the top"
          value={element.box.top}
          disabled={disabled}
          onChange={(top) => set({ top })}
        />
        <PercentField
          label="Width"
          value={element.box.width}
          disabled={disabled}
          onChange={(width) => set({ width })}
        />
        <PercentField
          label="Height"
          value={element.box.height}
          disabled={disabled}
          onChange={(height) => set({ height })}
        />
      </div>
      {drawn === null ? null : (
        <p className="font-ui text-body-sm text-muted">{drawn}</p>
      )}
    </fieldset>
  )
}

function PercentField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Input
      label={label}
      type="number"
      min={-50}
      max={150}
      step={0.5}
      figure
      disabled={disabled}
      value={Math.round(value * 1000) / 10}
      onChange={(event) => onChange(clamp(Number(event.target.value), -50, 150) / 100)}
    />
  )
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min

function sourceKey(source: Extract<BlockElement, { kind: 'text' }>['source']): string {
  return source.from === 'static' ? 'static' : `${source.from}:${source.field}`
}

/**
 * Static text the owner has now written into, and so theirs rather than a
 * model's: the machine mark comes off with the first edit.
 */
function ownText(
  source: Extract<Extract<BlockElement, { kind: 'text' }>['source'], { from: 'static' }>
): Extract<Extract<BlockElement, { kind: 'text' }>['source'], { from: 'static' }> {
  return { from: 'static', textEn: source.textEn, textAr: source.textAr }
}

/**
 * Changing what a text element shows.
 *
 * Switching *to* static keeps whatever the owner had typed before, if anything,
 * rather than starting blank each time they change their mind — the previous
 * strings are the thing they would otherwise have to retype.
 */
function parseSource(
  value: string,
  current: Extract<BlockElement, { kind: 'text' }>['source']
): Extract<BlockElement, { kind: 'text' }>['source'] {
  if (value === 'static') {
    return current.from === 'static' ? current : { from: 'static', textEn: 'Your text', textAr: 'النص' }
  }

  // **Looked up in the vocabulary rather than reassembled from the string.**
  // It used to parse `from:field` and cast the field to a union per source,
  // which typechecks whatever the string says and silently returned the current
  // source for anything it did not recognise — so `brand` and `book` would have
  // been unselectable even once the picker offered them. A lookup cannot
  // disagree with the list the picker was built from, and it needs no
  // assertion.
  return TEXT_BINDINGS.find((source) => sourceKey(source) === value) ?? current
}

/**
 * What an image may show.
 *
 * **Artwork is not offered, and is not dropped either.** Switching *to* an
 * upload means choosing a file, which is the artwork flow's job rather than a
 * value in a dropdown — but an element that already is one has to have
 * something for the control to display, or the select shows a blank and the
 * first change silently rebinds it. So it appears only when it is already the
 * answer.
 */
function imageOptions(
  repeats: boolean,
  current: Extract<BlockElement, { kind: 'image' }>['source']
): { value: string; label: string }[] {
  return [
    ...IMAGE_BINDINGS.filter((source) => bindingInScope(source, repeats)).map((source) => ({
      value: bindingKey(source),
      label: labelFor(source),
    })),
    ...(current.from === 'asset'
      ? [{ value: bindingKey(current), label: labelFor(current) }]
      : []),
  ]
}

function parseImageSource(
  value: string,
  current: Extract<BlockElement, { kind: 'image' }>['source']
): Extract<BlockElement, { kind: 'image' }>['source'] {
  // An upload keeps its id — there is nothing in the string to rebuild it from,
  // and losing it would strand the file.
  if (value === 'asset') return current
  return IMAGE_BINDINGS.find((source) => bindingKey(source) === value) ?? current
}

/**
 * Every binding this block may carry, as picker options.
 *
 * **Built from the vocabulary rather than written out.** It was a literal list,
 * and a literal list falls behind silently: seven bindings were added to
 * `TextSource`, resolved in both painters and drawn on a card while this picker
 * went on offering the old eleven — so nothing could be bound to them at all.
 * `bindingInScope` draws §3.6's line and `BINDING_LABEL` supplies the words, so
 * a new field appears here the day it is added.
 *
 * **Grouped by subject, in the order an owner reaches for them.** The product
 * and the offer first because a repeating card is mostly those; the shop, the
 * brand and the book after, because a header or a footer is mostly those.
 */
function bindingOptions(repeats: boolean): { value: string; label: string }[] {
  const inScope = TEXT_BINDINGS.filter((source) => bindingInScope(source, repeats))
  const order: Record<string, number> = { product: 0, offer: 1, shop: 2, brand: 3, book: 4 }
  return [
    ...inScope
      .slice()
      .sort((a, b) => (order[a.from] ?? 9) - (order[b.from] ?? 9))
      .map((source) => ({
        value: sourceKey(source),
        label: labelFor(source),
      })),
    { value: 'static', label: labelFor({ from: 'static', textEn: '', textAr: '' }) },
  ]
}

/**
 * What each part of the offer is, to an owner.
 *
 * Four of the five name a piece the price mark can also draw, so each says so:
 * an owner who places one and leaves the mark drawing it too gets the same
 * thing twice, and the panel is where that is cheapest to say.
 */
const OFFER_PURPOSE: Record<
  Extract<Extract<BlockElement, { kind: 'text' }>['source'], { from: 'offer' }>['field'],
  string
> = {
  price: 'The price itself, as its own layer. Hide the price mark so it is not drawn twice.',
  tier: 'The offer’s tier. It changes with every product, and it is what a badge says.',
  currency: 'The currency, as its own layer. Set the price mark’s currency to “somewhere else” so it is not drawn twice.',
  compare: 'The was-price. Strike it through with the Style buttons. Hide it on the price mark so it is not drawn twice.',
  prefix: 'Reads FROM, EACH or PER KG, depending on how the offer is priced.',
  unitPrice: 'The “(1 kg = 1.76)” line. Empty when the pack cannot answer.',
  // Empty when there is no was-price, which is what makes a "SAVE" flash
  // appear on the cards that earned one and nowhere else — E14 §3.7.
  saveAmount: 'What the shop saved, in money. Empty when there is no was-price.',
  savePercent: 'What the shop saved, as a percentage. Empty when there is no was-price.',
}

/** One line on what this element is for, in the owner's terms. */
function purpose(element: BlockElement): string {
  switch (element.kind) {
    case 'text':
      return element.source.from === 'product'
        ? 'Follows the catalog. It changes with every product.'
        : element.source.from === 'offer'
          ? OFFER_PURPOSE[element.source.field]
          : element.source.from === 'shop'
            ? 'Comes from the shop this book belongs to.'
            : 'The same on every card.'
    case 'image':
      return element.source.from === 'product'
        ? 'The packshot, or a reserved space where a product has none.'
        : 'Artwork you uploaded.'
    case 'priceMark':
      return 'The offer price, the was-price and the badge, as one piece.'
    case 'chip':
      return 'The promo tier: “Half price”, “2 for 1”. Set per offer.'
    case 'logo':
      return 'Your logo, from the brand kit.'
    case 'shape':
      return 'A ground, a panel or a rule.'
  }
}
