'use client'

import * as React from 'react'
import { Plus, X } from 'lucide-react'
import type { BrandColor, TextStyle } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useBrandStore } from '@/stores/brand-store'
import { BRAND_FONTS, fontStack, googleFontsHref, supportsItalic } from '@/lib/brand-fonts'
import { resolvePalette } from '@/lib/brand-palette'
import {
  MAX_STYLES,
  SIZE_STEPS,
  TYPE_BASE,
  WEIGHTS,
  canAddStyle,
  canRemoveStyle,
  italicIsSynthetic,
  newTextStyle,
  resolveTextStyles,
} from '@/lib/brand-typography'

/**
 * The shop's text styles. E4.
 *
 * **A definition, not a ladder.** The palette page of a brand guideline says
 * "these are our colours"; the type page says "these are our styles" — Headline,
 * Product name, Small print — each with its own family, size, weight, italic and
 * colour. It was a fixed h1–h6 scale, which capped a brand at eight styles and
 * named them after nothing an owner recognises.
 *
 * Styles a seeded block binds to cannot be deleted, and say so. Everything else
 * the owner adds is theirs.
 *
 * Changes land in the store immediately. Persisting is the caller's.
 */
export function TypographyFields() {
  const { kit, setTextStyles } = useBrandStore()
  const styles = resolveTextStyles(kit)
  const palette = resolvePalette(kit)

  useGoogleFonts(styles.map((style) => style.family))

  const update = (id: string, patch: Partial<TextStyle>) =>
    setTextStyles(styles.map((style) => (style.id === id ? { ...style, ...patch } : style)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {styles.map((style) => (
          <StyleRow
            key={style.id}
            style={style}
            palette={palette}
            removable={canRemoveStyle(styles, style)}
            onChange={(patch) => update(style.id, patch)}
            onRemove={() => setTextStyles(styles.filter((s) => s.id !== style.id))}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!canAddStyle(styles)}
          onClick={() => setTextStyles([...styles, newTextStyle(kit, styles)])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a style
        </Button>

        <p className="font-ui text-body-sm text-muted">
          <span data-figure>{styles.length}</span> of <span data-figure>{MAX_STYLES}</span>
        </p>
      </div>
    </div>
  )
}

function StyleRow({
  style,
  palette,
  removable,
  onChange,
  onRemove,
}: {
  style: TextStyle
  palette: BrandColor[]
  removable: boolean
  onChange: (patch: Partial<TextStyle>) => void
  onRemove: () => void
}) {
  const color = palette.find((entry) => entry.id === style.colorId)

  return (
    <div className="flex flex-col gap-3 rounded-control border-hairline border-border-subtle p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Input
            label="Name"
            value={style.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hint={style.slot ? 'Used by the standard blocks' : undefined}
          />
        </div>

        {/* Aligned by construction — an empty label rather than a top margin. */}
        <div className="flex flex-col gap-1">
          <span aria-hidden="true" className="font-ui text-label font-medium">
            &nbsp;
          </span>
          <Button
            type="button"
            variant="ghost"
            iconOnly
            disabled={!removable}
            aria-label={`Remove ${style.name}`}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select
          label="Typeface"
          value={style.family}
          onChange={(event) => onChange({ family: event.target.value })}
          options={BRAND_FONTS.map((font) => ({ value: font.family, label: font.family }))}
        />

        <Select
          label="Size"
          value={String(style.size)}
          onChange={(event) => onChange({ size: Number(event.target.value) })}
          options={SIZE_STEPS.map((step) => ({ value: String(step), label: `${step}×` }))}
          hint="Scales with the block"
        />

        <Select
          label="Weight"
          value={String(style.weight)}
          onChange={(event) => onChange({ weight: Number(event.target.value) })}
          options={WEIGHTS.map((weight) => ({ value: String(weight), label: String(weight) }))}
        />

        <Select
          label="Style"
          value={style.italic ? 'italic' : 'regular'}
          onChange={(event) => onChange({ italic: event.target.value === 'italic' })}
          options={[
            { value: 'regular', label: 'Regular' },
            { value: 'italic', label: 'Italic' },
          ]}
          // Stated, never blocked: it is the shop's brand.
          hint={
            italicIsSynthetic(style)
              ? `${style.family} has no italic — this will be slanted, not italic`
              : undefined
          }
        />
      </div>

      <Select
        label="Colour"
        value={style.colorId ?? ''}
        onChange={(event) => onChange({ colorId: event.target.value || null })}
        options={[
          { value: '', label: 'Default ink' },
          ...palette.map((entry) => ({ value: entry.id, label: entry.name })),
        ]}
      />

      <Preview style={style} hex={color?.hex} />
    </div>
  )
}

/**
 * The style, drawn. Sized against a fixed reference block so the rows are
 * comparable to each other — on a page the same multiplier resolves against
 * whatever block it lands in.
 */
const REFERENCE_BLOCK = 360

function Preview({ style, hex }: { style: TextStyle; hex: string | undefined }) {
  const fontSize = TYPE_BASE * REFERENCE_BLOCK * style.size

  const css: React.CSSProperties = {
    fontFamily: fontStack(style.family),
    fontSize,
    fontWeight: style.weight,
    lineHeight: style.lineHeight,
    // The shop's own colour, not a design decision, so it cannot come from a
    // token. Same exemption usage-meter.tsx relies on.
    ...(hex ? { color: hex } : {}),
    ...(style.italic ? { fontStyle: 'italic' as const } : {}),
    ...(style.transform === 'uppercase' ? { textTransform: 'uppercase' as const } : {}),
  }

  return (
    <div className="flex flex-col gap-1 rounded-control bg-stone-0 p-3">
      {/* Arabic first: it is where a face fails, and it runs longer. */}
      <p dir="rtl" style={css}>
        أرز بسمتي ذهبي
      </p>
      <p style={css}>Golden basmati rice</p>
    </div>
  )
}

/**
 * Load the chosen families from Google's CDN, for the previews only.
 *
 * **Chrome only.** The export pipeline must self-host — Playwright cannot depend
 * on an external network on a critical path, and PDF embedding needs the real
 * file. See `lib/brand-fonts.ts`.
 */
function useGoogleFonts(families: readonly string[]): void {
  const href = googleFontsHref(families)

  React.useEffect(() => {
    if (href === '') return
    if (document.querySelector(`link[data-brand-fonts][href="${href}"]`)) return

    for (const stale of document.querySelectorAll('link[data-brand-fonts]')) {
      stale.remove()
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.brandFonts = 'true'
    document.head.appendChild(link)
  }, [href])
}

export { supportsItalic }
