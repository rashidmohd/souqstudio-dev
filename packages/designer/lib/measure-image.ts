/**
 * A picture's own size, read in the browser. Null if it will not load.
 *
 * For placing artwork at its own proportions when nothing else knows them: a
 * generated image carries no dimensions in its listing, and a fresh upload is
 * a file the server has not measured yet. The library's own assets carry
 * theirs and skip this.
 */
export function measureImage(src: string | Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src)
    const done = (size: { width: number; height: number } | null) => {
      if (typeof src !== 'string') URL.revokeObjectURL(url)
      resolve(size)
    }
    const img = new window.Image()
    img.onload = () =>
      done(img.naturalWidth > 0 && img.naturalHeight > 0
        ? { width: img.naturalWidth, height: img.naturalHeight }
        : null)
    img.onerror = () => done(null)
    img.src = url
  })
}
