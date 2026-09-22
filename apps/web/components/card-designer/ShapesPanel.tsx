'use client'

import * as React from 'react'
import { Upload } from 'lucide-react'
import type { BlockElement, ShapeArt } from '@souqstudio/types'
import { SHAPE_VARIANTS, artShapeElement, shapeElement } from '@/lib/block-elements'
import { ShapeMark } from '@/components/card-designer/ShapeMark'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/**
 * Every shape, on a visible surface. E7.
 *
 * **The rail carries one shape and the kit has thirteen.** A burst is on the
 * rail because a burst is what an offer card is usually about; the ribbon, the
 * tag, the corner flash, the star and the arrow were reachable only by placing
 * some other shape and then finding the variant grid in the properties panel.
 * That is a route nobody discovers — an owner who wants a ribbon looks where
 * things are added, sees a square, a circle and a rule, and concludes the
 * product does not draw ribbons. Which is how they end up uploading one as
 * artwork, flat and unrecolourable, instead of placing the shape whose fill
 * they can change.
 *
 * **Here rather than on the rail**, because the rail is a strip of icons that
 * is already long and five more would make it a scroll. And **not behind a
 * flyout**: the design system's own rule is that every hover-revealed
 * affordance needs a persistent equivalent, since the editor ships on tablet
 * where hover does not exist — a menu holding something that exists nowhere
 * else is what `ContextMenu` is documented as never being.
 *
 * Each shape lands placed and coloured by `SHAPE_SEEDS`, and lands *selected*,
 * so the fill control in the properties panel is already pointed at the thing
 * the owner just made. That is the whole answer to "can I change the colour":
 * it is one glance away rather than a thing to go looking for.
 *
 * **The upload is in this section and not beside `Upload artwork` on the rail**,
 * because the difference between the two is not the file, it is what the file
 * becomes. The same SVG through the rail is rasterised and lands as a picture
 * with the colour its designer chose, frozen; through here it lands as a shape,
 * with the fill control and everything else a shape has. Putting them side by
 * side would make that a question about file formats. Putting this one under
 * the thirteen says what it is: another way to get a shape.
 */

type Props = {
  disabled: boolean
  onAdd: (element: BlockElement) => void
}

export function ShapesPanel({ disabled, onAdd }: Props) {
  const file = React.useRef<HTMLInputElement>(null)
  const [reading, setReading] = React.useState(false)

  /**
   * **The file is read here and posted as text.** It goes to the server because
   * the server is what decides whether this is a drawing, and what comes back
   * is geometry rather than a URL — there is nothing stored to point at.
   *
   * Every refusal is the route's own sentence, because the parser's refusals
   * name the thing in the file and what to do about it. "Convert the text to
   * outlines" is something an owner can do; "that file could not be used" is
   * something they can only wonder about.
   */
  async function upload(chosen: File) {
    setReading(true)
    try {
      const response = await fetch('/api/v1/blocks/shape', {
        method: 'POST',
        headers: { 'content-type': 'image/svg+xml' },
        body: await chosen.text(),
      })
      const body = (await response.json()) as {
        data: { art: ShapeArt } | null
        error: { message: string } | null
      }
      if (body.data === null) {
        toast({
          message: body.error?.message ?? 'That drawing could not be read.',
          tone: 'critical',
        })
        return
      }
      onAdd(artShapeElement(body.data.art))
    } catch {
      toast({ message: 'That drawing could not be read. Check your connection.', tone: 'critical' })
    } finally {
      setReading(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">Shapes</h2>

      {/*
        Four across: the widest that keeps a full-height control inside the
        pane at its narrowest, and it puts the three primitives and the burst
        on one row — which is the split the list is already ordered by.
      */}
      <ul className="grid grid-cols-4 gap-1">
        {SHAPE_VARIANTS.map((shape) => (
          <li key={shape.value}>
            <button
              type="button"
              // The pointer gets the native tooltip and the screen reader gets
              // the name, neither depending on a tooltip component that would
              // have to be built, positioned and dismissed. Same contract as
              // the rail's buttons, which sit two centimetres away.
              title={shape.label}
              aria-label={shape.label}
              disabled={disabled}
              onClick={() => onAdd(shapeElement(shape.value))}
              className="flex h-control-lg w-full items-center justify-center rounded-control text-secondary hover:bg-stone-100 disabled:opacity-disabled"
            >
              <ShapeMark variant={shape.value} />
            </button>
          </li>
        ))}
      </ul>

      <input
        ref={file}
        type="file"
        accept="image/svg+xml,.svg"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0]
          // Cleared before the upload, not after: an owner who picks the same
          // file twice gets no `change` event the second time otherwise, and
          // the control looks broken rather than busy.
          event.target.value = ''
          if (chosen !== undefined) void upload(chosen)
        }}
      />

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={disabled}
        loading={reading}
        onClick={() => file.current?.click()}
      >
        <Upload className="size-4" strokeWidth={1.75} aria-hidden="true" />
        Upload a shape
      </Button>

      <p className="font-ui text-body-sm text-muted">
        An SVG drawing becomes a shape you can recolour. Its own colours are not kept.
      </p>
    </section>
  )
}
