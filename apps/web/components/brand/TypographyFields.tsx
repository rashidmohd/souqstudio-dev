'use client'

import * as React from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import type { BrandColor, TextStyle } from '@souqstudio/types'
import { Button } from '@souqstudio/designer/components/ui/button'
import { Dialog } from '@souqstudio/designer/components/ui/dialog'
import { Input } from '@souqstudio/designer/components/ui/input'
import { Select } from '@souqstudio/designer/components/ui/select'
import { useBrandStore } from '@souqstudio/designer/stores/brand-store'
import { fontStack, type FontCatalog } from '@souqstudio/designer/lib/font-catalog'
import { isRecommended } from '@souqstudio/designer/lib/font-editorial'
import type { OfferableFont } from '@/lib/font-catalog-server'
import { useFontCatalog } from '@souqstudio/designer/components/brand/FontCatalogProvider'
import { useSpecimenFont } from '@/lib/use-specimen-font'
import { FontPicker } from '@/components/brand/FontPicker'
import { resolvePalette } from '@souqstudio/designer/lib/brand-palette'
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
export function TypographyFields({ offerable }: { offerable: OfferableFont[] }) {
  const { kit, setTextStyles } = useBrandStore()
  // Every mirrored family, from the dashboard layout. The `@font-face` rules
  // themselves are already in the document head — the layout emits the four this
  // shop draws in, and this screen's page emits the rest so every row in the
  // picker can be specimen-rendered. Nothing here fetches a stylesheet.
  const catalog = useFontCatalog()
  const styles = resolveTextStyles(kit, catalog)
  const palette = resolvePalette(kit)

  /** The style being edited, as a draft. Null when the dialog is closed. */
  const [draft, setDraft] = React.useState<TextStyle | null>(null)

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
          onClick={() => setDraft(newTextStyle(kit, styles, catalog))}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add a style
        </Button>

        {/* One isolated token — see the note in ColorFields. */}
        <p className="font-ui text-body-sm text-muted">
          <span data-figure>
            {styles.length}/{MAX_STYLES}
          </span>{' '}
          styles
        </p>
      </div>

      {draft ? (
        <StyleDialog
          draft={draft}
          palette={palette}
          catalog={catalog}
          offerable={offerable}
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
  catalog,
  offerable,
  onChange,
  onSave,
  onCancel,
}: {
  draft: TextStyle
  palette: BrandColor[]
  catalog: FontCatalog
  offerable: OfferableFont[]
  onChange: (style: TextStyle) => void
  onSave: () => void
  onCancel: () => void
}) {
  const set = (patch: Partial<TextStyle>) => onChange({ ...draft, ...patch })
  const color = palette.find((entry) => entry.id === draft.colorId)

  /**
   * A family the owner has not saved yet has no `@font-face` on this page, so
   * the specimen would silently draw in the fallback. Pull it from Google's CDN
   * for the preview only. See `lib/use-specimen-font.ts` for why that is allowed
   * here and nowhere else.
   */
  const { pending } = useSpecimenFont(
    draft.family,
    offerable.find((font) => font.family === draft.family)?.mirrored ?? true
  )
  const named = draft.name.trim() !== ''

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={`Edit ${draft.name || 'style'}`}
      description="Sizes scale with whatever block the style lands in, so one style works on a booklet page and a carousel post."
      size="xl"
      primaryAction={{ label: 'Save style', onClick: onSave }}
      secondaryAction={{ label: 'Cancel', onClick: onCancel }}
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Name"
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          error={named ? undefined : 'Give the style a name so you can recognise it later.'}
          hint={draft.slot ? 'The standard blocks use this style' : undefined}
        />

        {/*
          The list and the specimen side by side, because arrowing through the
          list is only useful if the specimen is in view while you do it.
          Stacks below `md`, where they follow each other instead.
        */}
        <div className="grid gap-4 md:grid-cols-2">
          <FontPicker
            value={draft.family}
            fonts={offerable}
            onChange={(family) => set({ family })}
          />

          <div className="flex min-w-0 flex-col gap-2 rounded-control bg-stone-0 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-ui text-label font-medium text-secondary">Preview</span>
              <span className="min-w-0 truncate font-figure text-data text-secondary">
                {draft.family} {draft.weight}
              </span>
            </div>

            {/* Arabic first: it is where a face fails, and it runs longer. */}
            <p dir="rtl" className="min-w-0 break-words" style={specimenCss(draft, color?.hex)}>
              أرز بسمتي ذهبي ٣ كجم
            </p>
            <p className="min-w-0 break-words" style={specimenCss(draft, color?.hex)}>
              Golden basmati rice 3kg
            </p>

            {/*
              A price, because it is the string that most often breaks a face:
              the figures are what a shopper reads first and a three-decimal
              Kuwaiti price is the widest thing on a card.
            */}
            <p className="min-w-0 break-words" style={specimenCss(draft, color?.hex)}>
              AED 1,449.00
            </p>

            {pending ? (
              <span className="font-ui text-body-sm text-secondary">
                Loading this typeface for the preview.
              </span>
            ) : null}
          </div>
        </div>

        {/* Size, weight, style and colour on one line: four small decisions
            about the same style, and stacking them buried the specimen. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
              italicIsSynthetic(draft, catalog)
                ? `${draft.family} has no italic, so this will be slanted`
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

        {typefaceHint(offerable, draft.family) !== undefined ? (
          <span className="font-ui text-body-sm text-secondary">
            {typefaceHint(offerable, draft.family)}
          </span>
        ) : null}
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
 * The typeface list: the ones we have an opinion about, then the rest.
 *
 * **57 families, which is why this is a plain list and not a search box.** Every
 * offer book carries Arabic and Latin — the block schema refuses a static string
 * with `textEn` and no `textAr` — so a family that cannot draw both was never
 * offerable, and that single requirement takes Google's 1,955 down to 57. §3 of
 * `docs/fonts-from-google.md` planned for virtualization and a search field on
 * the assumption an English-only shop would see ~1,500; there is no such shop.
 *
 * The ten we wrote notes for stay pinned on top. A picker that opens on 57 names
 * with no opinion serves a shop owner worse than one that opens on ten good ones
 * with the rest underneath — and the notes are the part a category cannot
 * reproduce, because "narrow enough for a long price in a tight cell" is not
 * derivable from `sans-serif`.
 *
 * A family already on the style is always included even if it is somehow not in
 * the list, so opening the dialog can never silently change what is set.
 */
export function typefaceOptions(
  offerable: readonly OfferableFont[],
  current: string
): { value: string; label: string }[] {
  const known = new Set(offerable.map((font) => font.family))
  const rows = [
    ...offerable,
    ...(current && !known.has(current)
      ? [{ family: current, category: '', subsets: [], mirrored: true }]
      : []),
  ]

  return rows
    .sort((a, b) => {
      const ar = isRecommended(a.family)
      const br = isRecommended(b.family)
      if (ar !== br) return ar ? -1 : 1
      return a.family.localeCompare(b.family)
    })
    .map((font) => ({
      value: font.family,
      // The category is the only thing we can honestly say about a family
      // nobody has written a note for.
      label: isRecommended(font.family)
        ? font.family
        : `${font.family}${font.category ? ` (${font.category.replace('-', ' ')})` : ''}`,
    }))
}

/**
 * What to say under the control.
 *
 * **Choosing an unmirrored family is the slow path and the owner should know.**
 * It is 1.2s to 2.6s while the face is pulled from Google into our own storage,
 * once for the whole platform — the next shop to choose it waits for nothing.
 * Saying so turns an unexplained pause into an expected one.
 */
export function typefaceHint(
  offerable: readonly OfferableFont[],
  current: string
): string | undefined {
  if (offerable.length === 0) return 'No typefaces are available yet. Run the font mirror.'
  const font = offerable.find((f) => f.family === current)
  if (font && !font.mirrored) return 'New typeface. Saving will take a moment the first time.'
  return undefined
}
