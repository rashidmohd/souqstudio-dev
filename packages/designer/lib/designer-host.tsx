'use client'

import * as React from 'react'

/**
 * What the designer needs from the app it is mounted in.
 *
 * **One designer, two hosts.** `apps/web` mounts it over a shop's own blocks
 * and `apps/admin` mounts it over SouqStudio's library drafts. Everything the
 * two disagree on is here: where a save goes, where artwork is stored, where
 * the way out leads, and whether the block's availability is the author's to
 * set. The canvas, the painter and every control are the same code, because a
 * second designer is a second painter and that is how the PDF stops matching
 * the screen.
 *
 * **The default is the shop app**, so `apps/web` mounts the designer without a
 * provider and nothing it did before changed.
 *
 * Every endpoint keeps the shop route's request and response shape. A host
 * that serves them from somewhere else serves the same contract.
 */
export type DesignerHost = {
  /** PATCH `{ name, status, arrangements }`. */
  blockUrl: (blockId: string) => string
  /** POST `{ fromId, name }`, answers `{ data: { id } }`. */
  createUrl: string
  /** Where a block opens in this host's designer, for a duplicate. */
  designerHref: (blockId: string) => string
  /** The designer's way out on its own route. */
  exit: { href: string; label: string }
  /** POST an SVG body, answers `{ data: { art } }`. */
  shapeUrl: string
  /**
   * GET the published shape gallery, `{ data: { shapes: GalleryShape[] } }`.
   * Null hides the gallery button.
   */
  shapeGalleryUrl: string | null
  /** GET `{ data: { assets } }`; POST `{ assetId, filename }` records an upload. */
  assetsUrl: string
  /** POST `{ contentType, contentLength }`, answers a presigned PUT. */
  artworkUrl: string
  /** POST an SVG body, rasterised and recorded on the server. */
  artworkVectorUrl: string
  /**
   * The shop's generated pictures, or null where there are none to offer. The
   * library has no shop and so no character to have generated anything with.
   */
  generatedUrl: string | null
  /**
   * Generative fill: GET `{ data: { creditsCost, balance } }`, POST a
   * `FillRequest` answering `{ data: { jobId } }`. Null hides the button. The
   * library has no shop to write for and no credits to charge.
   */
  fillUrl: string | null
  /**
   * Whether the author sets the block's availability from inside the designer.
   *
   * A shop does: it decides which of its own blocks new books may use. The
   * library does not: a library block reaches shops by being published and
   * synced, and a draft marked "available" here would either reach every shop
   * unreviewed or be pruned by the next sync.
   */
  availability: boolean
  /** Said above the canvas when the block opens read-only: why, and what to do. */
  readOnlyNote: string
}

export const SHOP_HOST: DesignerHost = {
  blockUrl: (blockId) => `/api/v1/blocks/${blockId}`,
  createUrl: '/api/v1/blocks',
  designerHref: (blockId) => `/card-designer/${blockId}`,
  exit: { href: '/blocks', label: 'Blocks' },
  shapeUrl: '/api/v1/blocks/shape',
  shapeGalleryUrl: '/api/v1/shapes',
  assetsUrl: '/api/v1/blocks/assets',
  artworkUrl: '/api/v1/blocks/artwork',
  artworkVectorUrl: '/api/v1/blocks/artwork/vector',
  generatedUrl: '/api/v1/brand/generated',
  fillUrl: '/api/v1/blocks/fill',
  availability: true,
  readOnlyNote:
    'This block comes with every account, so it is read-only. Duplicate it to make a version of your own.',
}

const HostContext = React.createContext<DesignerHost>(SHOP_HOST)

export function DesignerHostProvider({
  host,
  children,
}: {
  host: DesignerHost
  children: React.ReactNode
}) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>
}

export function useDesignerHost(): DesignerHost {
  return React.useContext(HostContext)
}
