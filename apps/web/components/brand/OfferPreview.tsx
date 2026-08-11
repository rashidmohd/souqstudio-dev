'use client'

import type { GridConfig, TemplateConfig } from '@souqstudio/types'
import { readableInkOn, fromHex, isDarkBackground } from '@/lib/color'

/**
 * Content tokens, not chrome tokens. `--sq-tpl-*` is the offer book namespace —
 * this is a picture of what the shop will print, so it belongs there. Reaching
 * for a `--sq-ui-*` token here would be the mistake the two namespaces exist to
 * prevent.
 *
 * The placeholder blocks standing in for a product photo and its text are ink
 * at low opacity rather than named greys: there is no grey in the content
 * palette, and tinting against the ground means they read correctly on a light,
 * dark or brand-coloured page without a second set of values.
 */
const PAPER = 'var(--sq-tpl-paper)'
const INK = 'var(--sq-tpl-ink)'

/**
 * A miniature offer book page, drawn as SVG in the shop's own colours. E4-03,
 * E4-04.
 *
 * **Not a Fabric canvas.** E4's frontend notes call for mini Fabric canvases,
 * and that is right for the admin template builder where fidelity to the
 * artboard is the whole point. Here it would put Fabric, its font loading and
 * ten canvas contexts into the onboarding bundle — the flow the entire product
 * depends on for a first impression, on a mid-range Android over 4G. SVG paints
 * immediately, costs nothing, and scales to whatever box it is given.
 *
 * What it must not become is a second renderer that drifts from the artboard.
 * It reads the same `GridConfig` cell fractions and the same `TemplateConfig`
 * the editor will, so a grid or template change moves both. It shows *layout
 * and colour*, which is the entire decision being made on these two steps —
 * anything finer belongs in the editor.
 *
 * Coordinates are a unit viewBox and never mirror: the artboard stays LTR in
 * Arabic, per the canvas rules in apps/web/CLAUDE.md.
 */

const VIEW = 100

type Props = {
  grid: GridConfig
  template: TemplateConfig
  colors: { primary: string; secondary: string; accent: string }
  /** Rendered above the cells, as an offer book header would be. */
  shopName?: string
  className?: string
}

export function OfferPreview({ grid, template, colors, shopName, className }: Props) {
  // Only the brand surface resolves to a real colour here; the other two are
  // token references the browser resolves, so contrast is computed against the
  // known token values rather than by parsing a var().
  const surface =
    template.surface === 'dark' ? INK : template.surface === 'brand' ? colors.primary : PAPER

  const brandRgb = fromHex(colors.primary)
  const surfaceIsDark =
    template.surface === 'dark' ||
    (template.surface === 'brand' && brandRgb ? isDarkBackground(brandRgb) : false)

  // The header eats the top of the page; cells are scaled into what is left.
  const headerHeight = shopName ? 12 : 0
  const bodyTop = headerHeight
  const bodyHeight = VIEW - headerHeight

  const gapPx = grid.gap * VIEW
  const padding = template.density === 'airy' ? 5 : template.density === 'dense' ? 2 : 3.5

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className={className}
      role="img"
      aria-label="Offer book preview"
    >
      <rect width={VIEW} height={VIEW} fill={surface} />

      {shopName ? (
        <>
          <rect width={VIEW} height={headerHeight} fill={colors.primary} />
          {/* Centred, and that is deliberate. SVG resolves `text-anchor: start`
              against the inherited direction, so a start-anchored label would
              jump to the other edge under an Arabic ancestor while its x stayed
              measured from the left. A middle anchor is direction-independent,
              and the glyphs still shape correctly for an Arabic shop name
              because nothing here overrides `direction`. */}
          <text
            x={VIEW / 2}
            y={headerHeight / 2 + 2.2}
            textAnchor="middle"
            fontSize="6"
            fontWeight="600"
            fill={readableInkOn(fromHex(colors.primary) ?? { r: 0, g: 0, b: 0 })}
          >
            {shopName.slice(0, 18)}
          </text>
        </>
      ) : null}

      {grid.cells.map((cell, index) => {
        const x = padding + cell.x * (VIEW - padding * 2) + gapPx / 2
        const y = bodyTop + padding + cell.y * (bodyHeight - padding * 2) + gapPx / 2
        const w = cell.w * (VIEW - padding * 2) - gapPx
        const h = cell.h * (bodyHeight - padding * 2) - gapPx

        return (
          <g key={index}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={template.cardRadius}
              fill={PAPER}
              stroke={template.cardBorder ? INK : 'none'}
              strokeOpacity={template.cardBorder ? 0.12 : 0}
              strokeWidth={template.cardBorder ? 0.4 : 0}
            />

            {/* Product image block — a flat tint, not a photo. The decision on
                this step is layout, and a stock photo would make five grids
                look like five different products. */}
            <rect
              x={x + w * 0.12}
              y={y + h * 0.12}
              width={w * 0.76}
              height={h * 0.42}
              rx={1.5}
              fill={INK}
              fillOpacity={0.07}
            />

            {/* Two lines standing in for name and variant. */}
            <rect x={x + w * 0.12} y={y + h * 0.62} width={w * 0.6} height={h * 0.055} rx={0.8} fill={INK} fillOpacity={0.18} />
            <rect x={x + w * 0.12} y={y + h * 0.71} width={w * 0.38} height={h * 0.05} rx={0.8} fill={INK} fillOpacity={0.11} />

            <PriceMark
              x={x}
              y={y}
              w={w}
              h={h}
              style={template.priceStyle}
              accent={colors.accent}
              secondary={colors.secondary}
            />

            {template.badge === 'none' ? null : (
              <Badge x={x} y={y} w={w} h={h} shape={template.badge} accent={colors.accent} />
            )}
          </g>
        )
      })}

      {/* A tinted ground needs its own hairline or the cards float. */}
      {surfaceIsDark ? (
        <rect width={VIEW} height={VIEW} fill="none" stroke={PAPER} strokeOpacity="0.12" strokeWidth="1" />
      ) : null}
    </svg>
  )
}

