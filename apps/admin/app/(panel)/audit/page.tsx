import Link from 'next/link'
import { prisma, Prisma } from '@souqstudio/db'
import { requireAdmin } from '@/lib/admin-auth'
import { PageHeader } from '@/components/shared/PageHeader'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState, ZeroResults } from '@/components/ui/states'
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'

/**
 * Everything an admin has done. E13-01.
 *
 * **Readable by every role, including support.** An audit log that only its
 * subjects can read is not much of a control, and the commonest legitimate
 * question here is "who changed this product", which is support's question as
 * much as anybody's.
 *
 * Nothing writes to this screen and nothing deletes from it. The table has no
 * update path anywhere in the app.
 */
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

/** The nouns `lib/audit.ts` writes. Anything else is from an older shape. */
const ENTITY_LABELS: Readonly<Record<string, string>> = {
  catalog_product: 'Product',
  block: 'Block',
  cover_prompt: 'Prompt',
  admin_user: 'Admin',
  library: 'Library',
}

/** Where a given entity can be opened, when it still exists. */
function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === 'catalog_product') return `/catalog/${entityId}`
  if (entityType === 'block') return `/blocks/${entityId}`
  if (entityType === 'cover_prompt') return `/prompts/${entityId}`
  return null
}

/**
 * A failed action is worth seeing at a glance. `publish_failed` and
 * `sync_failed` are recorded deliberately, because "somebody tried and it did
 * not work" is often the entry being looked for.
 */
function toneFor(action: string): 'critical' | 'neutral' {
  return action.endsWith('_failed') ? 'critical' : 'neutral'
}

function summarize(before: Prisma.JsonValue | null, after: Prisma.JsonValue | null): string {
  const fields = (value: Prisma.JsonValue | null): string[] =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value)
      : []

  const changed = [...new Set([...fields(before), ...fields(after)])]
  if (changed.length === 0) return '-'
  // Named rather than counted: "nameAr, category" says more than "2 fields".
  return changed.slice(0, 4).join(', ') + (changed.length > 4 ? `, +${changed.length - 4}` : '')
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { entityType?: string; entityId?: string; cursor?: string }
}) {
  await requireAdmin()

  const filtered = searchParams.entityType !== undefined || searchParams.entityId !== undefined

  const entries = await prisma.adminAuditLog.findMany({
    where: {
      ...(searchParams.entityType === undefined ? {} : { entityType: searchParams.entityType }),
      ...(searchParams.entityId === undefined ? {} : { entityId: searchParams.entityId }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(searchParams.cursor === undefined
      ? {}
      : { cursor: { id: searchParams.cursor }, skip: 1 }),
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
      adminUser: { select: { email: true, name: true } },
    },
  })

  const hasMore = entries.length > PAGE_SIZE
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every action taken in this panel, with what changed."
      />

      {filtered ? (
        <div className="flex items-center gap-2">
          <StatusPill tone="neutral">
            Filtered to {ENTITY_LABELS[searchParams.entityType ?? ''] ?? searchParams.entityType}
          </StatusPill>
          <Link href="/audit" className="text-body-sm text-link underline">
            Show everything
          </Link>
        </div>
      ) : null}

      {page.length === 0 ? (
        filtered ? (
          <ZeroResults
            query=""
            onReset={
              <Link href="/audit" className="text-body text-link underline">
                Show everything
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="Nothing logged yet"
            body="Every change made in this panel is recorded here, including the ones that failed."
          />
        )
      ) : (
        <>
          <Table>
            <Thead>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Thing</Th>
              <Th>Fields</Th>
            </Thead>
            <Tbody>
              {page.map((entry) => {
                const href = entityHref(entry.entityType, entry.entityId)
                return (
                  <Tr key={entry.id}>
                    <Td>
                      <Figure size="data-sm">
                        {entry.createdAt.toISOString().replace('T', ' ').slice(0, 16)}
                      </Figure>
                    </Td>
                    <Td className="text-secondary">
                      {entry.adminUser.name ?? entry.adminUser.email}
                    </Td>
                    <Td>
                      <StatusPill tone={toneFor(entry.action)}>{entry.action}</StatusPill>
                    </Td>
                    <Td>
                      {href === null ? (
                        <span className="text-secondary">
                          {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                        </span>
                      ) : (
                        <Link href={href} className="text-link underline-offset-2 hover:underline">
                          {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                        </Link>
                      )}
                    </Td>
                    <Td className="text-secondary">{summarize(entry.before, entry.after)}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>

          {hasMore ? (
            <div className="flex justify-center">
              <Link
                href={`/audit?${new URLSearchParams({
                  ...(searchParams.entityType === undefined
                    ? {}
                    : { entityType: searchParams.entityType }),
                  ...(searchParams.entityId === undefined
                    ? {}
                    : { entityId: searchParams.entityId }),
                  cursor: page[page.length - 1]?.id ?? '',
                }).toString()}`}
                className="text-body text-link underline"
              >
                Older
              </Link>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}
