'use client'

import * as React from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { MachineOutput } from '../ui/machine-output'
import { cn } from '../../lib/utils'

/**
 * Choosing artwork for a block. E7-C.
 *
 * **The upload button used to open a file dialog, and that was the whole
 * feature.** Every use of a piece of artwork was a fresh upload: an owner who
 * put their badge on one block re-uploaded it for the next, and each one left
 * another object in the bucket that nothing could list. `block_assets` is what
 * makes this screen possible — a key can be drawn but not found.
 *
 * **One grid, two collections, and the seeded half is not a separate screen.**
 * The same shape `/brand/blocks` uses: the motifs we ship and the artwork the
 * shop uploaded sit together, marked, because at the moment of choosing a
 * crescent an owner does not care who drew it. `BlockImportDialog` learned the
 * opposite lesson about *blocks* — sixty-seven of ours drowned four of theirs —
 * and it does not apply here yet, where the shipped set is small and the owner's
 * is the one that grows.
 *
 * Tiles draw at each asset's own proportion inside a shared box, which is why
 * the row carries `width` and `height`. A grid of squares would say a wide
 * banner and a round badge are the same object.
 *
 * **And a third collection, which is the one an owner paid for.** Their covers,
 * their character and its poses were generated, stored at an R2 key like every
 * other picture here, and offered *nowhere* — `block_assets` holds uploads, and
 * no generated image has ever had a row on it. So a shop could put a crescent we
 * shipped on a card and could not put its own mascot there. They come from
 * `/api/v1/brand/generated`, which the book editor's background picker reads
 * too, and they arrive as keys that need nothing else in this screen to change.
 */

export type Artwork = {
  id: string
  key: string
  name: string
  width: number
  height: number
  seeded: boolean
  url: string
}

/**
 * One generated picture, as `/api/v1/brand/generated` sends it.
 *
 * **It is not an `Artwork` and is not converted into one.** An artwork row
 * carries pixel dimensions, read back off the object after the upload; a
 * generated image is described by the shape it was drawn at, which is a ratio
 * rather than a size. Flattening the two would mean inventing numbers for one of
 * them, and the only thing either is used for here is drawing a tile. The route
 * sends more than this — a cover's ratio and shape, which the book editor's
 * picker needs and this screen does not — and the extra fields are simply left
 * undeclared rather than carried around unused.
 */
type Generated = {
  id: string
  kind: 'cover' | 'character' | 'pose'
  key: string
  url: string
  label: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Adds an element for this asset and closes. */
  onPick: (assetId: string) => void
  /** Uploads a new file, records it, and returns its key. */
  onUpload: (file: File) => Promise<string | null>
}

const TILE = 120

