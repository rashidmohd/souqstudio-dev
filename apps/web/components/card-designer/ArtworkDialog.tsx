'use client'

import * as React from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Artwork"
      description="Anything you have uploaded before, ready to use again."
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
        ) : assets.length === 0 ? (
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
