import 'server-only'

import { z } from 'zod'
import { BLOCK_CATEGORIES, arrangementsSchema, usesOnlyRoles } from '@souqstudio/engine'
import type { BlockCategory } from '@souqstudio/engine'
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
})

const manifestSchema = z.object({
  version: z.string(),
  count: z.number().int().nonnegative(),
  blocks: z.array(manifestEntry),
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
  blocks.push({ id: document.id, category: document.category })

  const manifest: LibraryManifest = {
    version: new Date().toISOString(),
    count: blocks.length,
    blocks,
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
