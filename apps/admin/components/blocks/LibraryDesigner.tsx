'use client'

import type { Arrangement, BrandKit } from '@souqstudio/types'
import { DesignerShell } from '@souqstudio/designer/components/card-designer/DesignerShell'
import { FontCatalogProvider } from '@souqstudio/designer/components/brand/FontCatalogProvider'
import { Toaster } from '@souqstudio/designer/components/ui/toast'
import { DesignerHostProvider, type DesignerHost } from '@souqstudio/designer/lib/designer-host'
import type { ArtboardIdentity } from '@souqstudio/designer/lib/artboard-identity'
import type { FontCatalog } from '@souqstudio/designer/lib/font-catalog'

/**
 * The block designer, mounted over a library draft. E13-04.
 *
 * **The same designer the shop app mounts**, from `@souqstudio/designer`, and
 * drawn by the same painter. What this file adds is the host: saves, artwork
 * and shapes go to this app's `/api/v1/admin/blocks` routes, and the way out
 * leads back to the block's page in the console.
 *
 * Built here rather than passed from the page because a host carries functions,
 * and a server component cannot hand a function to a client one.
 */
export function LibraryDesigner({
  blockId,
  name,
  description,
  status,
  repeats,
  editable,
  arrangements,
  kit,
  identity,
  assetBaseUrl,
  fontCatalog,
}: {
  blockId: string
  name: string
  description: string | null
  status: string
  repeats: boolean
  editable: boolean
  arrangements: Arrangement[]
  kit: BrandKit
  identity: ArtboardIdentity
  assetBaseUrl: string
  fontCatalog: FontCatalog
}) {
  const host: DesignerHost = {
    blockUrl: (id) => `/api/v1/admin/blocks/${id}`,
    createUrl: '/api/v1/admin/blocks',
    designerHref: (id) => `/blocks/${id}/edit`,
    exit: { href: `/blocks/${blockId}`, label: 'Block' },
    shapeUrl: '/api/v1/admin/blocks/shape',
    assetsUrl: '/api/v1/admin/blocks/assets',
    artworkUrl: '/api/v1/admin/blocks/artwork',
    artworkVectorUrl: '/api/v1/admin/blocks/artwork/vector',
    // The library belongs to no shop, so there is no character and nothing
    // generated to offer.
    generatedUrl: null,
    availability: false,
    readOnlyNote:
      'Published library blocks are read-only. Duplicate this one to make a draft, then publish the draft under the same library id to replace it.',
  }

  return (
    <FontCatalogProvider catalog={fontCatalog}>
      <DesignerHostProvider host={host}>
        <DesignerShell
          blockId={blockId}
          name={name}
          description={description}
          status={status}
          repeats={repeats}
          editable={editable}
          arrangements={arrangements}
          kit={kit}
          identity={identity}
          assetBaseUrl={assetBaseUrl}
        />
      </DesignerHostProvider>
      <Toaster />
    </FontCatalogProvider>
  )
}
