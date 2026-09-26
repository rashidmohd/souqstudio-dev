import Image from 'next/image'
import { notFound } from 'next/navigation'
import { listFonts, prisma } from '@souqstudio/db'
import { toArrangements } from '@souqstudio/engine'
import { BlockPreview } from '@souqstudio/designer/components/blocks/BlockPreview'
import { FontCatalogProvider } from '@souqstudio/designer/components/brand/FontCatalogProvider'
import { fontsForKit } from '@souqstudio/designer/lib/font-registry'
import { LIBRARY_PREVIEW_KIT } from '@souqstudio/designer/lib/library-preview'
import { previewAspect } from '@souqstudio/designer/lib/preview-shape'
import { requireAdmin, roleAtLeast } from '@/lib/admin-auth'
import { summarize } from '@/lib/block-summary'
import { libraryConfig } from '@/lib/library-client'
import { env } from '@/lib/env'
import { OCCASIONS } from '@souqstudio/engine'
import { OccasionField } from '@/components/blocks/OccasionField'
import { PublishPanel } from '@/components/blocks/PublishPanel'
import { RemoveBlock } from '@/components/blocks/RemoveBlock'
import { PageHeader } from '@/components/shared/PageHeader'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * One block, and the console that publishes it. E13-04.
 *
 * **Drawn, then described.** The preview and every layout come from the shared
 * painter (`BlockPreview`) in a stand-in shop's colours; editing is the
 * designer's job, at `/blocks/[id]/edit` for SouqStudio's own blocks. The
 * description (lib/block-summary.ts) says what the picture cannot: bindings,
 * versions, pins.
 */
export const dynamic = 'force-dynamic'

const LIBRARY_ID = /^blk_[a-z0-9_]+$/

