/**
 * Where the library comes from. **This file is the seam.**
 *
 * `docs/block-library-from-r2.md` §7 asks for one thing above all others: that
 * choosing R2 later be a change to a *loader* rather than to the seed, the
 * prune, the picker, the plan gate and everything else downstream. This is that
 * loader. Today it reads committed JSON files. Pointing it at a bucket is a
 * change to `readAuthored` and nothing else.
 *
 * ## Two arms, and only one of them is files
 *
 * `SEED_BLOCKS` — the generated arm — stays generated, and turning it into
 * files would be a mistake. The offer cards are seventeen structures times a
 * skin *on purpose*: `docs/E7-pending.md` §8 records that thirty hand-drawn
 * cards drifted apart inside a month. What files are good for is the individual
 * designs, the ones somebody drew once because they wanted exactly that. So the
 * change is additive — `loadLibrary()` is the generated blocks plus whatever
 * this loader returns.
 *
 * ## Node only, deliberately
 *
 * It reads the filesystem, so it is **not** exported from `src/index.ts`. The
 * two callers are `pnpm db:seed` and the harness, both of them Node processes
 * that can await freely. Keeping it off the barrel is what stops a component
 * importing it by accident and stops `node:fs` reaching a browser build — and
 * it is also the property that makes the R2 version possible at all, since a
 * fetch cannot be resolved at module scope in a client bundle.
 *
 * **Async from the first day, and that is the point.** A synchronous loader
 * would work perfectly well over committed files and then have to be unpicked
 * from four module-scope call sites the day the source became a network. The
 * seam is only cheap to cross if it is already the right shape.
 */

import { readFile, readdir } from 'node:fs/promises'
import type { Arrangement, BlockElement, Box } from '@souqstudio/types'
import { BLOCK_CATEGORIES, type BlockCategory } from './block-category'
import { validateBlock } from './block-edit'
import { SEED_BLOCKS, type SeedBlock } from './library'
import { usesOnlyRoles } from './roles'

/**
 * The folder of authored documents, relative to this file.
 *
 * `packages/engine/blocks/` — beside the engine that validates and draws them
 * rather than beside the seed that writes them, for the same reason
 * `SEED_BLOCKS` is here: two consumers need the same bytes, and a second copy
 * is one that drifts.
 */
const AUTHORED_DIR = new URL('../blocks/', import.meta.url)

/**
 * The whole library: the generated blocks, then the authored ones.
 *
 * **Order is the picker's order**, so authored designs land after the generated
 * families rather than interleaved into them. A design somebody drew on purpose
 * is not a variant of a card, and putting it among the seventeen structures
 * would read as one.
 */
export async function loadLibrary(from: URL = AUTHORED_DIR): Promise<SeedBlock[]> {
  const authored = await loadAuthoredBlocks(from)

  const seen = new Set(SEED_BLOCKS.map((block) => block.id))
  for (const block of authored) {
    if (seen.has(block.id)) {
      throw new Error(
        `library: authored block "${block.id}" collides with a generated one. ` +
          `An id is what the seed upserts on and what a live book names inside its ` +
          `page grid, so two blocks answering to one id is a book drawing whichever ` +
          `was written last.`
      )
    }
    seen.add(block.id)
  }

  return [...SEED_BLOCKS, ...authored]
}

/**
 * The authored arm. **Swap this function to change where the library lives.**
 *
 * Reading a folder today; fetching a manifest and then the documents it names,
 * from a per-environment prefix, tomorrow. What it returns — validated
 * `SeedBlock`s — is the contract, and nothing above this line needs to know
 * which it was.
 */
export async function loadAuthoredBlocks(from: URL = AUTHORED_DIR): Promise<SeedBlock[]> {
  const files = (await readAuthored(from)).sort((a, b) => a.name.localeCompare(b.name))

  const blocks: SeedBlock[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const block = parseSeedBlock(file.name, file.text)
    if (seen.has(block.id)) {
      throw new Error(`library: two authored documents claim the id "${block.id}"`)
    }
    seen.add(block.id)
    blocks.push(block)
  }

  return blocks
}

/**
 * The bytes, and the only part that knows about a filesystem.
 *
 * A missing folder is not an error: the library is currently entirely
 * generated, and an empty authored arm is the honest description of that rather
 * than a failure to report.
 */
async function readAuthored(from: URL): Promise<{ name: string; text: string }[]> {
  let names: string[]
  try {
    names = await readdir(from)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  return Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => ({
        name,
        text: await readFile(new URL(name, from), 'utf8'),
      }))
  )
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * **This is where §5's "validation moves to load time" actually lands.**
 *
 * A block written in TypeScript is checked by the compiler before it merges. A
 * block in a file is checked here — during a seed, which is during a deploy —
 * so the refusal has to name the file and say what is wrong with it, or the
 * failure arrives as a stack trace in a deploy log with nothing to act on.
 *
 * **What is checked here is the skeleton, not every field.** The exhaustive,
 * per-kind schema is `arrangementsSchema` in `apps/web/lib/block-document.ts`,
 * where it guards the API. Two schemas is one too many and unifying them is
 * real work — it is a genuine prerequisite for step 5 of that document's list,
 * and is recorded there rather than pretended away here. What this does check is
 * everything the *engine* reads while drawing, plus the two rules a shipped
 * block is held to that an owner's is not: no warnings, and colours by role.
 */
