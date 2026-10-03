import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { verifyRender, type RenderClaim, type RenderKitSource } from '@souqstudio/db'
import { LiveBlockPreview } from '@souqstudio/designer/components/blocks/BlockPreview'
import { FontCatalogProvider } from '@souqstudio/designer/components/brand/FontCatalogProvider'
import { renderKey, thumbnailBox } from '@souqstudio/designer/lib/block-thumbnail'
import { RenderStage } from '@/components/blocks/RenderStage'
import { kitForRender } from '@/lib/block-render'
import { loadBlockForRender } from '@/lib/blocks'
import { env } from '@/lib/env'
import { loadFontsForKit } from '@/lib/font-catalog-server'

export const metadata: Metadata = { title: 'Block render', robots: { index: false } }

// A signed, expiring URL is never worth caching, and the block it draws is
// whatever the row holds this second.
export const dynamic = 'force-dynamic'

/**
 * One block, drawn for the worker's headless browser to capture as its
 * thumbnail. Not a page anybody visits.
 *
 * **The live painter, on purpose.** The PNG has to be what the owner sees, so it
 * is `LiveBlockPreview` in a real browser with the shop's faces from R2, the
 * same component every list draws, rather than a server-side rendering that
 * would measure text differently. `lib/block-thumbnail.ts` in the designer
 * package has the rest.
 *
 * **Every failure is a 404**, including a missing secret and a bad signature:
 * the worker treats any of them as "do not store", and nobody else should learn
 * which one it was.
 */
export default async function RenderBlockPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const secret = env.RENDER_TOKEN_SECRET
  if (secret === undefined) return notFound()

  const dir = one(searchParams.dir)
  const expires = Number(one(searchParams.exp))
  const signature = one(searchParams.sig) ?? ''
  const shopId = one(searchParams.shop)
  const library = one(searchParams.library) === '1'

  if (dir !== 'ltr' && dir !== 'rtl') return notFound()
  if (!Number.isFinite(expires)) return notFound()

  const source: RenderKitSource | null =
    shopId !== undefined ? { shopId } : library ? { library: true } : null
  if (source === null) return notFound()

  const claim: RenderClaim = { blockId: params.id, kit: source, direction: dir, expires }
  if (!verifyRender(claim, signature, secret)) return notFound()

  const [block, kit] = await Promise.all([loadBlockForRender(params.id), kitForRender(source)])
  if (block === null || kit === null) return notFound()

  const { catalog, css } = await loadFontsForKit(kit)
  const box = thumbnailBox(block)

  return (
    <FontCatalogProvider catalog={catalog}>
      {css !== '' && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {/* Transparent around the block, so a tile's own ground shows through
          the corners exactly as it does behind the live preview. */}
      <style>{'html,body{background:transparent;margin:0}'}</style>
      <RenderStage
        renderKey={renderKey({ arrangements: block.arrangements, kit, direction: dir })}
        width={box.width}
        height={box.height}
      >
        <LiveBlockPreview
          arrangements={block.arrangements}
          kit={kit}
          width={box.width}
          height={box.height}
          direction={dir}
          assetBaseUrl={env.R2_PUBLIC_URL}
        />
      </RenderStage>
    </FontCatalogProvider>
  )
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
