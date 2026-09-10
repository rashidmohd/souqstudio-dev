import type { NextRequest } from 'next/server'
import { syncLibrary } from '@souqstudio/db'
// **`loadFromR2`, not `loadLibrary`.** The dispatching version lives in
// `library-load.ts`, which reads the filesystem and which a Next build cannot
// follow. This route only ever wants the published library, so importing the
// narrower thing is both correct and the only thing that compiles.
import { loadFromR2, resolveSource } from '@souqstudio/engine/src/library-source'
import { fail, ok } from '@/lib/api'
import { requireLibraryToken } from '@/lib/library-auth'

/**
 * Give the published library to every shop. E7 —
 * `docs/block-library-from-r2.md` §8 step 6, and §4.
 *
 * **§4 is the reason this route exists.** R2 changes *what the seed reads*; it
 * does not change *when the seed runs*, and the only thing that runs the seed is
 * a deploy. Without this, "publish a design without waiting for a release" is
 * false — the object sits in the bucket until somebody ships something. This is
 * the missing half.
 *
 * It does exactly what `pnpm db:seed` does to the `blocks` table and nothing
 * else: same loader, same `syncLibrary`, same prune. One implementation, because
 * a second one would mean the library means one thing after a deploy and another
 * after a sync.
 *
 * ## What can go wrong, and what happens instead
 *
 * The prune is the dangerous part: a seeded block the library no longer lists is
 * archived if a book uses it and deleted if not. So a *short* read is
 * indistinguishable from a withdrawal, and a 500 from a CDN could take blocks
 * out of every shop on the platform.
 *
 * `loadLibrary` refuses before returning in every one of those cases — a missing
 * document, a manifest whose count disagrees with its own list, an empty
 * manifest, a document that is not the block the manifest named. This route
 * therefore either writes a complete library or writes nothing, and the failure
 * is a 502 with the loader's own sentence in it.
 */
export async function POST(request: NextRequest) {
  const denied = requireLibraryToken(request)
  if (denied) return denied

  const source = resolveSource()
  if (source.kind !== 'r2') {
    // Syncing from the repo would seed the deployment's *compiled-in* library,
    // which is whatever was last released — the opposite of what this route is
    // for, and it would prune anything published since.
    return fail(
      'not_configured',
      'BLOCK_LIBRARY_URL is not set on this deployment, so there is no published library to sync from.',
      503
    )
  }

  let library
  try {
    library = await loadFromR2(source.base)
  } catch (error) {
    // The loader's message names what was expected and what arrived. It is
    // written to be read by a person holding a failed deploy, so it is passed
    // through rather than replaced with something reassuring.
    return fail('library_unreadable', (error as Error).message, 502)
  }

  const result = await syncLibrary(library)

  return ok({
    source: source.base.href,
    ...result,
  })
}
