import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SEED_BLOCKS } from './library'
import { resolveSource } from './library-source'
import { loadAuthoredBlocks, loadLibrary } from './library-load'

/**
 * The loader seam. `docs/block-library-from-r2.md` §8 step 1.
 *
 * What is worth testing here is not that JSON parses. It is that **a bad
 * document is refused with something a person can act on**, because the moment
 * a block can be authored outside the compiler, the failure moves from a pull
 * request to a deploy — and a deploy log saying `Cannot read property 'box' of
 * undefined` is a library nobody can safely add to.
 */

const box = (start: number, top: number, width: number, height: number) => ({
  start,
  top,
  width,
  height,
})

/** A minimal document that passes: one ground shape, colour named by role. */
const valid = (overrides: Record<string, unknown> = {}) => ({
  id: 'blk_authored_test',
  name: 'Authored test',
  description: 'A block that arrived as a file.',
  repeats: false,
  category: 'panel',
  isSeasonal: false,
  arrangements: [
    {
      aspectMin: 0.4,
      aspectMax: 6,
      elements: [
        {
          id: 'ground',
          kind: 'shape',
          variant: 'rect',
          radius: 0,
          box: box(0, 0, 1, 1),
          fill: { from: 'role', ref: 'primary' },
        },
      ],
    },
  ],
  ...overrides,
})

let dir: string
let url: URL

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'authored-'))
  url = pathToFileURL(`${dir}/`)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const write = (name: string, document: unknown) =>
  writeFile(join(dir, name), JSON.stringify(document, null, 2))

describe('the authored arm', () => {
  it('is empty when there is no folder, rather than an error', async () => {
    // The library is entirely generated today. An absent folder is the honest
    // description of that, not a failure to report.
    const missing = pathToFileURL(join(dir, 'not-here/'))
    await expect(loadAuthoredBlocks(missing)).resolves.toEqual([])
  })

  it('reads a document from a file', async () => {
    await write('a.json', valid())
    const [block] = await loadAuthoredBlocks(url)

    expect(block?.id).toBe('blk_authored_test')
    expect(block?.category).toBe('panel')
    expect(block?.arrangements).toHaveLength(1)
  })

  it('ignores anything that is not JSON', async () => {
    await write('a.json', valid())
    await writeFile(join(dir, 'README.md'), '# not a block')
    await expect(loadAuthoredBlocks(url)).resolves.toHaveLength(1)
  })

  it('adds the authored blocks after the generated ones', async () => {
    // Order is the picker's order. A design somebody drew on purpose is not a
    // variant of a card and must not land among the seventeen structures.
    await write('a.json', valid())
    const library = await loadLibrary({ kind: 'local', dir: url })

    expect(library).toHaveLength(SEED_BLOCKS.length + 1)
    expect(library[library.length - 1]?.id).toBe('blk_authored_test')
  })
})

describe('the round trip', () => {
  it('accepts every generated block, written out as a file', async () => {
    // **The contract between the loader and `GET /api/v1/blocks/:id/export`.**
    // Step 3 of §8 exists so that a design drawn in the designer can become a
    // file in `blocks/`; that is only true if the file format can express what
    // the library already contains. Writing all fifty-nine out and reading them
    // back is the check — and it holds every one of them to the loader's bar
    // too: structural validity, no warnings, and colours by role.
    //
    // It is also what would catch the format drifting. Add a field to
    // `SeedBlock` and forget the parser, and this fails rather than a deploy.
    for (const block of SEED_BLOCKS) {
      await write(`${block.id}.json`, block)
    }

    const loaded = await loadAuthoredBlocks(url)

    expect(loaded).toHaveLength(SEED_BLOCKS.length)
    expect(new Set(loaded.map((block) => block.id))).toEqual(
      new Set(SEED_BLOCKS.map((block) => block.id))
    )

    // Not merely the same ids — the same documents. A loader that quietly
    // dropped an element would pass every check above this line.
    const byId = new Map(loaded.map((block) => [block.id, block]))
    for (const block of SEED_BLOCKS) {
      expect({ id: block.id, block: byId.get(block.id) }).toEqual({ id: block.id, block })
    }
  })
})