export function ArtworkDialog({ open, onOpenChange, onPick, onUpload }: Props) {
  const [assets, setAssets] = React.useState<Artwork[] | null>(null)
  const [generated, setGenerated] = React.useState<Generated[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fileInput = React.useRef<HTMLInputElement | null>(null)

  // Read on open rather than on mount: the designer holds this component for the
  // life of the screen, and artwork uploaded in another tab should show up the
  // next time the owner comes looking rather than only after a reload.
  React.useEffect(() => {
    if (!open) return
    let live = true
    setError(null)
    void fetch('/api/v1/blocks/assets')
      .then((response) => response.json() as Promise<{ data: { assets: Artwork[] } | null }>)
      .then((body) => {
        if (live) setAssets(body.data?.assets ?? [])
      })
      .catch(() => {
        if (live) setError('That list could not be loaded.')
      })
    /*
     * **A second request rather than one route serving both.** The two lists are
     * scoped differently and neither can be widened to the other: artwork
     * belongs to the organization, and a generated image belongs to the shop
     * whose character is in it. A shop that does not have one is not an error
     * here — the grid simply shows the uploads, as it always did.
     */
    void fetch('/api/v1/brand/generated')
      .then((response) => response.json() as Promise<{ data: { images: Generated[] } | null }>)
      .then((body) => {
        if (live) setGenerated(body.data?.images ?? [])
      })
      .catch(() => undefined)

    return () => {
      live = false
    }
  }, [open])

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    const key = await onUpload(file)
    setBusy(false)
    if (key === null) {
      setError('That file could not be uploaded.')
      return
    }
    onOpenChange(false)
  }

  const mine = assets?.filter((asset) => !asset.seeded) ?? []
  const shipped = assets?.filter((asset) => asset.seeded) ?? []
  // Covers first, then the character, then its poses — most page-sized to least,
  // which is also the order an owner made them in.
  const covers = generated.filter((image) => image.kind === 'cover')
  const characters = generated.filter((image) => image.kind !== 'cover')

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Artwork"
      description="Anything you have uploaded or generated before, ready to use again."
    >
      <div className="flex flex-col gap-4">
        <div>
          <Button type="button" loading={busy} onClick={() => fileInput.current?.click()}>
            <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Upload a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file !== undefined) void upload(file)
            }}
          />
          <p className="mt-1 font-ui text-body-sm text-muted">
            PNG, JPG, WebP or SVG. An SVG is turned into an image on the way in.
          </p>
        </div>

        {error !== null ? (
          <p role="status" className="font-ui text-body-sm text-critical-fg">
            {error}
          </p>
        ) : null}

        {assets === null ? (
          <p className="flex items-center gap-2 font-ui text-body-sm text-muted">
            <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
            Loading your artwork…
          </p>
        ) : assets.length === 0 && generated.length === 0 ? (
          // **Not an illustrated empty state.** The action that fills this is
          // the button directly above it, already on screen; a picture between
          // the two would put furniture in the way of the one thing to do.
          <p className="font-ui text-body-sm text-muted">
            Nothing yet. Upload a file and it will be here for every block after
            this one.
          </p>
        ) : (
          <>
            <Group label="Yours" assets={mine} onPick={onPick} />
            {/*
              **Marked as generated, because it is.** The design system requires
              anything a machine drew to be identifiable as such wherever it is
              shown, and a picker is where an owner decides to print it on a
              flyer that reaches thousands of their customers.
            */}
            <GeneratedGroup label="Generated covers" images={covers} onPick={onPick} />
            <GeneratedGroup
              label="Your character and poses"
              images={characters}
              onPick={onPick}
            />
            <Group label="From SouqStudio" assets={shipped} onPick={onPick} />
          </>
        )}
      </div>
    </Dialog>
  )
}

function Group({
  label,
  assets,
  onPick,
}: {
  label: string
  assets: Artwork[]
  onPick: (assetId: string) => void
}) {
  if (assets.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-ui text-eyebrow uppercase tracking-wide text-secondary">{label}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {assets.map((asset) => (
          <li key={asset.id}>
            <button
              type="button"
              onClick={() => onPick(asset.key)}
              className={cn(
                'flex w-full flex-col gap-2 rounded-card border-hairline border-border-subtle p-2 text-start',
                'hover:bg-stone-100'
              )}
            >
              <span
                className="flex items-center justify-center overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0"
                style={{ height: TILE }}
              >
                {/* A plain `img`, not `next/image`: the source is an R2 URL on a
                    custom domain and the tile is 120px. Routing it through the
                    optimiser would add a server hop to draw a thumbnail. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </span>
              <span className="truncate font-ui text-label font-medium text-primary">
                {asset.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The generated collections, with the machine mark on them.
 *
 * A separate component from `Group` rather than a prop on it: the rows are a
 * different shape — a ratio where an artwork has pixels — and the whole section
 * is wrapped in `MachineOutput`, which `Group` must never gain, because it also
 * renders the artwork an owner drew and uploaded themselves.
 */
function GeneratedGroup({
  label,
  images,
  onPick,
}: {
  label: string
  images: Generated[]
  onPick: (assetId: string) => void
}) {
  if (images.length === 0) return null

  return (
    <MachineOutput label={label}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={() => onPick(image.key)}
              className={cn(
                'flex w-full flex-col gap-2 rounded-card border-hairline border-border-subtle p-2 text-start',
                'hover:bg-stone-100'
              )}
            >
              {/* The same 120px box the uploads use, and `contain` inside it, so
                  the picture letterboxes at its own proportions rather than
                  being cropped to fill: a character is a figure standing on a
                  plain ground, and a tile that crops cuts its feet off. */}
              <span
                className="flex items-center justify-center overflow-hidden rounded-control border-hairline border-border-subtle bg-stone-0"
                style={{ height: TILE }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </span>
              <span className="truncate font-ui text-label font-medium text-primary">
                {image.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </MachineOutput>
  )
}