export default async function BlockPage({ params }: { params: { id: string } }) {
  const { admin } = await requireAdmin()

  const block = await prisma.block.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      status: true,
      repeats: true,
      isSeasonal: true,
      occasion: true,
      planTier: true,
      identityPin: true,
      thumbnailUrl: true,
      arrangements: true,
      organizationId: true,
      createdAt: true,
      updatedAt: true,
      organization: { select: { name: true } },
      _count: { select: { versions: true, pins: true } },
    },
  })

  if (block === null) notFound()

  const summary = summarize(block.arrangements)
  const arrangements = toArrangements(block.arrangements)
  const { catalog, css } = fontsForKit(await listFonts(), LIBRARY_PREVIEW_KIT)

  /** A logical canvas at `aspect`, which the preview scales to its box. */
  const canvas = (aspect: number) =>
    aspect >= 1
      ? { width: 480, height: Math.round(480 / aspect) }
      : { width: Math.round(480 * aspect), height: 480 }
  const config = libraryConfig()
  const maySupply = roleAtLeast(admin.role, 'super_admin')

  /*
   * SouqStudio's own blocks open in this panel's designer. An organization's
   * block is that shop's design and opens only in the shop app, as a plain
   * anchor rather than a `next/link`: it is a different origin and prefetching
   * it would be a cross-app request from an IP-restricted panel.
   */
  const ownBlock = block.organizationId === null
  const shopDesignerUrl =
    ownBlock || env.WEB_APP_URL === undefined
      ? null
      : `${env.WEB_APP_URL}/card-designer/${block.id}`

  return (
    <>
      <PageHeader
        title={block.name}
        description={block.description ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={block.status === 'published' ? 'positive' : 'neutral'}>
          {block.status === 'published' ? 'Published' : block.status === 'archived' ? 'Archived' : 'Draft'}
        </StatusPill>
        <StatusPill tone="quiet">{block.repeats ? 'Repeating' : 'Static'}</StatusPill>
        {block.isSeasonal ? (
          <StatusPill tone="caution">Seasonal{block.occasion === null ? '' : `: ${block.occasion}`}</StatusPill>
        ) : null}
        <StatusPill tone="neutral">
          {block.organizationId === null
            ? 'SouqStudio'
            : (block.organization?.name ?? 'An organization')}
        </StatusPill>
        {LIBRARY_ID.test(block.id) ? null : (
          <StatusPill tone="caution">Needs a library id</StatusPill>
        )}
      </div>

      <FontCatalogProvider catalog={catalog}>
      {/* The library's faces, served from R2, as the designer page loads them. */}
      {css !== '' && <style dangerouslySetInnerHTML={{ __html: css }} />}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <h2 className="text-label font-medium text-secondary">Preview</h2>
          {/*
            The stored thumbnail is only the fallback now, for a document that
            does not parse: everything else is drawn live.
          */}
          {arrangements !== null ? (
            <div className="flex aspect-square items-center justify-center rounded-chip bg-stone-100 p-3">
              <BlockPreview
                arrangements={arrangements}
                kit={LIBRARY_PREVIEW_KIT}
                {...canvas(previewAspect({ repeats: block.repeats, arrangements }))}
                assetBaseUrl={env.R2_PUBLIC_URL}
                className="h-full w-full"
              />
            </div>
          ) : block.thumbnailUrl === null ? (
            <p className="text-body-sm text-muted">
              The document does not parse, and no thumbnail is stored.
            </p>
          ) : (
            <Image
              src={block.thumbnailUrl}
              alt={`Thumbnail of ${block.name}`}
              width={320}
              height={320}
              className="h-auto w-full rounded-card border border-border-subtle bg-sand"
            />
          )}
          {ownBlock ? (
            <ButtonLink
              href={`/blocks/${block.id}/edit`}
              variant={block.status === 'draft' ? 'primary' : 'secondary'}
            >
              {block.status === 'draft' ? 'Edit in designer' : 'Open in designer'}
            </ButtonLink>
          ) : null}
          {shopDesignerUrl === null ? null : (
            <a href={shopDesignerUrl} className="text-body text-link underline">
              Open in the shop app designer
            </a>
          )}
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-label font-medium text-secondary">Document</h2>
          {summary.unreadable ? (
            <p className="text-body-sm text-critical-fg">
              The arrangements column does not parse as a layout. Publishing will refuse it.
            </p>
          ) : (
            <dl className="flex flex-col gap-1 text-body-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Arrangements</dt>
                <dd>
                  <Figure size="data-sm">{summary.arrangements}</Figure>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Bound elements</dt>
                <dd>
                  <Figure size="data-sm">{summary.boundElements}</Figure>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Static elements</dt>
                <dd>
                  <Figure size="data-sm">{summary.staticElements}</Figure>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Saved versions</dt>
                <dd>
                  <Figure size="data-sm">{block._count.versions}</Figure>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Pinned in books</dt>
                <dd>
                  <Figure size="data-sm">{block._count.pins}</Figure>
                </dd>
              </div>
            </dl>
          )}
          {summary.ranges.length === 0 ? null : (
            <div className="flex flex-col gap-1">
              <span className="text-label text-muted">Aspect ranges</span>
              <ul className="flex flex-wrap gap-1">
                {summary.ranges.map((range) => (
                  <li key={range}>
                    <StatusPill tone="quiet">{range}</StatusPill>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-label font-medium text-secondary">Bindings</h2>
          {summary.bindings.length === 0 ? (
            <p className="text-body-sm text-muted">
              Nothing bound. Every element is the same on every card.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {summary.bindings.map((binding) => (
                <li key={binding}>
                  <StatusPill tone="quiet">{binding}</StatusPill>
                </li>
              ))}
            </ul>
          )}
          <p className="text-body-sm text-muted">
            What this block pulls at draw time. Anything else is fixed copy or a shape.
          </p>
        </Card>
      </div>

      {arrangements === null || arrangements.length < 2 ? null : (
        <Card className="flex flex-col gap-3">
          <h2 className="text-label font-medium text-secondary">Layouts</h2>
          <p className="text-body-sm text-muted">
            Every layout this block carries, each drawn at the middle of the shapes it covers.
            Shape is width divided by height.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {arrangements.map((arrangement, index) => (
              <li key={index} className="flex min-w-0 flex-col gap-1">
                <div className="flex aspect-square items-center justify-center rounded-chip bg-stone-100 p-2">
                  <BlockPreview
                    arrangements={[arrangement]}
                    kit={LIBRARY_PREVIEW_KIT}
                    {...canvas(
                      Math.min(
                        6,
                        Math.max(
                          0.3,
                          Math.sqrt(
                            Math.max(arrangement.aspectMin, 0.05) *
                              Math.max(arrangement.aspectMax, 0.05)
                          )
                        )
                      )
                    )}
                    assetBaseUrl={env.R2_PUBLIC_URL}
                    className="h-full w-full"
                  />
                </div>
                <Figure size="data-sm" className="text-secondary">
                  {arrangement.aspectMin.toFixed(2)} to {arrangement.aspectMax.toFixed(2)}
                </Figure>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </FontCatalogProvider>

      {ownBlock && block.status === 'draft' && roleAtLeast(admin.role, 'catalog_manager') ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-label font-medium text-secondary">Season</h2>
          <OccasionField
            blockId={block.id}
            occasion={block.occasion}
            options={OCCASIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Card>
      ) : null}

      {!maySupply ? (
        <Card>
          <p className="text-body text-secondary">
            Publishing to the library needs the super admin role. It reaches every shop on
            the platform, which is a wider change than any other action in this panel.
          </p>
        </Card>
      ) : !config.configured ? (
        <Card>
          <p className="text-body text-secondary">
            Publishing is off on this deployment. {config.reason}
          </p>
        </Card>
      ) : (
        <PublishPanel
          blockId={block.id}
          suggestedId={LIBRARY_ID.test(block.id) ? block.id : ''}
          name={block.name}
          description={block.description ?? ''}
          category={block.category ?? ''}
        />
      )}

      {/*
        Taking a block out. Offered only where the route would allow it; the
        route decides again. An organization's block is never offered: its
        owner retires it in the shop app.

        **Unpublish is shown even when publishing is off**, disabled with the
        reason. Hidden, it read as a power admins did not have, when it was a
        power switched off on this deployment.
      */}
      {ownBlock &&
      ((block.status === 'published' && LIBRARY_ID.test(block.id) && maySupply) ||
        (block.status === 'draft' && roleAtLeast(admin.role, 'catalog_manager')) ||
        (block.status === 'archived' && maySupply)) ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-label font-medium text-secondary">Remove</h2>
          <RemoveBlock
            blockId={block.id}
            libraryId={LIBRARY_ID.test(block.id) ? block.id : null}
            mode={block.status === 'published' ? 'unpublish' : 'delete'}
            offReason={
              block.status === 'published' && !config.configured ? config.reason : null
            }
          />
        </Card>
      ) : null}
    </>
  )
}
