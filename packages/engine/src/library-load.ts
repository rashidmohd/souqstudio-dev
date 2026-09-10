/**
 * Loading the library from wherever this environment reads it.
 *
 * **Node only, and separate from `library-source.ts` for a load-bearing reason.**
 * This module reads the filesystem — the repo's own copy of the library — and a
 * Next build cannot follow it: webpack resolves `new URL(..., import.meta.url)`
 * at build time and fails on the folder. So `POST /api/v1/library/sync` imports
 * `library-source.ts` and calls `loadFromR2` directly, and nothing in the web app
 * can reach the code below.
 *
 * That is the right boundary regardless of the bundler. The web app's library is
 * the published one; the repo's copy is what a laptop, the harness and the
 * publish script read. See `docs/block-library-from-r2.md` §10.
 */

import { readFile, readdir } from 'node:fs/promises'
import { SEED_BLOCKS, type SeedBlock } from './library'
import { loadFromR2, parseSeedBlock, resolveSource, type LibrarySource } from './library-source'

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
 * The library, from wherever this environment reads it.
 *
 * **Order is the picker's order.** Locally the generated families come first and
 * authored designs land after them — a design somebody drew on purpose is not a
 * variant of a card, and putting it among the seventeen structures would read as
 * one. From R2 the manifest's order is the order, because the manifest is what
 * the publish step wrote and it preserved exactly this.
 */
export async function loadLibrary(source: LibrarySource = resolveSource()): Promise<SeedBlock[]> {
  return source.kind === 'r2' ? loadFromR2(source.base) : loadLocal(source.dir)
}

async function loadLocal(dir: URL = AUTHORED_DIR): Promise<SeedBlock[]> {
  const authored = await loadAuthoredBlocks(dir)

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

