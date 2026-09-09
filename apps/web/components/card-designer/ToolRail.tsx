'use client'

import * as React from 'react'
import {
  BadgePercent,
  Circle,
  CircleDollarSign,
  Image as ImageIcon,
  ImagePlus,
  Minus,
  MousePointer2,
  PaintBucket,
  Ruler,
  Square,
  Stamp,
  Store,
  PanelLeftClose,
  PanelLeftOpen,
  Tag,
  Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BlockElement } from '@souqstudio/types'
import { BOUND_ELEMENTS, FREE_ELEMENTS } from '@/lib/block-elements'

/**
 * The tool rail. E7.
 *
 * **A strip of icons, because that is what everyone who has opened a design tool
 * already knows.** Photoshop, Illustrator, Figma and Canva all put a narrow
 * vertical rail of glyphs on the start edge, and a shop owner who has used any
 * of them arrives with a working mental model of where the shapes live. The
 * first version was a list of labelled cards — accurate, and it read as a form.
 * A form is what the owner rejected.
 *
 * The icons are the conventional ones and not invented: a paint bucket for a
 * ground, a square, a circle, a rule, a `T` for type. **The two that have no
 * convention are the two that are ours** — a product field and a price mark
 * exist in no other design tool — so those carry the catalog's own vocabulary
 * and sit in their own group.
 *
 * **Every button has a name.** An icon rail is fast for people who know it and
 * opaque for people who do not, and the difference between the two is a tooltip:
 * `title` for the pointer, `aria-label` for the screen reader, and a caption
 * under the group so nothing is guessed at.
 *
 * The bound group is tinted, which is one of the three places the design system
 * requires bound and static elements to be distinguishable — the other two being
 * the canvas outline and the layer list indicator.
 */

type Props = {
  repeats: boolean
  disabled: boolean
  /** `atBottom` puts the element behind everything already on the layout. */
  onAdd: (element: BlockElement, atBottom?: boolean) => void
  onUpload?: (() => void) | undefined
  uploading?: boolean
  /** True while nothing is selected — the pointer tool's resting state. */
  idle: boolean
  onSelectNone: () => void
  /** Whether the layer list beside the rail is showing. */
  layersOpen: boolean
  onToggleLayers: () => void
}

type Tool = {
  key: string
  label: string
  icon: LucideIcon
  make: () => BlockElement
  atBottom?: boolean
}

/** From the catalog. These change with every product the card is used for. */
const BOUND: Tool[] = [
  { key: 'product-image', label: 'Product photo', icon: ImageIcon, make: BOUND_ELEMENTS['product-image'] },
  { key: 'product-name', label: 'Product name', icon: Type, make: BOUND_ELEMENTS['product-name'] },
  { key: 'product-spec', label: 'Size or spec', icon: Ruler, make: BOUND_ELEMENTS['product-spec'] },
  { key: 'product-brand', label: 'Brand', icon: Tag, make: BOUND_ELEMENTS['product-brand'] },
  { key: 'price', label: 'Price', icon: CircleDollarSign, make: BOUND_ELEMENTS.price },
  { key: 'chip', label: 'Offer badge', icon: BadgePercent, make: BOUND_ELEMENTS.chip },
]

/** The same on every card, and the group whose icons everybody already knows. */
const FREE: Tool[] = [
  { key: 'text', label: 'Text', icon: Type, make: FREE_ELEMENTS.text },
  { key: 'background', label: 'Background', icon: PaintBucket, make: FREE_ELEMENTS.background, atBottom: true },
  { key: 'rectangle', label: 'Rectangle', icon: Square, make: FREE_ELEMENTS.rectangle },
  { key: 'ellipse', label: 'Circle', icon: Circle, make: FREE_ELEMENTS.ellipse },
  { key: 'line', label: 'Line', icon: Minus, make: FREE_ELEMENTS.line },
  { key: 'logo', label: 'Logo', icon: Stamp, make: FREE_ELEMENTS.logo },
  { key: 'shop-detail', label: 'Shop details', icon: Store, make: FREE_ELEMENTS['shop-detail'] },
]

export function ToolRail({
  repeats,
  disabled,
  onAdd,
  onUpload,
  uploading,
  idle,
  onSelectNone,
  layersOpen,
  onToggleLayers,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Tools"
      // A hairline on the *start* edge too. The rail sits directly against the
      // dashboard navigation, which is the one dark surface in the product, and
      // two panels meeting with no line between them read as one panel with a
      // colour change in the middle.
      className="flex w-tool-rail shrink-0 flex-col items-center gap-1 border-s-hairline border-e-hairline border-border-subtle bg-surface py-2"
    >
      {/* The pointer, first and always. It is the tool an owner returns to, and
          every one of these applications puts it at the top — here it clears the
          selection, which is what "back to just looking" means on this canvas. */}
      <ToolButton
        label="Select"
        icon={MousePointer2}
        active={idle}
        disabled={false}
        onClick={onSelectNone}
      />

      <Divider />

      {FREE.map((tool) => (
        <ToolButton
          key={tool.key}
          label={tool.label}
          icon={tool.icon}
          disabled={disabled}
          onClick={() => onAdd(tool.make(), tool.atBottom)}
        />
      ))}

      {onUpload ? (
        <ToolButton
          label="Upload artwork"
          icon={ImagePlus}
          disabled={disabled || uploading === true}
          onClick={onUpload}
        />
      ) : null}

      {repeats ? (
        <>
          <Divider />
          <span className="font-ui text-eyebrow uppercase text-muted">cat</span>
          {BOUND.map((tool) => (
            <ToolButton
              key={tool.key}
              label={tool.label}
              icon={tool.icon}
              disabled={disabled}
              bound
              onClick={() => onAdd(tool.make())}
            />
          ))}
        </>
      ) : null}

      {/*
        The panel toggle, last and below a divider — it is chrome rather than a
        tool, and grouping it with the shapes would say it makes something.

        **It lives on the rail because the rail is what survives the collapse.**
        A toggle inside the layer list can only ever close it; the way back has
        to be somewhere that is still on screen, which is the same reason the
        dashboard navigation keeps its own toggle on the strip rather than in
        the panel.
      */}
      <Divider />
      <ToolButton
        label={layersOpen ? 'Hide layers' : 'Show layers'}
        icon={layersOpen ? PanelLeftClose : PanelLeftOpen}
        active={!layersOpen}
        disabled={false}
        onClick={onToggleLayers}
      />
    </div>
  )
}

const Divider = () => (
  <span className="my-1 h-px w-4 bg-border-subtle" aria-hidden="true" />
)

/**
 * One tool.
 *
 * `title` and `aria-label` carry the same string on purpose: the pointer gets
 * the native tooltip, the screen reader gets the name, and neither depends on a
 * tooltip component that would have to be built, positioned and dismissed.
 */
function ToolButton({
  label,
  icon: Icon,
  disabled,
  active,
  bound,
  onClick,
}: {
  label: string
  icon: LucideIcon
  disabled: boolean
  active?: boolean
  bound?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex size-control-lg items-center justify-center rounded-control',
        active === true ? 'bg-selected-bg text-selected-fg' : 'text-secondary hover:bg-stone-100',
        'disabled:opacity-disabled',
      ].join(' ')}
    >
      <Icon
        className={bound === true ? 'size-4 text-link' : 'size-4'}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    </button>
  )
}
