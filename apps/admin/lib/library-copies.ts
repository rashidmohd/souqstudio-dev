import 'server-only'

import { prisma } from '@souqstudio/db'

/**
 * Where a block's published copies are, read from the audit log.
 *
 * **Publishing copies a block; it does not change it.** A draft is published
 * under a library id, the library holds a document with that id, and a sync
 * writes it into `blocks` as a row of its own. The draft stays a draft. So a
 * draft page that only read its own `status` said "Draft" after every publish,
 * and each attempt to make that change typed a fresh id and made another copy:
 * four of one card were in every shop on 27 September.
 *
 * **The audit log already holds the link.** Every publish records the block it
 * came from and the id it went out under, so this needs no column of its own.
 * An unpublish is recorded against the library id, which is how a copy that has
 * since been taken out is told apart from one that is still there.
 */
export type LibraryCopyState = 'in_shops' | 'awaiting_sync' | 'unpublished'

export interface LibraryCopy {
  libraryId: string
  publishedAt: Date
  state: LibraryCopyState
}

export async function libraryCopies(blockId: string): Promise<LibraryCopy[]> {
  const publishes = await prisma.adminAuditLog.findMany({
    where: { entityType: 'block', entityId: blockId, action: 'library.block.published' },
    orderBy: { createdAt: 'desc' },
    select: { after: true, createdAt: true },
  })

  // Newest first, so the first sighting of an id is its latest publish.
  const latest = new Map<string, Date>()
  for (const entry of publishes) {
    const after = entry.after
    const id =
      after !== null && typeof after === 'object' && !Array.isArray(after)
        ? after['libraryId']
        : undefined
    if (typeof id === 'string' && !latest.has(id)) latest.set(id, entry.createdAt)
  }
  if (latest.size === 0) return []

  const ids = [...latest.keys()]
  const [unpublishes, rows] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where: { entityType: 'block', entityId: { in: ids }, action: 'library.block.unpublished' },
      select: { entityId: true, createdAt: true },
    }),
    prisma.block.findMany({
      where: { id: { in: ids }, organizationId: null, status: 'published' },
      select: { id: true },
    }),
  ])

  const inShops = new Set(rows.map((row) => row.id))
  return ids.map((libraryId) => {
    const publishedAt = latest.get(libraryId) ?? new Date(0)
    const takenOut = unpublishes.some(
      (entry) => entry.entityId === libraryId && entry.createdAt > publishedAt
    )
    const state: LibraryCopyState = takenOut
      ? 'unpublished'
      : inShops.has(libraryId)
        ? 'in_shops'
        : 'awaiting_sync'
    return { libraryId, publishedAt, state }
  })
}
