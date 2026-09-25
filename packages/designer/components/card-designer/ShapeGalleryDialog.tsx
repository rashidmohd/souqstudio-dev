'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import type { ShapeArt } from '@souqstudio/types'
import { Dialog } from '../ui/dialog'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { cn } from '../../lib/utils'
import { SHAPE_GROUPS, type GalleryShape } from '../../lib/shape-gallery'
import { ShapeArtMark } from './ShapeArtMark'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where the published gallery is read from. See `DesignerHost.shapeGalleryUrl`. */
  url: string
  onPick: (art: ShapeArt) => void
}

/**
 * The shape gallery, as a dialog. E13-04.
 *
 * **A dialog rather than more rows in the panel**, because the gallery grows:
 * SouqStudio adds shapes as the market asks for them, and a pane that listed
 * every one would push the thirteen built-in shapes and the upload button out
 * of reach. The panel keeps the everyday shapes; this is where the rest are
 * browsed, by group or by name.
 *
 * Read on open rather than on mount, so a shape published while the designer
 * was open is there the next time somebody looks.
 */
export function ShapeGalleryDialog({ open, onOpenChange, url, onPick }: Props) {
  const [shapes, setShapes] = React.useState<GalleryShape[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [group, setGroup] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    let live = true
    setError(null)
    void fetch(url)
      .then((response) => response.json() as Promise<{ data: { shapes: GalleryShape[] } | null }>)
      .then((body) => {
        if (live) setShapes(body.data?.shapes ?? [])
      })
      .catch(() => {
        if (live) setError('The gallery could not be loaded. Close this and try again.')
      })
    return () => {
      live = false
    }
  }, [open, url])

  const needle = query.trim().toLowerCase()
  const visible = (shapes ?? []).filter(
    (shape) =>
      (group === '' || shape.group === group) &&
      (needle === '' ||
        shape.name.toLowerCase().includes(needle) ||
        (shape.occasion ?? '').includes(needle))
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Shape gallery"
      description="Shapes from SouqStudio. Each one takes your brand colours, like the shapes in the panel."
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Search"
            value={query}
            placeholder="crescent, arrow, badge"
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            label="Group"
            value={group}
            options={[
              { value: '', label: 'Every group' },
              ...SHAPE_GROUPS.map((g) => ({ value: g.value, label: g.label })),
            ]}
            onChange={(event) => setGroup(event.target.value)}
          />
        </div>

        {error !== null ? (
          <p role="status" className="font-ui text-body-sm text-critical-fg">
            {error}
          </p>
        ) : shapes === null ? (
          <p className="flex items-center gap-2 font-ui text-body-sm text-muted">
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
            Loading shapes…
          </p>
        ) : shapes.length === 0 ? (
          <p className="font-ui text-body-sm text-muted">
            No shapes in the gallery yet. The ones in the panel, and your own uploads, still work.
          </p>
        ) : visible.length === 0 ? (
          <p className="font-ui text-body-sm text-muted">
            Nothing matches. Try another word, or every group.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {visible.map((shape) => (
              <li key={shape.id}>
                <button
                  type="button"
                  title={shape.name}
                  onClick={() => {
                    onPick(shape.art)
                    onOpenChange(false)
                  }}
                  className={cn(
                    'flex w-full flex-col items-center gap-1 rounded-card border-hairline border-border-subtle p-2',
                    'text-secondary hover:bg-stone-100 hover:text-primary'
                  )}
                >
                  <ShapeArtMark art={shape.art} className="aspect-square w-full p-2" />
                  <span className="w-full truncate font-ui text-body-sm">{shape.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
