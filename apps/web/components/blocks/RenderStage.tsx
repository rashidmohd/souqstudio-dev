'use client'

import * as React from 'react'

/**
 * The frame the worker screenshots, and the signal that it is safe to.
 *
 * **Ready means fonts measured and pictures decoded.** `BlockPreview` lays text
 * out with an estimate until the shop's faces have loaded, then again with the
 * real measurer, and artwork arrives over the network. A capture taken before
 * either lands is a PNG of the wrong line breaks or of empty boxes, and it would
 * be stored as the block. So this waits for the document's fonts, then for
 * every image the SVG references, then two frames for the re-render they cause
 * to paint, and only then sets `data-render-ready`. The worker waits for that
 * attribute and never for a fixed delay.
 *
 * A picture that fails to load does not hold the frame forever: it is drawn
 * without, which is what the live preview would show too.
 */
export function RenderStage({
  renderKey,
  width,
  height,
  children,
}: {
  /** Reported back so the worker files the PNG under what was actually drawn. */
  renderKey: string
  width: number
  height: number
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let live = true

    void (async () => {
      await document.fonts.ready

      const hrefs = Array.from(ref.current?.querySelectorAll('image') ?? [])
        .map((image) => image.getAttribute('href') ?? image.getAttribute('xlink:href'))
        .filter((href): href is string => href !== null && href !== '')

      await Promise.all(
        hrefs.map(
          (href) =>
            new Promise<void>((resolve) => {
              const probe = new Image()
              probe.onload = () => resolve()
              probe.onerror = () => resolve()
              probe.src = href
            })
        )
      )

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (live) setReady(true)
    })()

    return () => {
      live = false
    }
  }, [])

  return (
    <div
      ref={ref}
      id="block-thumbnail"
      data-render-key={renderKey}
      data-render-ready={ready ? 'true' : undefined}
      style={{ width, height }}
    >
      {children}
    </div>
  )
}
