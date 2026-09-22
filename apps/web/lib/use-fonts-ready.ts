'use client'

import * as React from 'react'

/**
 * Whether the brand faces this surface draws in are loaded and measurable.
 *
 * **`measureText` measures against whatever the browser has.** It builds a CSS
 * font shorthand naming the shop's family and asks a canvas context for the
 * width. If that face has not arrived yet the context silently falls back to a
 * system font and answers confidently — and every wrap, every fit-ladder step
 * and every shrink-to-fit decision on the card is made against the wrong
 * metrics. Nothing fails; the card is just laid out for a typeface it is not
 * drawn in.
 *
 * `apps/web/CLAUDE.md` has required `await document.fonts.load()` before text
 * measurement since E4 and it was called nowhere. This is it.
 *
 * **Until the faces are ready the estimator is used instead**, not the canvas.
 * That looks backwards — the estimator is 5–40% off at the median, per E14 Phase
 * 0.1 — but it is the same measurer the server rendered with, so the first paint
 * matches SSR instead of hydrating into a differently-wrong layout. Once this
 * flips true the component re-renders and measures for real.
 *
 * **Re-running on a font change is the other half**, and the reason the key is
 * derived from the families rather than a mount flag: an owner switching a
 * typeface in the brand panel must cause a re-measure, or the artboard keeps the
 * boxes it computed for the old face.
 */
export function useFontsReady(
  families: readonly string[],
  weights: readonly number[]
): boolean {
  // A stable string, because these arrays are rebuilt on every render and an
  // effect keyed on their identity would re-run forever.
  const key = React.useMemo(
    () =>
      `${[...new Set(families)].sort().join('|')}::${[...new Set(weights)]
        .sort((a, b) => a - b)
        .join(',')}`,
    [families, weights]
  )

  const [readyKey, setReadyKey] = React.useState<string | null>(null)

  React.useEffect(() => {
    // No FontFaceSet — an old browser, or a test environment without one. Report
    // ready rather than blocking on a promise that will never settle: a slightly
    // wrong measurement beats a card that never lays out at all.
    if (typeof document === 'undefined' || !('fonts' in document)) {
      setReadyKey(key)
      return
    }

    let cancelled = false
    const [familyPart, weightPart] = key.split('::')
    const wanted = (familyPart ?? '').split('|').filter(Boolean)
    const sizes = (weightPart ?? '').split(',').filter(Boolean)

    // The size in the shorthand is irrelevant to whether the face loads, but the
    // shorthand is invalid without one. The weight is not irrelevant: a family
    // is delivered per weight, and loading 400 says nothing about 700 — which is
    // where a product name is drawn.
    const specs = wanted.flatMap((family) => sizes.map((weight) => `${weight} 16px "${family}"`))

    Promise.all(
      // A face that fails to load must not hold the surface unlaid out forever;
      // it falls back, which is what `resolveFont` already decided it should do.
      specs.map((spec) => document.fonts.load(spec).catch(() => undefined))
    ).then(() => {
      if (!cancelled) setReadyKey(key)
    })

    return () => {
      cancelled = true
    }
  }, [key])

  return readyKey === key
}
