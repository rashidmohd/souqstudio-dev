'use client'

import * as React from 'react'

/**
 * Load a typeface from Google's CDN so the picker can draw a specimen of it.
 *
 * **This is the one place a font may still come from `fonts.googleapis.com`, and
 * it is deliberate.** `docs/fonts-from-google.md` §7 B1: the picker is a *browse*
 * surface. Nothing here renders a card, measures a string or reaches an export,
 * so none of §1's argument applies to it. The moment a family is chosen and
 * saved it is mirrored into R2, and every surface that draws or measures reads
 * it from there.
 *
 * Without this, an owner could pick any of the 57 offerable families but could
 * only ever *see* the ones somebody had already chosen, since only mirrored
 * families have an `@font-face` rule on the page. Choosing type you cannot look
 * at is not choosing.
 *
 * **Does nothing for a family already mirrored** — its rules are in the document
 * head already, and a second declaration from a different origin is how the
 * specimen and the artboard come to disagree about what a face looks like.
 */
export function useSpecimenFont(
  family: string,
  mirrored: boolean
): { pending: boolean } {
  const needed = family !== '' && !mirrored
  const [loaded, setLoaded] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!needed) return

    const href =
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}` +
      `&display=swap`

    let link = document.querySelector<HTMLLinkElement>(
      `link[data-specimen="${CSS.escape(family)}"]`
    )
    if (link === null) {
      link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      link.dataset.specimen = family
      document.head.appendChild(link)
    }

    let cancelled = false
    // The stylesheet arriving is not the face arriving. `fonts.load()` is what
    // waits for the actual file, which is what the preview is waiting on.
    const settle = () => {
      if (!cancelled) setLoaded(family)
    }
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.load(`400 16px "${family}"`).then(settle).catch(settle)
    } else {
      settle()
    }

    return () => {
      cancelled = true
    }
  }, [family, needed])

  /**
   * Stylesheets are left in the head rather than removed on unmount.
   *
   * An owner comparing four faces would otherwise re-download each one every
   * time they moved between them, and a `<link>` for a font nobody is drawing
   * costs nothing. They go when the page does.
   */
  return { pending: needed && loaded !== family }
}
