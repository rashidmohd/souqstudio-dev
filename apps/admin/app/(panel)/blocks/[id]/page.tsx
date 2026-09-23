import Image from 'next/image'
import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireAdmin, roleAtLeast } from '@/lib/admin-auth'
import { summarize } from '@/lib/block-summary'
import { libraryConfig } from '@/lib/library-client'
import { env } from '@/lib/env'
import { PublishPanel } from '@/components/blocks/PublishPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * One block, and the console that publishes it. E13-04.
 *
 * **There is no canvas on this page.** It describes the block (see
 * lib/block-summary.ts); drawing it is the designer's job, at
 * `/blocks/[id]/edit` for SouqStudio's own blocks.
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <h2 className="text-label font-medium text-secondary">Thumbnail</h2>
          {block.thumbnailUrl === null ? (
            <p className="text-body-sm text-muted">
              None stored. Open it in the designer to see it drawn.
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
    </>
  )
}
