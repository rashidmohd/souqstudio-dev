/**
 * Where a block's artwork lives. E7.
 *
 * **`ImageSource.assetId` is the R2 object key for artwork an owner uploaded**,
 * and this is the one function that knows it. A deliberate simplification, and
 * the reason is worth stating: `image_assets` exists but every row on it hangs
 * off a catalog product, and a table for block artwork is a schema decision
 * rather than something an upload route should invent. Written up in
 * `docs/E7-pending.md`.
 *
 * **The base is passed in rather than read from the environment.** `R2_PUBLIC_URL`
 * is a server variable and the designer is a client component; making it public
 * to save a prop would put a deployment detail into the browser bundle for the
 * life of the app.
 *
 * Deterministic, so a block document is portable: nothing has to be resolved
 * through the database to draw a card. That matters more here than usual — the
 * export worker draws the same block, and a resolver that needed a query would
 * put Prisma back inside the render path.
 */
export function assetResolver(baseUrl: string): (assetId: string) => string | null {
  const base = baseUrl.replace(/\/$/, '')
  return (assetId) => (assetId === '' ? null : `${base}/${assetId}`)
}

/**
 * Where SouqStudio's library artwork lives in the bucket.
 *
 * A shop's artwork is under its organization's id; library artwork belongs to
 * no organization, so it gets a prefix of its own. Here rather than in either
 * app because both read it: `apps/admin` writes under it, and `apps/web` keeps
 * what is under it out of shops' pickers until a published block uses it.
 */
export const LIBRARY_ASSET_PREFIX = 'library/blocks/'

/**
 * Every artwork key a block document draws: every `assetId`, on an image
 * element, a page background or anything else. A blurred upload's unblurred
 * original is provenance rather than paint and is not collected.
 *
 * **A walk over the JSON rather than over the element types**, because the
 * question is "does anything in this document point at that object", and a
 * typed walk answers it only for the places somebody remembered to list. A new
 * element kind that carries an `assetId` is covered the day it ships.
 */
export function referencedAssetIds(document: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(document)) {
    for (const item of document) referencedAssetIds(item, into)
  } else if (document !== null && typeof document === 'object') {
    for (const [key, value] of Object.entries(document)) {
      if (key === 'assetId' && typeof value === 'string' && value !== '') into.add(value)
      else referencedAssetIds(value, into)
    }
  }
  return into
}
