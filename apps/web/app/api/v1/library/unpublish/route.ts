import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { fail, ok } from '@/lib/api'
import { requireLibraryToken } from '@/lib/library-auth'
import { LibraryPublishError, libraryPrefix, unpublishDocument } from '@/lib/library-store'

/**
 * Take one block out of the shared library. E13-04, the other half of
 * `POST /api/v1/library/publish`.
 *
 * **Like publishing, it changes nothing a shop sees by itself.** It rewrites the
 * manifest; the next sync (`POST /api/v1/library/sync`, or a deploy's seed) is
 * what takes the block away from shops, archiving it where a book already
 * draws it and deleting it where nothing does. So a sent flyer never loses a
 * block.
 *
 * Authorised by the same shared secret as publish and sync, never a session.
 * The admin panel holds it; see `lib/library-auth.ts`.
 */

const schema = z.object({
  id: z.string().regex(/^blk_[a-z0-9_]+$/, 'A library id looks like "blk_ramadan_band".'),
})

export async function POST(request: NextRequest) {
  const denied = requireLibraryToken(request)
  if (denied) return denied

  const prefix = libraryPrefix()
  if (prefix === null) {
    return fail(
      'not_configured',
      'BLOCK_LIBRARY_URL is not set, or does not sit under R2_PUBLIC_URL. Unpublishing needs a prefix this deployment also reads.',
      503
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.errors[0]?.message ?? 'Say which block to unpublish.')
  }

  try {
    const manifest = await unpublishDocument(prefix, parsed.data.id)
    return ok({
      id: parsed.data.id,
      prefix,
      version: manifest.version,
      count: manifest.count,
      synced: false,
      next: 'POST /api/v1/library/sync to take it away from shops, or wait for the next deploy.',
    })
  } catch (error) {
    if (error instanceof LibraryPublishError) return fail(error.code, error.message, 422)
    throw error
  }
}
