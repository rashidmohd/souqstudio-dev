/**
 * Where the library comes from. **This file is the seam.**
 *
 * ## Two files, and the split is structural rather than tidy
 *
 * This half reaches the *network* and validates what comes back. `library-load.ts`
 * is the other half: it reaches the *filesystem* and dispatches between the two
 * sources. They are separate modules because `POST /api/v1/library/sync` imports
 * this one, and a Next build follows every import — webpack resolves
 * `new URL('../blocks/', import.meta.url)` at build time and fails on it, which
 * is how the split was discovered rather than designed. It is the right shape
 * anyway: the web app has no business reaching a folder in the repo, and now it
 * structurally cannot.
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

import { BLOCK_CATEGORIES, type BlockCategory } from './block-category'
import { validateBlock } from './block-edit'
import { arrangementsSchema } from './document'
import type { SeedBlock } from './library'
import { usesOnlyRoles } from './roles'

/**
 * Where a library is read from.
 *
 * **`r2` is the source of truth wherever it is configured**, and in that mode
 * the generated blocks are *not* added from code — they are in the bucket,
 * because `blocks:publish` put them there. Two arms would mean a deploy could
 * disagree with a sync about what the library is, which is the whole failure
 * this design exists to avoid.
 *
 * `local` is the repo: generated blocks plus `blocks/*.json`. It is what the
 * harness and a laptop with no credentials get, and it is how the bucket's
 * contents are produced in the first place.
 */
export type LibrarySource = { kind: 'local'; dir?: URL } | { kind: 'r2'; base: URL }

/**
 * Which source this process should use, from the environment.
 *
 * **One variable decides it, and its absence is not a silent fallback to
 * nothing** — it is the repo, which is a complete library. A seed on a laptop
 * with no R2 credentials still works and still writes fifty-nine blocks. A seed
 * on Railway with `BLOCK_LIBRARY_URL` set reads the bucket and only the bucket.
 *
 * **The variable carries the environment's prefix, rather than the code
 * deriving one.** §5 asks "which prefix does dev read?" and the honest answer is
 * that nothing in the code should be guessing: a bucket path assembled from
 * `NODE_ENV` is one typo away from a half-finished design in every shop, and the
 * typo is invisible until it ships. An explicit URL per environment can be read
 * off the Railway dashboard and checked.
 */
export function resolveSource(): LibrarySource {
  const base = process.env['BLOCK_LIBRARY_URL']
  if (base === undefined || base.trim() === '') return { kind: 'local' }

  // A trailing slash or its absence must not change which objects are fetched.
  return { kind: 'r2', base: new URL(base.endsWith('/') ? base : `${base}/`) }
}

/**
 * The manifest: one object that says what the library is.
 *
 * **It exists so that a reader never has to list a bucket.** Listing is a
 * credentialed operation, it is eventually consistent, and it cannot tell you
 * whether what you got is the whole thing. One document naming every block, with
 * a count, can: fetch it, fetch what it names, and compare. That comparison is
 * the entire safety property of this path — see `loadFromR2`.
 *
 * `version` is the publish's timestamp. It is not used for cache invalidation
 * (the fetches ask for no cache at all) — it is there so that a person looking
 * at a bucket, or at a sync that went wrong, can tell which publish they are
 * holding.
 */
export interface LibraryManifest {
  version: string
  count: number
  blocks: { id: string; category: BlockCategory }[]
}

/**
 * The R2 arm. **This is the function §7 said would be the whole of the change,
 * and it is.**
 *
 * Reads over plain HTTPS from the bucket's public origin — no SDK, no
 * credentials, no bucket listing. Writing needs keys; reading a library that
 * every shop is about to receive does not, and keeping the read path
 * credential-free is what lets the engine do it without an AWS dependency.
 *
 * ## All of it, or none of it
 *
 * **The dangerous failure here is not an outage, it is a partial read.** The
 * seed prunes: a seeded block the library no longer lists is archived if a book
 * uses it and deleted if not. So a manifest that fetched but a document that did
 * not would look exactly like *"that block was removed from the library"* — and
 * the prune would remove it from every shop on the platform, for a 500 from a
 * CDN.
 *
 * Every refusal below therefore happens **before a single row is written**, and
 * the message says what was expected and what arrived. A deploy that fails
 * loudly is recoverable; a prune that ran on a partial library is not.
 */
