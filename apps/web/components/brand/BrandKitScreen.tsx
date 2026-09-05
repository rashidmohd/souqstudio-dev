'use client'

import * as React from 'react'
import Link from 'next/link'
import type { Arrangement, BrandKit, BrandOverride } from '@souqstudio/types'
import type { BrandFacet, BrandLevel } from '@/lib/brand-inheritance'
import { Button } from '@/components/ui/button'
import { LogoField } from '@/components/brand/LogoField'
import { ColorFields, firstInvalidColorSlot } from '@/components/brand/ColorFields'
import { palettePatch, resolvePalette } from '@/lib/brand-palette'
import { TypographyFields } from '@/components/brand/TypographyFields'
import { Card } from '@/components/ui/card'
import { IconChip } from '@/components/ui/icon-chip'
import { BlockPreview } from '@/components/blocks/BlockPreview'
import { Image as ImageIcon, Palette, Shapes, Type, type LucideIcon } from 'lucide-react'
import { resolveTextStyles, typographyPatch } from '@/lib/brand-typography'
import { ResetBrandDialog } from '@/components/brand/ResetBrandDialog'
import { useBrandStore } from '@/stores/brand-store'
import { EXAMPLE_HEX } from '@/lib/color'

type Props = {
  shopId: string
  shopName: string
  logoUrl: string | null
  brandKit: BrandKit
  brandOverride: BrandOverride
  source: Record<BrandFacet, BrandLevel>
  canEdit: boolean
  isOwner: boolean
  /** The seeded library. Published rows, identical for every shop. */
  blocks: Array<{
    id: string
    name: string
    description: string | null
    repeats: boolean
    arrangements: Arrangement[]
  }>
}

/** Which section a save or an error belongs to. */
type SaveSection = 'colors' | 'typography'

/**
 * The brand kit, editable. E4-05.
 *
 * **Two editable sections.** Logo and colours are the facets an owner can act
 * on today. Typography is the third facet in `lib/brand-inheritance.ts` and has
 * no picker yet — it needs the OFL families mirrored to R2 first, per the known
 * gap in CLAUDE.md — so it appears in "where this brand comes from" and nowhere
 * else. There was a Layout section here; a brand kit carries no grid and no
 * template any more, and a book picks its own. See `docs/composition-model.md`
 * §2. Facets share a section and one
 * save — they cannot be inherited separately, and splitting them would imply
 * they could. (`progress`, the fourth facet, is the wizard's own state and
 * belongs to nobody's settings screen.)
 *
 * **One card per thing an owner sets** — logo, colours, typography, blocks.
 * Each carries its own icon, its explanation, what is currently chosen, and its
 * control. It replaced a stack of plain sections and a separate summary card at
 * the top: the summary was restating what each section already knew, and a
 * wizard-shaped flow is wrong for something edited for the life of the shop.
 *
 * **Saves are per card, and mount only when that card is dirty**, so the
 * screen has at most one primary button visible in practice. E2-pending §1
 * flags the shop detail page for showing three at once; this is the same shape
 * with the dirty gate doing the work.
 *
 * The logo section has no save because it does not need one:
 * `POST /api/v1/brand/logo` has already written the logo through by the time
 * the upload returns.
 */
