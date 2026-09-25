import 'server-only'

import { z } from 'zod'
import { BLOCK_CATEGORIES, OCCASIONS, arrangementsSchema, usesOnlyRoles } from '@souqstudio/engine'
import type { BlockCategory, Occasion } from '@souqstudio/engine'
import { env } from '@/lib/env'
import { getObjectBytes, putObject } from '@/lib/r2'

/**
 * Writing the shared block library to R2. E7 —
 * `docs/block-library-from-r2.md` §8 steps 4 and 6.
 *
 * **The read side is in the engine and the write side is here**, and the split
 * is not arbitrary: reading is a plain HTTPS GET from the bucket's public
 * origin, which the engine can do with no SDK and no credentials, and it has to
 * be able to because the *seed* reads the library. Writing needs keys, and keys
 * live in the app.
 *
 * `packages/engine/src/library-source.ts` is the reader. Everything it refuses —
 * an empty manifest, a count that disagrees with its own list, a document that
 * is not the block the manifest named — is a thing this module must not produce.
 */

const manifestEntry = z.object({
  id: z.string().min(1),
  category: z.enum(BLOCK_CATEGORIES as unknown as [BlockCategory, ...BlockCategory[]]),
  /**
   * Set on every entry this route writes. `blocks:publish` keeps these when it
   * rewrites the list from the repo, so a re-run of the script cannot drop a
   * block the panel published. Declared here because zod strips an undeclared
   * key, and the read-modify-write below would erase it from every other entry.
   */
  origin: z.literal('panel').optional(),
})

const manifestSchema = z.object({
  version: z.string(),
  count: z.number().int().nonnegative(),
  blocks: z.array(manifestEntry),
  /**
   * Ids the panel unpublished, so `blocks:publish` does not put a repo copy
   * straight back. Declared for the same reason as `origin`: zod strips an
   * undeclared key, and the read-modify-write here would erase the list.
   */
  retired: z.array(z.string()).optional(),
})

export type LibraryManifest = z.infer<typeof manifestSchema>

/**
 * The document a library object holds — the same shape `SeedBlock` has, because
 * the loader parses it into one.
 */
