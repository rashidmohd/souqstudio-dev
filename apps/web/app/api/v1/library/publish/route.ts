import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { BLOCK_CATEGORIES } from '@souqstudio/engine'
import type { BlockCategory } from '@souqstudio/engine'
import { prisma } from '@souqstudio/db'
import { fail, ok } from '@/lib/api'
import { toArrangements } from '@/lib/block-document'
import { requireLibraryToken } from '@/lib/library-auth'
import {
  LibraryPublishError,
  libraryDocumentSchema,
  libraryPrefix,
  publishDocument,
} from '@/lib/library-store'

/**
 * Publish one block into the shared library. E7 —
 * `docs/block-library-from-r2.md` §8.
 *
 * **This is the route that makes the whole design worth anything.** Everything
 * else — the loader, the manifest, the sync — is machinery for getting a
 * document from a bucket into every shop. This is the only part that gets a
 * document *into the bucket* without a release, and "ship a design without
 * waiting for a deploy" is the entire benefit §6 claims.
 *
 * The design comes from `blocks`: somebody drew it in the designer, it is a row,
 * and this copies that row's document to R2. It does **not** publish from the
 * repo — that is `pnpm --filter @souqstudio/engine blocks:publish`, which is how
 * the generated library gets there in the first place.
 *
 * **Publishing does not change what any shop sees.** It writes an object. The
 * library only reaches shops when a sync runs — `POST /api/v1/library/sync`, or
 * the next deploy's seed. Two steps rather than one, so that publishing three
 * blocks is three writes and one sync, and so that "put it in the bucket" and
 * "give it to everybody" are separately decided and separately reversible.
 *
 * Authorised by a shared secret and never by a session. See `lib/library-auth.ts`
 * for why a role — even an owner's — is the wrong instrument here.
 */

const schema = z.object({
  /** The row to publish. A seeded block or an organization's own. */
  blockId: z.string().min(1),
  /**
   * The id it takes in the library, if it is not already one. An owner's block
   * has a cuid, which is a database key and not a name; the library's ids are
   * permanent and public — the seed upserts on them and a live book names them
   * inside its page grid as plain JSON.
   */
  id: z
    .string()
    .regex(/^blk_[a-z0-9_]+$/, 'A library id looks like "blk_ramadan_band".')
    .optional(),
  category: z
    .enum(BLOCK_CATEGORIES as unknown as [BlockCategory, ...BlockCategory[]])
    .optional(),
  /** Overrides the row's name and description for the shipped copy. */
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(200).optional(),
})

export async function POST(request: NextRequest) {
  const denied = requireLibraryToken(request)
  if (denied) return denied

  const prefix = libraryPrefix()
  if (prefix === null) {
    return fail(
      'not_configured',
      'BLOCK_LIBRARY_URL is not set, or does not sit under R2_PUBLIC_URL. Publishing needs a prefix this deployment also reads.',
      503
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.errors[0]?.message ?? 'Say which block to publish.')
  }

  // **Read without a tenancy filter, and that is correct here rather than a
  // missing check.** The caller holds the platform's publish token, not a
  // session; there is no organization in scope to filter by. The authority to
  // read any block is the same authority that puts one in front of every shop,
  // and it is checked above.
  const row = await prisma.block.findUnique({
    where: { id: parsed.data.blockId },
    select: {
      id: true,
      name: true,
      description: true,
      repeats: true,
      isSeasonal: true,
      category: true,
      arrangements: true,
    },
  })

  if (row === null) return fail('not_found', 'That block does not exist.', 404)

  const arrangements = toArrangements(row.arrangements)
  if (arrangements === null) {
    return fail('block_invalid', 'That block’s document does not parse. It cannot be published.', 422)
  }

  const id = parsed.data.id ?? (/^blk_[a-z0-9_]+$/.test(row.id) ? row.id : null)
  if (id === null) {
    return fail(
      'invalid_request',
      'This block has a generated id. Give it a library id — "id": "blk_ramadan_band" — because a library id is permanent and a cuid means nothing.'
    )
  }

  const category = parsed.data.category ?? (row.category as BlockCategory | null)
  if (category === null) {
    return fail(
      'invalid_request',
      `Say which group it belongs to: ${BLOCK_CATEGORIES.join(', ')}.`
    )
  }

  const document = libraryDocumentSchema.safeParse({
    id,
    name: parsed.data.name ?? row.name,
    description: parsed.data.description ?? row.description ?? '',
    repeats: row.repeats,
    category,
    isSeasonal: row.isSeasonal,
    arrangements,
  })

  if (!document.success) {
    return fail('block_invalid', document.error.errors[0]?.message ?? 'That block cannot be published.', 422)
  }

  try {
    const manifest = await publishDocument(prefix, document.data)
    return ok({
      id: document.data.id,
      prefix,
      version: manifest.version,
      count: manifest.count,
      // Said plainly, because the two-step is the part people get wrong.
      synced: false,
      next: 'POST /api/v1/library/sync to give it to every shop, or wait for the next deploy.',
    })
  } catch (error) {
    if (error instanceof LibraryPublishError) return fail(error.code, error.message, 422)
    throw error
  }
}