export function BrandKitScreen({
  shopId,
  shopName,
  logoUrl,
  brandKit,
  brandOverride,
  source,
  canEdit,
  isOwner,
  blocks,
}: Props) {
  const { kit, hydrate } = useBrandStore()

  // What the server has. Saves advance it; the dirty gates compare against it.
  const [baseline, setBaseline] = React.useState<BrandKit>(brandKit)
  const [saving, setSaving] = React.useState<SaveSection | null>(null)
  const [feedback, setFeedback] = React.useState<{
    section: SaveSection
    kind: 'error' | 'saved'
    message: string
  } | null>(null)

  // Seeded during render rather than in an effect, so the first paint already
  // has the kit. The store is module-global and survives client-side
  // navigation, so without this a previous visit's colours paint for a frame.
  const hydrated = React.useRef(false)
  if (!hydrated.current) {
    useBrandStore.setState({ kit: brandKit, logoUrl, shopName })
    hydrated.current = true
  }

  React.useEffect(() => {
    hydrate({ kit: brandKit, logoUrl, shopName })
    setBaseline(brandKit)
  }, [brandKit, logoUrl, shopName, hydrate])

  const palette = resolvePalette(kit)
  const baselinePalette = resolvePalette(baseline)
  const colorsDirty =
    palette.length !== baselinePalette.length ||
    palette.some((color, index) => {
      const was = baselinePalette[index]
      return was === undefined || was.hex !== color.hex || was.name !== color.name
    })

  const styles = resolveTextStyles(kit)
  const baselineStyles = resolveTextStyles(baseline)
  const typographyDirty =
    styles.length !== baselineStyles.length ||
    styles.some((style, index) => {
      const was = baselineStyles[index]
      return was === undefined || JSON.stringify(was) !== JSON.stringify(style)
    })

  async function save(section: SaveSection, patch: Partial<BrandKit>) {
    setSaving(section)
    setFeedback(null)
    try {
      const res = await fetch('/api/v1/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const result = await res.json()
      if (result.error) {
        setFeedback({ section, kind: 'error', message: result.error.message })
        return
      }
      setBaseline((previous) => ({ ...previous, ...patch }))
      setFeedback({ section, kind: 'saved', message: 'Saved.' })
    } catch {
      setFeedback({
        section,
        kind: 'error',
        message: 'Could not reach the server. Check your connection and try again.',
      })
    } finally {
      setSaving(null)
    }
  }

  function saveColors() {
    // Empty and unreadable are different mistakes and get different sentences.
    // A colour the owner just cleared should not be told it is unparseable.
    const empty = palette.find((color) => color.hex.trim() === '')
    if (empty) {
      setFeedback({
        section: 'colors',
        kind: 'error',
        message: `Pick a colour for ${empty.name} before saving.`,
      })
      return
    }

    // The same guard the wizard's Continue button runs, from the same function.
    const bad = firstInvalidColorSlot(kit)
    if (bad) {
      setFeedback({
        section: 'colors',
        kind: 'error',
        message: `${bad.label} is not a colour we can read. Use something like ${EXAMPLE_HEX}.`,
      })
      return
    }

    const unnamed = palette.find((color) => color.name.trim() === '')
    if (unnamed) {
      setFeedback({
        section: 'colors',
        kind: 'error',
        message: 'Give every colour a name — it is how you will recognise it later.',
      })
      return
    }

    void save('colors', palettePatch(palette))
  }

  return (
    <div className="flex flex-col gap-6">
      {brandOverride === 'inherit' ? (
        // The one thing about this screen that genuinely surprises people:
        // `patchBrandAtLevel` routes an inheriting shop's edits to the
        // *organization's* kit, which is the kit it is showing. Correct, and
        // not something to discover after the fact.
        <p
          role="status"
          className="rounded-control bg-caution-bg px-3 py-2 font-ui text-body-sm text-caution-fg"
        >
          This shop uses your organization’s brand. Anything you change here
          changes it for every shop that follows it.
        </p>
      ) : null}

      {!canEdit ? (
        <p className="font-ui text-body-sm text-muted">
          You need to be a manager of this shop to change its brand.
        </p>
      ) : (
        <>
          <BrandCard
            icon={ImageIcon}
            title="Logo"
            description="Used on the header, the footer and the cover of every offer book."
            state={logoUrl ? 'Uploaded' : 'Not set yet'}
            note={brandOverride === 'inherit' ? null : sourceNote(source.logo)}
          >
            <LogoField variant="secondary" />
          </BrandCard>

          <BrandCard
            icon={Palette}
            title="Colours"
            description="Your colours, under your own names. Where each one goes is decided by the blocks that use it."
            state={<><span data-figure>{palette.length}</span> colours</>}
            note={brandOverride === 'inherit' ? null : sourceNote(source.colors)}
            feedback={feedback?.section === 'colors' ? feedback : null}
          >
            <ColorFields />

            {colorsDirty ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  loading={saving === 'colors'}
                  onClick={saveColors}
                >
                  Save colours
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    useBrandStore.getState().setPalette(baselinePalette)
                    setFeedback(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </BrandCard>

          <BrandCard
            icon={Type}
            title="Typography"
            description="Your text styles, under your own names. Each carries its own typeface, size, weight and colour."
            state={<><span data-figure>{styles.length}</span> styles</>}
            note={brandOverride === 'inherit' ? null : sourceNote(source.typography)}
            feedback={feedback?.section === 'typography' ? feedback : null}
          >
            <TypographyFields />

            {typographyDirty ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  loading={saving === 'typography'}
                  onClick={() => void save('typography', typographyPatch(styles))}
                >
                  Save typography
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    useBrandStore.getState().setTextStyles(baselineStyles)
                    setFeedback(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </BrandCard>

          {/* The fourth facet of a kit is what it builds with. A kit holds no
              layout — a book picks its own grid — but the blocks it draws with
              are the shop's, and this is where they will live. Disabled with
              the reason visible rather than omitted, the same rule the left
              rail follows for an unbuilt destination. */}
          <BrandCard
            icon={Shapes}
            title="Blocks"
            description="The building blocks your offer books are made of — an offer card, a header, a footer."
            state={<><span data-figure>{blocks.length}</span> blocks</>}
            note={null}
          >
            {/* Drawn in this shop's palette and typefaces, against the longest
                name and a three-decimal price in the catalog. A preview built
                from friendly data tells an owner their card works and lets the
                real catalog prove otherwise. */}
            <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
              {blocks.map((block) => (
                <li key={block.id} className="flex flex-col gap-2">
                  <div className="overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0">
                    {/* Natural aspect per block, not one forced on all four: a
                        hero band letterboxed into a card's shape is not what
                        the owner will get. The offer card shows tall, the bands
                        show wide, and the engine picks the arrangement to
                        match — which is the behaviour worth previewing. */}
                    <BlockPreview
                      arrangements={block.arrangements}
                      kit={kit}
                      width={420}
                      height={block.repeats ? 540 : 170}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-ui text-label font-medium text-primary">{block.name}</span>
                    {block.description ? (
                      <span className="font-ui text-body-sm text-muted">{block.description}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <p className="font-ui text-body-sm text-muted">
              These come with every account. Designing your own arrives with the
              offer book editor.
            </p>
          </BrandCard>

        </>
      )}

      <InheritanceSection
        shopId={shopId}
        shopName={shopName}
        brandOverride={brandOverride}
        source={source}
        isOwner={isOwner}
      />
    </div>
  )
}

function sourceNote(level: BrandLevel): string {
  return level === 'org'
    ? 'From your organization — changing it changes every shop that inherits it.'
    : 'Set on this shop.'
}

function BrandCard({
  icon: Icon,
  title,
  description,
  state,
  note,
  feedback,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  /**
   * What the owner has chosen, in a few words. The card answers it at a glance.
   *
   * A node rather than a string, because any figure in it needs `[data-figure]`
   * — an interpolated numeral visually reorders inside Arabic text, and this
   * shipped as "3 colours" rendering as "colours 3".
   */
  state: React.ReactNode
  note?: string | null
  feedback?: { kind: 'error' | 'saved'; message: string } | null
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <IconChip icon={Icon} />

        <div className="flex min-w-0 flex-col gap-1">
          {/* `font-ui`, not `font-display`. Host Grotesk has no Arabic and the
              checklist caps it at two appearances a screen — the page title and
              an empty state. One card heading is four on this screen. */}
          <h2 className="font-ui text-heading text-primary">{title}</h2>
          <p className="font-ui text-body-sm text-secondary">{description}</p>
          <p className="truncate font-ui text-body-sm text-primary">{state}</p>
          {note ? <p className="font-ui text-body-sm text-muted">{note}</p> : null}
        </div>
      </div>

      {/* Inline banners rather than toasts: `Toast` has a signature in the
          component inventory and no mounting mechanism — no provider, portal or
          store — and building one here would invent a second API. */}
      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={
            feedback.kind === 'error'
              ? 'rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg'
              : 'rounded-control bg-positive-bg px-3 py-2 font-ui text-body-sm text-positive-fg'
          }
        >
          {feedback.message}
        </p>
      ) : null}

      {children}
    </Card>
  )
}

const FACET_LABEL = {
  logo: 'Logo',
  colors: 'Colours',
  typography: 'Typography',
} as const

const LEVEL_SENTENCE: Record<BrandOverride, string> = {
  inherit: 'This shop uses your organization’s brand for everything.',
  logo: 'This shop has its own logo. Its colours and typography come from your organization.',
  colors: 'This shop has its own colours. Its logo and typography come from your organization.',
  full: 'This shop sets its own logo, colours and typography. Nothing is inherited.',
}

/**
 * Where the brand comes from, and the way out of it.
 *
 * **Read-only about inheritance, on purpose.** `brandOverride` has exactly one
 * editing surface — `BrandOverrideField` on shop settings — and putting a
 * second set of radio cards here would be two controls for one column. This
 * states the answer and links to the control.
 *
 * The reset below it is the other half: shop settings can switch a shop back to
 * `inherit` reversibly, and this deletes the kit it was leaving behind.
 */
function InheritanceSection({
  shopId,
  shopName,
  brandOverride,
  source,
  isOwner,
}: {
  shopId: string
  shopName: string
  brandOverride: BrandOverride
  source: Record<BrandFacet, BrandLevel>
  isOwner: boolean
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-ui text-heading text-primary">Where this brand comes from</h2>
        <p className="font-ui text-body-sm text-secondary">{LEVEL_SENTENCE[brandOverride]}</p>
      </div>

      <dl className="flex flex-col gap-1">
        {(['logo', 'colors', 'typography'] as const).map((facet) => (
          <div key={facet} className="flex items-baseline justify-between gap-3">
            <dt className="font-ui text-body-sm text-secondary">{FACET_LABEL[facet]}</dt>
            <dd className="font-ui text-body-sm text-primary">
              {source[facet] === 'org' ? 'From your organization' : 'Set on this shop'}
            </dd>
          </div>
        ))}
      </dl>

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/settings/shops/${shopId}`}
            className="font-ui text-body-sm text-link underline-offset-2 hover:underline"
          >
            Change what this shop inherits
          </Link>

          {brandOverride === 'inherit' ? null : (
            <ResetBrandDialog shopName={shopName} />
          )}
        </div>
      ) : null}
    </section>
  )
}
