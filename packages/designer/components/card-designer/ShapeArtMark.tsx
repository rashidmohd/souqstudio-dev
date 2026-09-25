import type { ShapeArt } from '@souqstudio/types'

/**
 * An uploaded or gallery outline as a small picture, filled with the text
 * colour. For choosing a shape, never for a card: on the artboard the outline
 * is drawn by the painter in the shop's colours, like every other element.
 *
 * The outline is path data validated by the engine's `shapeArtSchema` (path
 * commands, numbers and six transform functions), so it is drawn as it is.
 */
export function ShapeArtMark({ art, className }: { art: ShapeArt; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${art.width} ${art.height}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {art.paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          transform={path.transform}
          fillRule={path.evenOdd === true ? 'evenodd' : 'nonzero'}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}