export async function loadFromR2(base: URL): Promise<SeedBlock[]> {
  const manifest = await readManifest(base)

  const documents = await Promise.all(
    manifest.blocks.map(async (entry) => ({
      entry,
      text: await fetchText(new URL(`${entry.id}.json`, base)),
    }))
  )

  const missing = documents.filter((document) => document.text === null)
  if (missing.length > 0) {
    throw new Error(
      `library: ${missing.length} of ${manifest.count} documents could not be fetched ` +
        `from ${base.href} (${missing.map((document) => document.entry.id).join(', ')}). ` +
        `Refusing to seed a partial library: the prune would treat every one of them ` +
        `as removed and take it out of every shop.`
    )
  }

  const blocks = documents.map((document) =>
    // The manifest is an index, not an authority. Every document is held to the
    // same bar a committed file is — schema, structure, no warnings, roles only.
    parseSeedBlock(`${document.entry.id}.json`, document.text as string)
  )

  // The manifest said what it contains; the documents say what they are. If
  // those disagree, something published half a library or a document was
  // overwritten by a different block, and neither is a thing to seed through.
  const listed = manifest.blocks.map((entry) => entry.id).sort()
  const arrived = blocks.map((block) => block.id).sort()
  if (listed.join('\n') !== arrived.join('\n')) {
    throw new Error(
      `library: the manifest at ${base.href} lists ids the documents do not match. ` +
        `Listed ${listed.length}, arrived ${arrived.length}. This is a half-finished ` +
        `publish; nothing has been written.`
    )
  }

  return blocks
}

/** The manifest, validated as strictly as a block document is. */
async function readManifest(base: URL): Promise<LibraryManifest> {
  const url = new URL('manifest.json', base)
  const text = await fetchText(url)

  if (text === null) {
    throw new Error(
      `library: no manifest at ${url.href}. BLOCK_LIBRARY_URL points at this prefix, ` +
        `so either it is the wrong prefix or nothing has been published to it yet — ` +
        `run \`pnpm --filter @souqstudio/web blocks:publish\` against it.`
    )
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`library: the manifest at ${url.href} is not valid JSON (${(error as Error).message})`)
  }

  if (!isRecord(raw) || !Array.isArray(raw['blocks']) || typeof raw['count'] !== 'number') {
    throw new Error(`library: the manifest at ${url.href} is not a manifest`)
  }

  const blocks: LibraryManifest['blocks'] = []
  for (const entry of raw['blocks']) {
    if (!isRecord(entry) || typeof entry['id'] !== 'string' || !isCategory(entry['category'])) {
      throw new Error(`library: the manifest at ${url.href} has a malformed entry`)
    }
    blocks.push({ id: entry['id'], category: entry['category'] })
  }

  // **The count is not decoration.** It is written by the publisher from what it
  // actually uploaded, so a manifest whose list is shorter than its own count is
  // a publish that was interrupted partway through writing this file.
  if (blocks.length !== raw['count']) {
    throw new Error(
      `library: the manifest at ${url.href} claims ${String(raw['count'])} blocks and ` +
        `lists ${blocks.length}. That is an interrupted publish, not a library.`
    )
  }

  if (blocks.length === 0) {
    throw new Error(
      `library: the manifest at ${url.href} is empty. Seeding it would prune every ` +
        `seeded block from every shop, so it is refused as a mistake rather than obeyed.`
    )
  }

  return { version: typeof raw['version'] === 'string' ? raw['version'] : 'unknown', count: blocks.length, blocks }
}

/**
 * One object, or null if it is not there.
 *
 * **Asks for a fresh copy, deliberately.** A sync is triggered precisely because
 * something changed; a CDN edge that served a cached manifest would report
 * success and change nothing, which is the worst of the available outcomes.
 * Freshness matters more than the request here — this runs once per deploy or
 * per explicit sync, not per render.
 *
 * A `cache-control` header rather than `RequestInit.cache`, which Node's fetch
 * types do not carry: this has to run under `tsx` in the seed and under Next in
 * the sync route, and the header is what both of them honour.
 */
async function fetchText(url: URL): Promise<string | null> {
  const response = await fetch(url, {
    headers: { 'cache-control': 'no-cache' },
  }).catch(() => null)
  if (response === null || !response.ok) return null
  return response.text()
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
 * **Every field, not a skeleton.** This used to check only what the engine
 * dereferences while drawing, on the argument that a committed file is reviewed
 * in a diff before it merges. A document fetched from a bucket is reviewed by
 * nobody: it reaches every shop on the next sync with no diff, no CI and no
 * compiler anywhere in its path. So `arrangementsSchema` — the same zod schema
 * that guards `PATCH /api/v1/blocks/:id` — moved into the engine and runs here.
 * There is one definition of a legal block document and three doors into it.
 *
 * On top of the schema, the two rules a *shipped* block is held to and an
 * owner's own is not: no warnings, and every colour a role.
 */
export function parseSeedBlock(file: string, text: string): SeedBlock {
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

  const parsed = arrangementsSchema.safeParse(raw['arrangements'])
  if (!parsed.success) {
    // The zod message names the path — `0.elements.3.box.width` — which is the
    // difference between a person fixing their document and a person guessing.
    const first = parsed.error.errors[0]
    const at = first?.path.join('.') ?? 'arrangements'
    return refuse(`"arrangements" is not a valid document at ${at}: ${first?.message ?? 'invalid'}`)
  }
  const arrangements = parsed.data

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCategory = (value: unknown): value is BlockCategory =>
  typeof value === 'string' && (BLOCK_CATEGORIES as readonly string[]).includes(value)