function PriceMark({
  x,
  y,
  w,
  h,
  style,
  accent,
  secondary,
}: {
  x: number
  y: number
  w: number
  h: number
  style: TemplateConfig['priceStyle']
  accent: string
  secondary: string
}) {
  const priceInk = readableInkOn(fromHex(accent) ?? { r: 0, g: 0, b: 0 })

  if (style === 'band') {
    return (
      <>
        <rect x={x} y={y + h * 0.82} width={w} height={h * 0.18} fill={accent} />
        <rect
          x={x + w * 0.12}
          y={y + h * 0.87}
          width={w * 0.4}
          height={h * 0.07}
          rx={0.8}
          fill={priceInk}
          fillOpacity="0.85"
        />
      </>
    )
  }

  if (style === 'burst') {
    return (
      <>
        <circle cx={x + w * 0.76} cy={y + h * 0.82} r={Math.min(w, h) * 0.17} fill={accent} />
        <rect
          x={x + w * 0.12}
          y={y + h * 0.83}
          width={w * 0.34}
          height={h * 0.07}
          rx={0.8}
          fill={secondary}
        />
      </>
    )
  }

  if (style === 'tag') {
    return (
      <rect
        x={x + w * 0.12}
        y={y + h * 0.8}
        width={w * 0.45}
        height={h * 0.13}
        rx={1.2}
        fill={accent}
      />
    )
  }

  return (
    <rect x={x + w * 0.12} y={y + h * 0.82} width={w * 0.4} height={h * 0.08} rx={0.8} fill={accent} />
  )
}

function Badge({
  x,
  y,
  w,
  h,
  shape,
  accent,
}: {
  x: number
  y: number
  w: number
  h: number
  shape: Exclude<TemplateConfig['badge'], 'none'>
  accent: string
}) {
  if (shape === 'circle') {
    return <circle cx={x + w * 0.84} cy={y + h * 0.16} r={Math.min(w, h) * 0.12} fill={accent} />
  }
  if (shape === 'ribbon') {
    return <rect x={x} y={y + h * 0.08} width={w * 0.34} height={h * 0.1} fill={accent} />
  }
  return (
    <path
      d={`M ${x + w} ${y} L ${x + w} ${y + h * 0.26} L ${x + w * 0.74} ${y} Z`}
      fill={accent}
    />
  )
}