describe('what it refuses, and what it says', () => {
  /** The message a deploy log will carry. It has to name the file. */
  const refusal = async (name: string, document: unknown) => {
    await write(name, document)
    return loadAuthoredBlocks(url).then(
      () => null,
      (error: Error) => error.message
    )
  }

  it('names the file in every refusal', async () => {
    const message = await refusal('seasonal-band.json', valid({ repeats: 'no' }))
    expect(message).toContain('seasonal-band.json')
  })

  it('refuses a malformed id, because an id is permanent and public', async () => {
    // It is upserted on by the seed and written into `page_grids` regions as
    // plain JSON. It is not a filename.
    const message = await refusal('a.json', valid({ id: 'Ramadan Band' }))
    expect(message).toContain('"id"')
  })

  it('refuses an unknown category', async () => {
    const message = await refusal('a.json', valid({ category: 'banner' }))
    expect(message).toContain('"category"')
  })

  it('refuses a colour named by value', async () => {
    // The rule that earns everything else: a block ships before it has met a
    // shop, so it cannot name that shop's palette entry and must not name a
    // literal — it would stop looking like whichever account loaded it.
    const message = await refusal(
      'a.json',
      valid({
        arrangements: [
          {
            aspectMin: 0.4,
            aspectMax: 6,
            elements: [
              {
                id: 'ground',
                kind: 'shape',
                variant: 'rect',
                radius: 0,
                box: box(0, 0, 1, 1),
                fill: { from: 'hex', hex: '#143CD2' },
              },
            ],
          },
        ],
      })
    )
    expect(message).toContain('role')
  })

  it('refuses a box that is not four numbers', async () => {
    const message = await refusal(
      'a.json',
      valid({
        arrangements: [
          {
            aspectMin: 0.4,
            aspectMax: 6,
            elements: [
              { id: 'ground', kind: 'shape', variant: 'rect', radius: 0, box: { start: 0, top: 0 } },
            ],
          },
        ],
      })
    )
    // The schema names the path it failed at, which is the difference between
    // a person fixing their document and a person guessing.
    expect(message).toContain('box')
  })

  it('refuses an element kind the painter has never heard of', async () => {
    const message = await refusal(
      'a.json',
      valid({
        arrangements: [
          {
            aspectMin: 0.4,
            aspectMax: 6,
            elements: [{ id: 'x', kind: 'video', box: box(0, 0, 1, 1) }],
          },
        ],
      })
    )
    expect(message).toContain('kind')
  })

  it('refuses JSON that is not JSON', async () => {
    await writeFile(join(dir, 'a.json'), '{ "id": ')
    await expect(loadAuthoredBlocks(url)).rejects.toThrow(/valid JSON/)
  })

  it('refuses two documents claiming one id', async () => {
    await write('a.json', valid())
    await write('b.json', valid({ name: 'Another' }))
    await expect(loadAuthoredBlocks(url)).rejects.toThrow(/two authored documents/)
  })

  it('refuses an authored id that collides with a generated block', async () => {
    // The seed upserts on the id and a live book names it inside its page grid,
    // so two blocks answering to one id is a book drawing whichever was written
    // last.
    await write('a.json', valid({ id: 'blk_footer' }))
    await expect(loadLibrary({ kind: 'local', dir: url })).rejects.toThrow(/collides/)
  })
})

/**
 * The R2 arm.
 *
 * **What is worth testing is the prune's blast radius, not the happy path.** The
 * seed removes a seeded block the library no longer lists — archived if a book
 * uses it, deleted if not — so any read that comes back *short* is
 * indistinguishable from "those blocks were withdrawn". A 500 from a CDN would
 * then take blocks out of every shop on the platform. Every test below is a way
 * of arriving short, and every one of them must refuse before a row is written.
 */
