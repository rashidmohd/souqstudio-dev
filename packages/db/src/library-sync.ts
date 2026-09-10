import { Prisma } from '@prisma/client'
import { BLOCK_OCCASION } from '@souqstudio/engine'
import type { SeedBlock } from '@souqstudio/engine'
import { prisma } from './client'

/**
 * Writing the block library into `blocks`. E7 —
 * `docs/block-library-from-r2.md` §8 step 6.
 *
 * **Here rather than in `prisma/seed.ts`, because there are two callers now.**
 * The seed runs on every deploy from Railway's `preDeployCommand`; the sync
 * route runs when somebody publishes a design and does not want to wait for a
 * release. Those two must write *identically* — a second implementation of the
 * upsert would be a library that means one thing after a deploy and another
 * after a sync, and the difference would show up as blocks appearing and
 * disappearing from pickers with nobody able to say why.
 *
 * **This function never decides what the library is.** It is handed one, already
 * loaded and already validated, and its contract is that a short list means
 * blocks were withdrawn. `library-source.ts` is what guarantees a short list is
 * never merely a failed fetch — see the note on `loadFromR2`. Calling this with
 * a partially-read library would prune real blocks out of every shop.
 */
export interface LibrarySyncResult {
  written: number
  archived: number
  deleted: number
}

export async function syncLibrary(library: readonly SeedBlock[]): Promise<LibrarySyncResult> {
  if (library.length === 0) {
    // The caller has already been refused by the loader in every normal path.
    // This is the backstop, because the cost of being wrong is the whole library.
    throw new Error(
      'syncLibrary: refusing an empty library. Every seeded block would be pruned from every shop.'
    )
  }

  for (const block of library) {
    const data = {
      name: block.name,
      description: block.description,
      repeats: block.repeats,
      // `Arrangement[]` is JSON-shaped but is an interface, and an interface has
      // no implicit index signature, so it is not assignable to Prisma's mapped
      // JSON input type. Same assertion as `lib/brand-kit.ts` in the web app.
      arrangements: block.arrangements as unknown as Prisma.InputJsonValue,
      status: 'published',
      // For an occasion rather than for a week. `activeFrom` and `activeTo` stay
      // null on purpose: Ramadan and both Eids move against the Gregorian
      // calendar, so a fixed window is a block that hides itself in the wrong
      // month from its second year. See `library-seasonal.ts`.
      isSeasonal: block.isSeasonal,
      // **On the row because the app can no longer ask the library.** It is a
      // loaded document now — possibly loaded from a bucket — so the row is the
      // only place the picker can learn what group a block is in.
      category: block.category,
      // Which occasion, so an imported copy can carry it. The *window* is still
      // computed from it — see `packages/engine/src/seasonal.ts`.
      occasion: BLOCK_OCCASION[block.id] ?? null,
      // Null organizationId is what makes a block seeded rather than authored.
      organizationId: null,
    }

    await prisma.block.upsert({
      where: { id: block.id },
      update: data,
      create: { id: block.id, ...data },
    })
  }

  const pruned = await pruneSeededBlocks(library)
  return { written: library.length, ...pruned }
}

/**
 * Seeded blocks that are no longer in the library.
 *
 * **Upserting is not enough once the library can shrink.** A library that only
 * ever grows is how the fourteen cards cut on 8 September — colour swaps of
 * their neighbours, variants differing by a hairline — would sit in every
 * database for ever, still listed in the picker, still importable.
 *
 * **Referenced blocks are archived, never deleted.** A page grid names its block
 * by id inside `regions` JSON, which Prisma cannot enforce, so deleting one that
 * a live book draws would leave a hole in a page rather than an error anywhere.
 * `book_pins` has a real foreign key and the delete would simply fail. Archiving
 * takes it out of the picker and leaves every book that uses it intact.
 *
 * A shop's own copy is a separate row with its own id and is never touched —
 * importing is copying, so nothing an owner has taken is taken back.
 */
async function pruneSeededBlocks(
  library: readonly { id: string }[]
): Promise<{ archived: number; deleted: number }> {
  const current = new Set(library.map((block) => block.id))
  const seeded = await prisma.block.findMany({
    where: { organizationId: null },
    select: { id: true, name: true, status: true },
  })
  const stale = seeded.filter((block) => !current.has(block.id))
  if (stale.length === 0) return { archived: 0, deleted: 0 }

  const [grids, pins] = await Promise.all([
    prisma.pageGrid.findMany({ select: { regions: true } }),
    prisma.bookPin.findMany({ select: { blockId: true } }),
  ])

  const inUse = new Set(pins.map((pin) => pin.blockId))
  for (const grid of grids) {
    for (const region of grid.regions as unknown as { blockId?: string }[]) {
      if (typeof region.blockId === 'string') inUse.add(region.blockId)
    }
  }

  const archived = stale.filter((block) => inUse.has(block.id))
  const removable = stale.filter((block) => !inUse.has(block.id))

  if (archived.length > 0) {
    await prisma.block.updateMany({
      where: { id: { in: archived.map((block) => block.id) } },
      data: { status: 'archived' },
    })
  }
  if (removable.length > 0) {
    await prisma.block.deleteMany({ where: { id: { in: removable.map((b) => b.id) } } })
  }

  return { archived: archived.length, deleted: removable.length }
}
