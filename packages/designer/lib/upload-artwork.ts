/**
 * Putting an owner's artwork in the bucket, and getting back the id that names
 * it. E7, and now E6's page background.
 *
 * **Extracted the day a second caller appeared.** This was inside
 * `DesignerShell`, which was the only place an owner could upload anything; the
 * page background needs exactly the same three steps, and a second copy of a
 * three-request handshake is a second copy that will drift on the day one of the
 * routes changes.
 *
 * The three steps, and none is optional:
 *
 * 1. **Authorise.** The server presigns a PUT and hands back the object key.
 * 2. **PUT the bytes straight to R2.** They never pass through a route — the
 *    same reason the logo path does not proxy them: a serverless function caps
 *    its body well below the size real artwork reaches, and proxying would
 *    reject valid files with a platform error the shop owner can do nothing
 *    about.
 * 3. **Record it.** The bytes went browser → R2, so nothing on the server knows
 *    the file's shape until it reads the object back, and the row is what makes
 *    this artwork appear in the picker next time instead of being re-uploaded.
 *
 * No `server-only`: it runs in the browser by design, and step 2 is the reason.
 */

/**
 * **A vector takes a different road, and it has to.**
 *
 * An SVG accepted from an upload is script-bearing content that would be served
 * from our own domain, and what the presigned flow authorises is a PUT straight
 * into the bucket. So it goes through the server instead, is rasterised, and a
 * PNG is stored. Affordable only because an SVG is small enough to fit in a
 * request body — which is precisely why the other formats cannot do this.
 */
async function uploadVector(file: File): Promise<string | null> {
  const raster = await fetch('/api/v1/blocks/artwork/vector', {
    method: 'POST',
    headers: { 'content-type': 'image/svg+xml', 'x-filename': encodeURIComponent(file.name) },
    body: file,
  })
  const drawn = (await raster.json()) as { data: { assetId: string } | null }
  return drawn.data?.assetId ?? null
}

/**
 * The R2 object key, or null if any step failed.
 *
 * **Null rather than a thrown error**, because every caller's response is the
 * same sentence to the owner and none of them can act on which step failed. The
 * caller owns its own busy state: this returns when the bytes are in the bucket
 * and recorded, and a spinner belongs to whatever is being blocked by that.
 */
export async function uploadArtwork(file: File): Promise<string | null> {
  if (file.type === 'image/svg+xml') return uploadVector(file)

  const authorise = await fetch('/api/v1/blocks/artwork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
  })
  const body = (await authorise.json()) as {
    data: { uploadUrl: string; assetId: string } | null
  }
  if (body.data === null) return null

  const put = await fetch(body.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  })
  if (!put.ok) return null

  const record = await fetch('/api/v1/blocks/assets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ assetId: body.data.assetId, filename: file.name }),
  })
  if (!record.ok) return null

  return body.data.assetId
}
