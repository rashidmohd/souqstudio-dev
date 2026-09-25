import Link from 'next/link'
import { listFonts, prisma } from '@souqstudio/db'
import type { Prisma } from '@souqstudio/db'
import { BLOCK_CATEGORIES, toArrangements } from '@souqstudio/engine'
import { FontCatalogProvider } from '@souqstudio/designer/components/brand/FontCatalogProvider'
import { fontsForKit } from '@souqstudio/designer/lib/font-registry'
import { LIBRARY_PREVIEW_KIT } from '@souqstudio/designer/lib/library-preview'
import { requireAdmin, roleAtLeast } from '@/lib/admin-auth'
import { env } from '@/lib/env'
import { libraryConfig } from '@/lib/library-client'
import { BlockCard } from '@/components/blocks/BlockCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, ButtonLink } from '@/components/ui/button'
import { Figure } from '@/components/ui/figure'
import { Input, Select } from '@/components/ui/input'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState, ZeroResults } from '@/components/ui/states'

/**
 * The block library console. E13-04.
 *
 * Every block on the platform, drawn, and the way into SouqStudio's own
 * authoring: "New block" starts a library draft and opens the designer on it.
 *
 * **A grid of previews, not a table**, because a block is found by what it
 * looks like. The filters are in the URL, like the catalog's, so a view can be
 * sent to a colleague, and they start on SouqStudio's own blocks: every
 * organization's copies are there on request, not in the way by default.
 *
 * **The designer is the shop app's designer**, mounted from
 * `@souqstudio/designer` at `/blocks/[id]/edit`, not a reimplementation. It
 * draws through the one painter that also renders the editor, the brand preview
 * and, when E9 lands, the PDF, because a second painter is how the print output
 * stops matching the screen.
 */
export const dynamic = 'force-dynamic'

const LIBRARY_ID = /^blk_[a-z0-9_]+$/

/** A screenful and a half. Past this the filters are the way in, and it says so. */
const PAGE = 120

type Owner = 'souqstudio' | 'library' | 'drafts' | 'organizations' | 'all'

const OWNERS: readonly { value: Owner; label: string }[] = [
  { value: 'souqstudio', label: 'SouqStudio, library and drafts' },
  { value: 'library', label: 'Library only' },
  { value: 'drafts', label: 'Drafts only' },
  { value: 'organizations', label: 'Made by an organization' },
  { value: 'all', label: 'Everything' },
]

