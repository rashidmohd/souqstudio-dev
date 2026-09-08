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
