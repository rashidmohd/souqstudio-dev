/**
 * Blurring a background image — **in the browser, into pixels, once.**
 *
 * **Not a filter, and that is the whole point.** E14 §2.4 rendered nine cases to
 * PDF through headless Chrome and counted the objects: `feGaussianBlur`
 * rasterises its own element at a resolution *Chromium* picks — about 220dpi for
 * a card-sized element on A4, under the 300dpi print target and reachable from
 * nothing in the document. `filter: drop-shadow()` on text is worse: the font
 * leaves the PDF and the price becomes a picture. So filters are banned on
 * anything that reaches the export path, and the shadows in this product are
 * drawn as concentric vector rings for the same reason.
 *
 * A blurred *photograph* has no such escape — a soft image is soft pixels. So it
 * is produced as pixels, stored as its own asset, and drawn by an `<image>` that
 * carries no filter at all. The page stays vector, the export stays vector, and
 * the resolution is the source's rather than the renderer's guess.
 *
 * **Here rather than in the worker**, which is the other place it could live.
 * The queue exists for work that is slow, expensive or must not be lost — a PDF,
 * a model call, a matte. Blurring a background is none of those: it is a slider
 * an owner drags, it wants to answer in the same gesture, and a job queue would
 * put a poll and a spinner between the drag and the picture. Canvas does it in
 * milliseconds on bytes the browser has already downloaded to draw the page.
 */

/**
 * How far past the frame the source is drawn before blurring.
 *
 * **A blur samples transparent black outside the canvas**, so blurring an image
 * drawn edge to edge fades its own border to nothing and the page shows a pale
 * halo down every side. Drawing it larger than the frame and cropping back puts
 * that fade outside the picture. Two radii of overscan is past where the kernel
 * still contributes anything visible.
 */
const OVERSCAN_RADII = 2

/** What the canvas writes. WebP carries alpha and is a third of PNG's size. */
const OUTPUT_TYPE = 'image/webp'
const OUTPUT_QUALITY = 0.92

/**
 * The upper bound the control and the route both enforce, as a fraction of the
 * image's shorter edge. Past this a background is a wash rather than a picture.
 */
export const MAX_BLUR_RADIUS = 0.06

/**
 * Blur `url` and hand back a file ready for `uploadArtwork`.
 *
 * Returns null rather than throwing on every failure an owner could cause — a
 * file the decoder refuses, a bucket without its CORS policy, a canvas that
 * declines to encode. The caller shows one sentence; none of these are
 * distinguishable to the person reading it.
 *
 * `radius` is a fraction of the image's shorter edge, so the same value looks
 * the same on a 4000px photograph and an 800px one once both are scaled to
 * cover the page.
 */
export async function renderBlurred(
  url: string,
  radius: number,
  filename = 'background-blurred.webp'
): Promise<File | null> {
  if (radius <= 0) return null

  const image = await loadImage(url)
  if (image === null) return null

  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width === 0 || height === 0) return null

  const pixels = Math.min(width, height) * Math.min(radius, MAX_BLUR_RADIUS)
  if (pixels < 0.5) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (context === null) return null

  /*
   * **`ctx.filter` is a canvas operation, not a document one.** It blurs the
   * bytes as they are drawn and leaves nothing behind in the DOM or the SVG —
   * which is precisely the distinction the ban is about. What lands in the
   * bucket is an ordinary picture that happens to be soft.
   */
  context.filter = `blur(${pixels}px)`

  // Overscan, per the constant's note: draw larger than the frame and let the
  // kernel's fade fall outside it.
  const bleed = pixels * OVERSCAN_RADII
  context.drawImage(image, -bleed, -bleed, width + bleed * 2, height + bleed * 2)

  /*
   * **PNG if WebP does not encode.** The spec says a UA that cannot encode the
   * requested type falls back to `image/png`, and most do — but `toBlob` is
   * also allowed to hand back null, and a null here is indistinguishable from
   * a CORS failure in the message the owner reads. Asking twice costs one
   * encode on the browsers that need it and nothing on the rest.
   */
  const blob =
    (await encode(canvas, OUTPUT_TYPE)) ?? (await encode(canvas, 'image/png'))
  if (blob === null) {
    console.error('[blur] the canvas would not encode a blob, neither WebP nor PNG')
    return null
  }

  const type = blob.type === '' ? OUTPUT_TYPE : blob.type
  const name = type === 'image/png' ? filename.replace(/\.webp$/, '.png') : filename
  return new File([blob], name, { type })
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, OUTPUT_QUALITY)
    } catch (problem) {
      // A tainted canvas throws here rather than resolving null. It should be
      // unreachable — `loadImage` refuses a source it could not read with CORS
      // — but the distinction is worth keeping in the log if it ever is.
      console.error('[blur] the canvas refused to encode; it is probably tainted', problem)
      resolve(null)
    }
  })
}

/**
 * Load an image the canvas is allowed to read back.
 *
 * **`crossOrigin` before `src`, and it is load-bearing.** Assets are served from
 * the bucket's own domain, so without it the canvas is *tainted* and `toBlob`
 * throws `SecurityError` — the image draws correctly and only the export fails,
 * which is the worst shape a bug of this kind can take. It works because
 * `scripts/r2-cors.mjs` allows `GET` from the app's origins; a bucket that never
 * had the policy applied fails here rather than silently producing nothing.
 */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => {
      console.error(
        `[blur] could not load ${url}, the bucket's CORS policy does not cover this origin, or the object is gone`
      )
      resolve(null)
    }
    image.src = corsUrl(url)
  })
}

/**
 * The same object, asked for in a way the cache cannot answer with the wrong
 * copy.
 *
 * **The artboard has already downloaded this picture without CORS.** It draws
 * backgrounds and artwork as `<image href>` inside the SVG, and SVG images carry
 * no `crossorigin` attribute — so the response sits in the HTTP cache with no
 * `Access-Control-Allow-Origin` on it. A later request for the *same URL* with
 * `crossOrigin = 'anonymous'` can be served that entry, and the load then fails
 * however correct the bucket's policy is. It is the classic shape of this bug:
 * it only appears once the picture is on screen, which is always.
 *
 * A query parameter makes it a different cache key, so the CORS request goes to
 * the network and comes back with the header. It costs one extra download of a
 * picture the owner is about to change anyway.
 */
function corsUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}sq-cors=1`
}