const OWNER_WHERE: Record<Owner, Prisma.BlockWhereInput> = {
  souqstudio: { organizationId: null },
  library: { organizationId: null, NOT: { status: 'draft' } },
  drafts: { organizationId: null, status: 'draft' },
  organizations: { NOT: { organizationId: null } },
  all: {},
}

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { admin } = await requireAdmin()

  const one = (key: string) => {
    const value = searchParams[key]
    return typeof value === 'string' ? value.trim() : ''
  }
  const q = one('q')
  const ownerParam = one('owner')
  // `some` has just proved the string is one of OWNERS; it does not narrow.
  const owner: Owner = OWNERS.some((o) => o.value === ownerParam)
    ? (ownerParam as Owner)
    : 'souqstudio'
  const groupParam = one('group')
  const group = (BLOCK_CATEGORIES as readonly string[]).includes(groupParam) ? groupParam : ''

  const where: Prisma.BlockWhereInput = {
    AND: [
      OWNER_WHERE[owner],
      group === '' ? {} : { category: group },
      q === ''
        ? {}
        : {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { id: { contains: q.toLowerCase() } },
              { occasion: { contains: q.toLowerCase() } },
            ],
          },
    ],
  }

  const [rows, libraryCount, draftCount, orgCount, fonts] = await Promise.all([
    prisma.block.findMany({
      where,
      // SouqStudio's first, then by group and name, which is how the eye scans a
      // library: all the headers together, all the offer cards together.
      orderBy: [{ organizationId: 'asc' }, { category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        repeats: true,
        occasion: true,
        arrangements: true,
        organizationId: true,
        organization: { select: { name: true } },
      },
      take: PAGE + 1,
    }),
    prisma.block.count({ where: OWNER_WHERE.library }),
    prisma.block.count({ where: OWNER_WHERE.drafts }),
    prisma.block.count({ where: OWNER_WHERE.organizations }),
    listFonts(),
  ])
  const config = libraryConfig()

  const more = rows.length > PAGE
  const blocks = more ? rows.slice(0, PAGE) : rows
  const { catalog, css } = fontsForKit(fonts, LIBRARY_PREVIEW_KIT)
  const filtered = q !== '' || group !== '' || owner !== 'souqstudio'

  return (
    <>
      <PageHeader
        title="Block library"
        description="Every block on the platform, drawn in a stand-in shop's colours. Design a new one, then publish it to the library."
        action={
          roleAtLeast(admin.role, 'catalog_manager') ? (
            <ButtonLink href="/blocks/new" variant="primary">
              New block
            </ButtonLink>
          ) : undefined
        }
      />

      {config.configured ? null : (
        <div className="rounded-block bg-sand p-3">
          <p className="text-body text-charcoal">
            Publishing is off on this deployment. {config.reason}
          </p>
          <p className="text-body-sm text-secondary">
            Without both variables the console can list blocks and cannot change what shops see.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <StatusPill tone="neutral">{libraryCount} in the library</StatusPill>
        <StatusPill tone="caution">{draftCount} SouqStudio drafts</StatusPill>
        <StatusPill tone="quiet">{orgCount} made by an organization</StatusPill>
      </div>

      {/*
        A plain GET form: the filters are the query string, so this needs no
        client code, and the result is a link that can be shared.
      */}
      <form method="get" action="/blocks" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="blocks-q" className="text-label font-medium text-primary">
            Search
          </label>
          <Input id="blocks-q" name="q" defaultValue={q} placeholder="ramadan, hero band, blk_" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="blocks-owner" className="text-label font-medium text-primary">
            Whose
          </label>
          <Select id="blocks-owner" name="owner" defaultValue={owner} className="w-field-select">
            {OWNERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="blocks-group" className="text-label font-medium text-primary">
            Group
          </label>
          <Select id="blocks-group" name="group" defaultValue={group} className="w-field-select">
            <option value="">Every group</option>
            {BLOCK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Show</Button>
        {filtered ? (
          <Link href="/blocks" className="text-body text-link underline">
            Clear
          </Link>
        ) : null}
      </form>

      {blocks.length === 0 ? (
        filtered ? (
          <ZeroResults
            query={q}
            onReset={
              <Link href="/blocks" className="text-body text-link underline">
                Clear the filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No blocks"
            body="Run pnpm db:seed to load the shipped library, or set BLOCK_LIBRARY_URL and sync from R2."
          />
        )
      ) : (
        <FontCatalogProvider catalog={catalog}>
          {/* The library's faces, served from R2, as the designer page loads them. */}
          {css !== '' && <style dangerouslySetInnerHTML={{ __html: css }} />}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {blocks.map((block) => (
              <li key={block.id} className="min-w-0">
                <BlockCard
                  id={block.id}
                  name={block.name}
                  category={block.category}
                  status={block.status}
                  repeats={block.repeats}
                  occasion={block.occasion}
                  ownerName={
                    block.organizationId === null
                      ? null
                      : (block.organization?.name ?? block.organizationId)
                  }
                  libraryId={LIBRARY_ID.test(block.id) ? block.id : null}
                  arrangements={toArrangements(block.arrangements)}
                  kit={LIBRARY_PREVIEW_KIT}
                  assetBaseUrl={env.R2_PUBLIC_URL}
                />
              </li>
            ))}
          </ul>
        </FontCatalogProvider>
      )}

      {more ? (
        <p className="text-body-sm text-muted">
          Showing the first <Figure size="data-sm">{PAGE}</Figure>. Narrow it with the search or the
          filters above.
        </p>
      ) : null}
      <div>
        <ButtonLink href="/audit?entityType=block">See what has been published</ButtonLink>
      </div>
    </>
  )
}
