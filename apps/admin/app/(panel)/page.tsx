import Link from 'next/link'
import { Blocks, Building2, Package, ScrollText, Sparkles, Store } from 'lucide-react'
import { prisma } from '@souqstudio/db'
import { requireAdmin, ROLE_LABELS, roleAtLeast } from '@/lib/admin-auth'
import { libraryConfig } from '@/lib/library-client'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, StatCard } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/states'

/**
 * The platform overview. E13-06, the part of it that is answerable today.
 *
 * **Counts, not analytics.** E13-06 asks for exports by format, link views,
 * product clicks and most popular products; every one of those is a query-time
 * aggregation over tables that E10 and E11 are still filling, and a dashboard
 * of zeroes reads as a broken dashboard rather than as an unstarted epic. What
 * is here is what is true: how much is on the platform, and what needs a
 * reviewer's attention.
 */
export const dynamic = 'force-dynamic'

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { denied?: string }
}) {
  const { admin } = await requireAdmin()

  const [organizations, shops, products, unnamedArabic, blocks, prompts, pendingImages] =
    await Promise.all([
      prisma.organization.count(),
      prisma.shop.count(),
      prisma.catalogProduct.count({ where: { archivedAt: null } }),
      prisma.catalogProduct.count({ where: { archivedAt: null, nameAr: null } }),
      prisma.block.count(),
      prisma.coverPrompt.count({ where: { isActive: true } }),
      prisma.imageAsset.count({ where: { reviewState: 'PENDING' } }),
    ])

  const config = libraryConfig()

  return (
    <>
      <PageHeader
        title={`Hello${admin.name === null ? '' : `, ${admin.name}`}`}
        description={`Signed in as ${ROLE_LABELS[admin.role].toLowerCase()}.`}
      />

      {searchParams.denied === '1' ? (
        <ErrorState
          title="Not your role"
          body={`That screen needs a higher role than ${ROLE_LABELS[admin.role].toLowerCase()}. Ask a super admin if you need it.`}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Organizations" value={organizations} icon={Building2} />
        <StatCard label="Shops" value={shops} icon={Store} />
        <StatCard
          label="Products"
          value={products}
          icon={Package}
          note={`${unnamedArabic} with no Arabic name`}
        />
        <StatCard label="Blocks" value={blocks} icon={Blocks} />
        <StatCard label="Cover prompts offered" value={prompts} icon={Sparkles} />
        <StatCard
          label="Images awaiting review"
          value={pendingImages}
          icon={ScrollText}
          note={pendingImages === 0 ? 'Nothing waiting' : 'The matte queue is not built yet'}
        />
      </div>

      {/*
        The two things a reviewer should know about this deployment, rather than
        find out when an action fails. Both are stated as facts about the
        environment, not as errors.
      */}
      <Card className="flex flex-col gap-2">
        <h2 className="text-subhead text-primary">This deployment</h2>
        <ul className="flex flex-col gap-1 text-body-sm text-secondary">
          <li>
            Library publishing is{' '}
            {config.configured ? (
              <span className="text-positive-fg">on</span>
            ) : (
              <>
                <span className="text-caution-fg">off</span>. {config.reason}
              </>
            )}
          </li>
          <li>
            {unnamedArabic === 0
              ? 'Every product has an Arabic name.'
              : `${unnamedArabic} products have no Arabic name, so an Arabic edition using them cannot publish. The enrich worker still throws.`}
          </li>
        </ul>
      </Card>

      <nav aria-label="Shortcuts" className="flex flex-wrap gap-3">
        <Link href="/catalog" className="text-body text-link underline">
          Catalog
        </Link>
        <Link href="/blocks" className="text-body text-link underline">
          Block library
        </Link>
        {roleAtLeast(admin.role, 'catalog_manager') ? (
          <Link href="/prompts" className="text-body text-link underline">
            AI prompts
          </Link>
        ) : null}
        <Link href="/audit" className="text-body text-link underline">
          Audit log
        </Link>
      </nav>
    </>
  )
}
