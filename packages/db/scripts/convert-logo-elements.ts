/**
 * Fold every stored `logo` element into an `image` bound to `brand.logo`.
 * E14 §3.1 and Phase 1.3.
 *
 * ```
 * pnpm --filter @souqstudio/db blocks:convert-logo -- --dry-run
 * pnpm --filter @souqstudio/db blocks:convert-logo
 * ```
 *
 * **The 66 seeded blocks are not this script's problem.** They are generated
 * TypeScript — `library-kit.ts`'s `logo()` helper emits the new form and every
 * one of them rebuilt with it. This runs over the other half: the blocks an
 * owner authored, which live in `blocks.arrangements` as JSONB and have no
 * generator to rebuild.
 *
 * Both halves go through `foldLogoElements` in the engine, because a converter
 * that ran differently over the two would produce a library that renders two
 * ways — which is the whole reason `packages/engine` exists.
 *
 * **Idempotent.** A block with no `logo` element is not written at all, so a
 * second run reports zero and touches nothing. That matters more than usual
 * here: the old kind stays renderable for one release, so this script and the
 * code that reads its output ship at different times and may be run twice.
 *
 * **Reads and writes `arrangements` only.** Every field the old kind carried is
 * on `ElementBase`, so the conversion is exact rather than approximate and
 * there is nothing to reconcile elsewhere.
 */

// From `../src/client`, not `../src/index` — the index constructs five BullMQ
// queues at module load and the script would never exit. Same note as
// `import-unioncoop.ts`.
import { prisma } from '../src/client'
import { countLogoElements, foldLogoElements, toArrangements } from '@souqstudio/engine'
import type { Prisma } from '@prisma/client'

const dryRun = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const blocks = await prisma.block.findMany({
    select: { id: true, name: true, organizationId: true, arrangements: true },
    orderBy: { id: 'asc' },
  })

  let converted = 0
  let elements = 0
  let skipped = 0
  const unparsed: string[] = []

  for (const block of blocks) {
    // **Parsed, not cast.** A document that does not validate is one this
    // script must not rewrite: writing back a "converted" version of something
    // it did not understand is how a bucket read by every shop gets a block
    // nobody can load. `docs/block-library-from-r2.md` §12.
    const parsed = toArrangements(block.arrangements)
    if (parsed === null) {
      unparsed.push(`${block.id} (${block.name})`)
      continue
    }

    const found = countLogoElements(parsed)
    if (found === 0) {
      skipped += 1
      continue
    }

    converted += 1
    elements += found
    const scope = block.organizationId === null ? 'seeded' : 'owner'
    console.log(`  ${block.id} (${scope}) ${block.name}: ${found} logo → image`)

    if (!dryRun) {
      await prisma.block.update({
        where: { id: block.id },
        data: {
          arrangements: foldLogoElements(parsed) as unknown as Prisma.InputJsonValue,
        },
      })
    }
  }

  console.log('')
  console.log(`${blocks.length} blocks read`)
  console.log(`${converted} converted, ${elements} elements folded, ${skipped} already clean`)
  if (unparsed.length > 0) {
    console.log('')
    console.log(`${unparsed.length} did not validate and were left alone:`)
    for (const line of unparsed) console.log(`  ${line}`)
  }
  if (dryRun) console.log('\ndry run — nothing written')

  await prisma.$disconnect()
  // A block left unconverted because it does not parse is a finding, not a
  // success, and a run that ends green would bury it.
  if (unparsed.length > 0) process.exitCode = 1
}

void main()