export const libraryDocumentSchema = z.object({
  id: z.string().regex(/^blk_[a-z0-9_]+$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(200),
  repeats: z.boolean(),
  category: z.enum(BLOCK_CATEGORIES as unknown as [BlockCategory, ...BlockCategory[]]),
  isSeasonal: z.boolean(),
  /**
   * Which occasion, for a seasonal block. Optional: absent from every document
   * published before the admin panel could set it, and the engine's loader
   * falls back to `BLOCK_OCCASION` for those.
   */
  occasion: z
    // `z.enum` wants a non-empty tuple and `map` returns an array; OCCASIONS is
    // a literal with ten entries, so the tuple is what it is.
    .enum(OCCASIONS.map((o) => o.value) as [Occasion, ...Occasion[]])
    .optional(),
  arrangements: arrangementsSchema,
})

export type LibraryDocument = z.infer<typeof libraryDocumentSchema>

/**
 * The prefix this deployment publishes to, derived from the URL it reads.
 *
 * **One variable, so a deployment cannot publish somewhere it does not read.**
 * Two variables would allow exactly that, and the symptom would be a publish
 * that reports success and a sync that never sees it — with both halves
 * individually correct. The prefix is whatever path `BLOCK_LIBRARY_URL` names
 * under the public origin.
 */
export function libraryPrefix(): string | null {
  if (env.BLOCK_LIBRARY_URL === undefined) return null

  const base = new URL(env.BLOCK_LIBRARY_URL)
  const origin = new URL(env.R2_PUBLIC_URL)

  // The public URL and the library URL must name the same origin, or the key
  // computed here addresses an object the reader will never fetch.
  if (base.origin !== origin.origin) return null

  const path = base.pathname.replace(/^\/+|\/+$/g, '')
  const root = origin.pathname.replace(/^\/+|\/+$/g, '')
  const prefix = root === '' ? path : path.slice(root.length).replace(/^\/+/, '')

  return prefix === '' ? null : prefix
}

/** The manifest as it stands, or null if nothing has been published yet. */
export async function readManifest(prefix: string): Promise<LibraryManifest | null> {
  const bytes = await getObjectBytes(`${prefix}/manifest.json`)
  if (bytes === null) return null

  const parsed = manifestSchema.safeParse(JSON.parse(bytes.toString('utf8')))
  return parsed.success ? parsed.data : null
}

/**
 * Publish one document, then re-write the manifest to name it.
 *
 * **Document first, manifest second** — the same order the CLI uses and for the
 * same reason. A manifest naming an object that is not there yet is a window in
 * which every sync fails; a manifest that has not caught up is a window in which
 * the library is one design out of date. One is an outage, the other is a delay.
 *
 * **The manifest is read-modify-written, and that is a single-writer
 * assumption.** Two publishes landing together can lose one of them — the second
 * read happens before the first write, and the later manifest wins. It is
 * survivable because the token means there is exactly one publisher and the
 * losing design is restored by publishing it again, but it is a real limitation
 * rather than an oversight, and it is the first thing that must change if
 * publishing is ever opened to more than one person. E13.
 */
export async function publishDocument(
  prefix: string,
  document: LibraryDocument
): Promise<LibraryManifest> {
  // The rule the loader will apply at the far end. Refusing here means the
  // person who drew the block hears about it; refusing there means a deploy does.
  if (!usesOnlyRoles(document.arrangements)) {
    throw new LibraryPublishError(
      'colors_not_roles',
      'This block names a colour directly. A block in the shared library is drawn in whichever shop loads it, so every colour has to be a role from the brand kit.'
    )
  }

  await putObject(
    `${prefix}/${document.id}.json`,
    Buffer.from(`${JSON.stringify(document, null, 2)}\n`),
    'application/json; charset=utf-8'
  )

  const current = await readManifest(prefix)
  const blocks = (current?.blocks ?? []).filter((entry) => entry.id !== document.id)
  blocks.push({ id: document.id, category: document.category, origin: 'panel' })
  // Publishing an id is the decision to have it back, if it was unpublished.
  const retired = (current?.retired ?? []).filter((id) => id !== document.id)

  const manifest: LibraryManifest = {
    version: new Date().toISOString(),
    count: blocks.length,
    blocks,
    ...(retired.length === 0 ? {} : { retired }),
  }

  await putObject(
    `${prefix}/manifest.json`,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    'application/json; charset=utf-8'
  )

  return manifest
}

/**
 * Take one block out of the library. E13-04.
 *
 * **Only the manifest changes.** A reader sees what the manifest names, so the
 * block is gone from the library the moment this lands; its document is left
 * where it is, for the same reason `blocks:publish` deletes nothing without
 * `--prune`. Nothing a shop sees changes until the next sync, which archives
 * the block where a book draws it and deletes it where nothing does.
 *
 * The id is recorded under `retired`, so a later `blocks:publish` from the
 * repo does not quietly put a repo copy back.
 */
export async function unpublishDocument(prefix: string, id: string): Promise<LibraryManifest> {
  const current = await readManifest(prefix)
  if (current === null || !current.blocks.some((entry) => entry.id === id)) {
    throw new LibraryPublishError('not_published', `${id} is not in the library at ${prefix}/.`)
  }

  const blocks = current.blocks.filter((entry) => entry.id !== id)
  if (blocks.length === 0) {
    // The loader refuses an empty library and the sync would prune every block
    // with it. Unpublishing the last block is not a thing this should do.
    throw new LibraryPublishError(
      'last_block',
      'That is the only block in the library. A library cannot be empty.'
    )
  }

  const retired = [...new Set([...(current.retired ?? []), id])]
  const manifest: LibraryManifest = {
    version: new Date().toISOString(),
    count: blocks.length,
    blocks,
    retired,
  }

  await putObject(
    `${prefix}/manifest.json`,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
    'application/json; charset=utf-8'
  )

  return manifest
}

/** A refusal the route can turn into a sentence a person reads. */
export class LibraryPublishError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'LibraryPublishError'
  }
}