function parseSeedBlock(file: string, text: string): SeedBlock {
  const refuse = (why: string): never => {
    throw new Error(`library: ${file} is not a block document — ${why}`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return refuse(`it is not valid JSON (${(error as Error).message})`)
  }

  if (!isRecord(raw)) return refuse('the document is not an object')

  const id = raw['id']
  if (typeof id !== 'string' || !/^blk_[a-z0-9_]+$/.test(id)) {
    // The id is written into `page_grids` regions as plain JSON and upserted on
    // by the seed, so it is a permanent public name rather than a filename.
    return refuse('"id" must be a string like "blk_ramadan_band"')
  }

  const name = raw['name']
  if (typeof name !== 'string' || name.trim() === '') return refuse('"name" must be a non-empty string')

  const description = raw['description']
  if (typeof description !== 'string') return refuse('"description" must be a string')

  const repeats = raw['repeats']
  if (typeof repeats !== 'boolean') return refuse('"repeats" must be true or false')

  const isSeasonal = raw['isSeasonal']
  if (typeof isSeasonal !== 'boolean') return refuse('"isSeasonal" must be true or false')

  const category = raw['category']
  if (!isCategory(category)) {
    return refuse(`"category" must be one of ${BLOCK_CATEGORIES.map((c) => `"${c}"`).join(', ')}`)
  }

  const arrangements = parseArrangements(raw['arrangements'], refuse)

  // The structural bar every block clears, owner-authored ones included.
  const errors = validateBlock({ repeats, arrangements }).filter(
    (problem) => problem.severity === 'error'
  )
  if (errors.length > 0) {
    return refuse(`it does not validate: ${errors.map((problem) => problem.code).join(', ')}`)
  }

  // **And the two higher bars a *shipped* block clears.** A warning is "this
  // will disappoint you", which an owner may accept on their own block and the
  // library every account loads may not — `library.test.ts` holds the generated
  // arm to exactly this, and an authored block is no less shipped for having
  // arrived as a file.
  const warnings = validateBlock({ repeats, arrangements }).filter(
    (problem) => problem.severity === 'warning'
  )
  if (warnings.length > 0) {
    return refuse(
      `it draws with warnings (${warnings.map((problem) => problem.code).join(', ')}), ` +
        `which a block every account loads may not`
    )
  }

  if (!usesOnlyRoles(arrangements)) {
    return refuse(
      'it names a colour by value or by palette entry. A block ships before it has met ' +
        'a shop, so every colour must be a role the kit fills'
    )
  }

  return { id, name, description, repeats, category, isSeasonal, arrangements }
}

/**
 * The arrangement skeleton: what `pickArrangement` and the painter walk.
 *
 * Each element keeps the fields of its own kind unchecked — see the note on
 * `parseSeedBlock`. The cast at the end is the one place that is true, and it
 * is narrow: everything the engine dereferences without a guard has been
 * checked above it.
 */
function parseArrangements(value: unknown, refuse: (why: string) => never): Arrangement[] {
  if (!Array.isArray(value) || value.length === 0) {
    return refuse('"arrangements" must be a non-empty array')
  }

  for (const [index, arrangement] of value.entries()) {
    const where = `arrangement ${index}`
    if (!isRecord(arrangement)) return refuse(`${where} is not an object`)

    const { aspectMin, aspectMax } = arrangement
    if (!isFinite_(aspectMin) || !isFinite_(aspectMax) || aspectMin <= 0) {
      return refuse(`${where} needs positive finite "aspectMin" and "aspectMax"`)
    }
    if (aspectMin > aspectMax) return refuse(`${where} has aspectMin above aspectMax`)

    const elements = arrangement['elements']
    if (!Array.isArray(elements)) return refuse(`${where} has no "elements" array`)

    for (const [at, element] of elements.entries()) {
      if (!isRecord(element)) return refuse(`${where}, element ${at} is not an object`)
      if (typeof element['id'] !== 'string' || element['id'] === '') {
        return refuse(`${where}, element ${at} has no "id"`)
      }
      if (!isKind(element['kind'])) {
        return refuse(`${where}, element ${at} has an unknown "kind" (${String(element['kind'])})`)
      }
      if (!isBox(element['box'])) {
        return refuse(
          `${where}, element ${element['id']} needs a "box" of four finite numbers — ` +
            `start, top, width, height, each a fraction of the block rather than a pixel`
        )
      }
    }
  }

  // Checked field by field above for everything the engine reads without a
  // guard; the per-kind options are the schema's job, as documented on
  // `parseSeedBlock`.
  return value as Arrangement[]
}

const ELEMENT_KINDS: readonly BlockElement['kind'][] = [
  'image',
  'text',
  'priceMark',
  'chip',
  'logo',
  'shape',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFinite_ = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isKind = (value: unknown): value is BlockElement['kind'] =>
  typeof value === 'string' && (ELEMENT_KINDS as readonly string[]).includes(value)

const isCategory = (value: unknown): value is BlockCategory =>
  typeof value === 'string' && (BLOCK_CATEGORIES as readonly string[]).includes(value)

const isBox = (value: unknown): value is Box =>
  isRecord(value) &&
  isFinite_(value['start']) &&
  isFinite_(value['top']) &&
  isFinite_(value['width']) &&
  isFinite_(value['height'])
