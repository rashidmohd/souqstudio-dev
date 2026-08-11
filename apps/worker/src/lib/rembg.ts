import { env } from './env'

/**
 * The Rembg microservice. Python-only, which is the whole reason it runs out of
 * process — see souqstudio-technical → "Rembg as a Python microservice".
 *
 * It takes an image and returns a transparent PNG. It is also the single most
 * likely thing in this system to be unavailable: a separate service, a separate
 * deploy, a cold model load. Everything here is written on the assumption that
 * it will sometimes not answer.
 */

/**
 * Generous, because a cold Rembg loads a model on the first request and a
 * 1024px logo is not instant. Still bounded — a hung socket must not hold a
 * worker slot until the process restarts.
 */
const REQUEST_TIMEOUT_MS = 60_000

export class RembgUnavailableError extends Error {
  constructor(cause: string) {
    super(`Rembg is unavailable: ${cause}`)
    this.name = 'RembgUnavailableError'
  }
}

/**
 * Strip the background from an image.
 *
 * Throws `RembgUnavailableError` when the service cannot be reached or refuses
 * the request. The caller is expected to treat that as "keep the original",
 * not as a job that should be retried forever — see bg.job.ts.
 */
export async function removeBackground(image: Buffer, filename: string): Promise<Buffer> {
  const form = new FormData()
  // A Blob rather than the Buffer directly: undici will not set a filename or a
  // part content type for a bare Buffer, and Rembg's FastAPI endpoint rejects
  // the part without them.
  // `new Uint8Array(image)` rather than the Buffer itself: a Node Buffer may be
  // backed by a SharedArrayBuffer, which BlobPart does not accept.
  form.append('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), filename)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${env.REMBG_SERVICE_URL.replace(/\/$/, '')}/remove`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
  } catch (error) {
    // Connection refused, DNS failure, timeout — all the same to the caller.
    throw new RembgUnavailableError(
      error instanceof Error ? (error.name === 'AbortError' ? 'timed out' : error.message) : 'unknown'
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new RembgUnavailableError(`responded ${response.status}`)
  }

  const result = Buffer.from(await response.arrayBuffer())
  if (result.length === 0) throw new RembgUnavailableError('returned an empty body')
  return result
}
