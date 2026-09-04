'use client'

import * as React from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import type { BrandColor, TextStyle } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useBrandStore } from '@/stores/brand-store'
import { BRAND_FONTS, fontStack, googleFontsHref } from '@/lib/brand-fonts'
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
 * **The list shows the result; a dialog does the editing.** Every style has six
 * properties, and eight styles inline was forty-eight controls stacked in one
 * card — a wall to scroll past rather than a guideline to read. What an owner
 * needs from this screen is *what their type looks like*; changing it is the
 * occasional act, and it belongs behind a deliberate step.
 *
 * So each row draws the style itself, at its own weight, in its own face and
 * colour, above a plain-language summary. The rendered line is the answer to
 * "what did I set", and nothing has to be decoded from a form.
 *
 * A definition, not a ladder — the same thing the palette is for colour. Styles
 * a seeded block binds to cannot be deleted, and say so.
 *
 * Changes land in the store on save. Persisting the kit is the caller's.
 */
export function TypographyFields() {
  const { kit, setTextStyles } = useBrandStore()
  const styles = resolveTextStyles(kit)
  const palette = resolvePalette(kit)

  /** The style being edited, as a draft. Null when the dialog is closed. */
  const [draft, setDraft] = React.useState<TextStyle | null>(null)

  useGoogleFonts(styles.map((style) => style.family))

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {styles.map((style) => (
          <li key={style.id}>
            <StyleRow
              style={style}
              palette={palette}
              removable={canRemoveStyle(styles, style)}
              onEdit={() => setDraft(style)}
              onRemove={() => setTextStyles(styles.filter((s) => s.id !== style.id))}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={!canAddStyle(styles)}
          onClick={() => setDraft(newTextStyle(kit, styles))}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a style
        </Button>

        <p className="font-ui text-body-sm text-muted">
          <span data-figure>{styles.length}</span> of <span data-figure>{MAX_STYLES}</span>
        </p>
      </div>

      {draft ? (
        <StyleDialog
          draft={draft}
          palette={palette}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => {
            const exists = styles.some((style) => style.id === draft.id)
            setTextStyles(
              exists
                ? styles.map((style) => (style.id === draft.id ? draft : style))
                : [...styles, draft]
            )
            setDraft(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** The style, drawn as itself, above what it is made of. */
function StyleRow({
  style,
  palette,
  removable,
  onEdit,
  onRemove,
}: {
  style: TextStyle
  palette: BrandColor[]
  removable: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  const color = palette.find((entry) => entry.id === style.colorId)

  return (
    <div className="flex items-center gap-3 rounded-control border-hairline border-border-subtle p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-ui text-label font-medium text-secondary">{style.name}</span>

        {/* The rendered line is the answer to "what did I set". */}
        <p className="truncate" style={specimenCss(style, color?.hex)}>
          Golden basmati rice
        </p>

        <span className="font-ui text-body-sm text-muted">{summarise(style, color)}</span>
      </div>

      <Button type="button" variant="ghost" iconOnly aria-label={`Edit ${style.name}`} onClick={onEdit}>
        <Pencil className="size-4" aria-hidden="true" />
      </Button>

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
  )
}

/** Plain language, not a form read aloud. */
function summarise(style: TextStyle, color: BrandColor | undefined): string {
  const parts = [style.family, `${style.size}×`, String(style.weight)]
  if (style.italic) parts.push('italic')
  if (color) parts.push(color.name)
  if (style.slot) parts.push('used by the standard blocks')
  return parts.join(' · ')
}

function StyleDialog({
  draft,
  palette,
  onChange,
  onSave,
  onCancel,
}: {
  draft: TextStyle
  palette: BrandColor[]
  onChange: (style: TextStyle) => void
  onSave: () => void
  onCancel: () => void
}) {
  const set = (patch: Partial<TextStyle>) => onChange({ ...draft, ...patch })
  const color = palette.find((entry) => entry.id === draft.colorId)
  const named = draft.name.trim() !== ''

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={`Edit ${draft.name || 'style'}`}
      description="Sizes scale with whatever block the style lands in, so one style works on a booklet page and a carousel post."
      primaryAction={{ label: 'Save style', onClick: onSave }}
      secondaryAction={{ label: 'Cancel', onClick: onCancel }}
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Name"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          error={named ? undefined : 'Give the style a name so you can recognise it later.'}
          hint={draft.slot ? 'The standard blocks use this style' : undefined}
        />

        <Select
          label="Typeface"
          value={draft.family}
          onChange={(event) => set({ family: event.target.value })}
          options={BRAND_FONTS.map((font) => ({ value: font.family, label: font.family }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Size"
            value={String(draft.size)}
            onChange={(event) => set({ size: Number(event.target.value) })}
            options={SIZE_STEPS.map((step) => ({ value: String(step), label: `${step}×` }))}
          />

          <Select
            label="Weight"
            value={String(draft.weight)}
            onChange={(event) => set({ weight: Number(event.target.value) })}
            options={WEIGHTS.map((weight) => ({ value: String(weight), label: String(weight) }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Style"
            value={draft.italic ? 'italic' : 'regular'}
            onChange={(event) => set({ italic: event.target.value === 'italic' })}
            options={[
              { value: 'regular', label: 'Regular' },
              { value: 'italic', label: 'Italic' },
            ]}
            // Stated, never blocked: it is the shop's brand.
            hint={
              italicIsSynthetic(draft)
                ? `${draft.family} has no italic — this will be slanted`
                : undefined
            }
          />

          <Select
            label="Colour"
            value={draft.colorId ?? ''}
            onChange={(event) => set({ colorId: event.target.value || null })}
            options={[
              { value: '', label: 'Default ink' },
              ...palette.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
          />
        </div>

        <div className="flex flex-col gap-1 rounded-control bg-stone-0 p-3">
          <span className="font-ui text-label font-medium text-secondary">Preview</span>
          {/* Arabic first: it is where a face fails, and it runs longer. */}
          <p dir="rtl" style={specimenCss(draft, color?.hex)}>
            أرز بسمتي ذهبي
          </p>
          <p style={specimenCss(draft, color?.hex)}>Golden basmati rice</p>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * Sized against a fixed reference block so rows are comparable to each other. On
 * a page the same multiplier resolves against whatever block it lands in.
 */
const REFERENCE_BLOCK = 360

function specimenCss(style: TextStyle, hex: string | undefined): React.CSSProperties {
  return {
    fontFamily: fontStack(style.family),
    fontSize: TYPE_BASE * REFERENCE_BLOCK * style.size,
    fontWeight: style.weight,
    lineHeight: style.lineHeight,
    // The shop's own colour, not a design decision, so it cannot come from a
    // token. Same exemption usage-meter.tsx relies on.
    ...(hex ? { color: hex } : {}),
    ...(style.italic ? { fontStyle: 'italic' as const } : {}),
    ...(style.transform === 'uppercase' ? { textTransform: 'uppercase' as const } : {}),
  }
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
