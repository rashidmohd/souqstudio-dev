import Link from 'next/link'
import type { Arrangement, BrandKit } from '@souqstudio/types'
import { BlockPreview } from '@souqstudio/designer/components/blocks/BlockPreview'
import { previewAspect } from '@souqstudio/designer/lib/preview-shape'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'

/** The logical canvas a preview is laid out at; the tile scales it to fit. */
const PREVIEW_EDGE = 320

/**
 * One block in the console's grid: what it looks like, then what it is.
 * E13-04.
 *
 * **Drawn, not described.** The list was a table of names, and a library of
 * seventy blocks, most called something like "Offer card, bold", is found by
 * eye. The picture comes from the same painter the designer and the shop app
 * use (`BlockPreview` in `@souqstudio/designer`), in the stand-in shop's
 * colours, so what the tile shows is what a shop gets in its own.
 *
 * A server component around a client preview: only the preview needs the
 * browser, for font metrics.
 */
export function BlockCard({
  id,
  name,
  category,
  status,
  repeats,
  occasion,
  ownerName,
  libraryId,
  arrangements,
  kit,
  assetBaseUrl,
}: {
  id: string
  name: string
  category: string | null
  status: string
  repeats: boolean
  occasion: string | null
  /** Null for SouqStudio's own blocks. */
  ownerName: string | null
  /** The block's `blk_` id when it has one. */
  libraryId: string | null
  /** Null when the stored document does not parse: the tile says so. */
  arrangements: Arrangement[] | null
  kit: BrandKit
  assetBaseUrl: string
}) {
  const aspect = arrangements === null ? 1 : previewAspect({ repeats, arrangements })
  const width = aspect >= 1 ? PREVIEW_EDGE : Math.round(PREVIEW_EDGE * aspect)
  const height = aspect >= 1 ? Math.round(PREVIEW_EDGE / aspect) : PREVIEW_EDGE

  return (
    <Link
      href={`/blocks/${id}`}
      className="flex flex-col gap-2 rounded-card border border-border-subtle p-2 hover:bg-surface-hover"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-chip bg-stone-100 p-2">
        {arrangements === null ? (
          <p className="text-body-sm text-critical-fg">The document does not parse.</p>
        ) : (
          <BlockPreview
            arrangements={arrangements}
            kit={kit}
            width={width}
            height={height}
            assetBaseUrl={assetBaseUrl}
            className="h-full w-full"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-body font-medium text-primary" title={name}>
          {name}
        </span>
        <span className="truncate text-body-sm text-secondary">
          {category ?? 'No group'}
          {repeats ? ', repeating' : ', placed once'}
        </span>
        <div className="flex flex-wrap gap-1">
          {status === 'published' ? (
            <StatusPill tone="positive">Published</StatusPill>
          ) : status === 'archived' ? (
            <StatusPill tone="quiet">Archived</StatusPill>
          ) : (
            <StatusPill tone="caution">Draft</StatusPill>
          )}
          {occasion === null ? null : <StatusPill tone="neutral">{occasion}</StatusPill>}
          {ownerName === null ? null : (
            <StatusPill tone="quiet">
              <span className="block max-w-full truncate" title={ownerName}>
                {ownerName}
              </span>
            </StatusPill>
          )}
        </div>
        {libraryId === null ? null : (
          <Figure size="data-sm" className="truncate text-muted">
            {libraryId}
          </Figure>
        )}
      </div>
    </Link>
  )
}