describe('reading the library from R2', () => {
  const base = new URL('https://assets.example.com/library/test/')

  const manifest = (blocks: { id: string; category: string }[], overrides = {}) => ({
    version: '2026-09-10T00:00:00.000Z',
    count: blocks.length,
    blocks,
    ...overrides,
  })

  /** A bucket, as a map of URL → body. Anything absent 404s. */
  const bucket = (objects: Record<string, unknown>) => {
    vi.stubGlobal('fetch', async (input: URL | string) => {
      const key = String(input).replace(base.href, '')
      const body = objects[key]
      if (body === undefined) return new Response('nope', { status: 404 })
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
    })
  }

  afterEach(() => vi.unstubAllGlobals())

  const entry = { id: 'blk_authored_test', category: 'panel' }

  it('reads a manifest and the documents it names', async () => {
    bucket({
      'manifest.json': manifest([entry]),
      'blk_authored_test.json': valid(),
    })

    const library = await loadLibrary({ kind: 'r2', base })

    expect(library).toHaveLength(1)
    expect(library[0]?.id).toBe('blk_authored_test')
  })

  it('does NOT add the generated blocks — the bucket is the whole library', async () => {
    // Two arms would mean a deploy and a sync could disagree about what the
    // library is. Whatever is in the bucket is what every shop gets.
    bucket({ 'manifest.json': manifest([entry]), 'blk_authored_test.json': valid() })

    const library = await loadLibrary({ kind: 'r2', base })
    expect(library.map((block) => block.id)).not.toContain('blk_offer_card')
  })

  it('refuses when a document 404s, rather than seeding what arrived', async () => {
    // The one that matters: seeding one block here would prune the other
    // fifty-eight out of every shop.
    bucket({
      'manifest.json': manifest([entry, { id: 'blk_missing', category: 'footer' }]),
      'blk_authored_test.json': valid(),
    })

    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/blk_missing/)
    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/partial library/)
  })

  it('refuses an empty manifest instead of pruning the library away', async () => {
    bucket({ 'manifest.json': manifest([]) })
    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/empty/)
  })

  it('refuses a manifest whose count disagrees with its own list', async () => {
    // An interrupted publish, caught by the publisher's own bookkeeping.
    bucket({ 'manifest.json': manifest([entry], { count: 59 }) })
    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/interrupted publish/)
  })

  it('refuses when there is no manifest at the prefix', async () => {
    // Overwhelmingly the wrong prefix, so the message says so.
    bucket({})
    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/no manifest/)
  })

  it('holds a fetched document to the same bar as a committed file', async () => {
    // Nothing reviewed this document. It gets the schema, the structure, the
    // no-warnings rule and roles-only, exactly like a file in the repo.
    bucket({
      'manifest.json': manifest([entry]),
      'blk_authored_test.json': valid({
        arrangements: [
          {
            aspectMin: 0.4,
            aspectMax: 6,
            elements: [
              {
                id: 'ground',
                kind: 'shape',
                variant: 'rect',
                radius: 0,
                box: box(0, 0, 1, 1),
                fill: { from: 'hex', hex: '#143CD2' },
              },
            ],
          },
        ],
      }),
    })

    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/role/)
  })

  it('refuses a document that is not the block the manifest named', async () => {
    bucket({
      'manifest.json': manifest([entry]),
      'blk_authored_test.json': valid({ id: 'blk_something_else' }),
    })

    await expect(loadLibrary({ kind: 'r2', base })).rejects.toThrow(/half-finished publish/)
  })
})

describe('choosing a source', () => {
  const original = process.env['BLOCK_LIBRARY_URL']
  afterEach(() => {
    if (original === undefined) delete process.env['BLOCK_LIBRARY_URL']
    else process.env['BLOCK_LIBRARY_URL'] = original
  })

  it('is the repo when nothing is configured', () => {
    delete process.env['BLOCK_LIBRARY_URL']
    expect(resolveSource()).toEqual({ kind: 'local' })
  })

  it('is R2 when a prefix is given, trailing slash or not', () => {
    // A prefix written without a slash must not silently fetch
    // `library/manifest.json` instead of `library/production/manifest.json`.
    process.env['BLOCK_LIBRARY_URL'] = 'https://assets.example.com/library/production'
    expect(resolveSource()).toEqual({
      kind: 'r2',
      base: new URL('https://assets.example.com/library/production/'),
    })
  })

  it('treats an empty variable as unset rather than as a bucket at ""', () => {
    process.env['BLOCK_LIBRARY_URL'] = '  '
    expect(resolveSource()).toEqual({ kind: 'local' })
  })
})
