import { describe, expect, it } from 'vitest'
import { arrangementsSchema } from '@souqstudio/engine'
import { artShapeElement } from './block-elements'
import { parseSvgShape } from './svg-shape'

/**
 * Reading a drawing as geometry.
 *
 * **The refusals matter as much as the reads.** This module is what stands
 * between an uploaded file and a stored document, and the rule it works to is
 * that anything it cannot represent honestly is refused rather than
 * approximated: a file that comes back "unsupported" costs the owner one export
 * from their drawing program, and a file that comes back subtly wrong costs
 * them a print run.
 */

/** The file a shop owner actually sent us: one path, one fill, from Illustrator. */
const BUBBLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 102.84 88.07">
  <defs>
    <style>
      .cls-1 { fill: #fff; stroke-width: 0px; }
    </style>
  </defs>
  <g id="Capa_1" data-name="Capa 1">
    <path class="cls-1" d="M88.15,0H14.69C6.58,0,0,6.58,0,14.69v41.9c0,8.11,6.58,14.69,14.69,14.69h7.46c2.55,5.16,3.53,12.05-5.03,16.78,0,0,22.46-5.64,26.55-16.78h44.47c8.11,0,14.69-6.58,14.69-14.69V14.69c0-8.11-6.58-14.69-14.69-14.69Z"/>
  </g>
</svg>`

const read = (source: string) => {
  const parsed = parseSvgShape(source)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.art
}

const refusal = (source: string): string => {
  const parsed = parseSvgShape(source)
  if (parsed.ok) throw new Error('expected a refusal')
  return parsed.reason
}

const svg = (body: string, view = '0 0 100 100') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`

describe('a real file', () => {
  it('reads the outline and the size', () => {
    const art = read(BUBBLE)
    expect(art.width).toBe(102.84)
    expect(art.height).toBe(88.07)
    expect(art.paths).toHaveLength(1)
    expect(art.paths[0]!.d.startsWith('M88.15,0H14.69')).toBe(true)
  })

  /**
   * **The colour is gone, and that is the feature.** The file says `fill:#fff`
   * in a stylesheet; a shape takes its colour from the element, which is what
   * makes it recolourable and what makes this different from uploading the same
   * file as artwork.
   */
  it('keeps no colour from the file', () => {
    expect(JSON.stringify(read(BUBBLE))).not.toContain('fff')
  })

  it('skips the definitions block', () => {
    expect(read(BUBBLE).paths).toHaveLength(1)
  })

  /**
   * The round trip that matters: what the parser returns has to survive the
   * schema that guards the stored document. A parser that produced something
   * the block could not hold would fail at save time, on the owner.
   */
  it('produces a shape the document schema accepts', () => {
    const element = artShapeElement(read(BUBBLE))
    expect(() =>
      arrangementsSchema.parse([{ aspectMin: 0.1, aspectMax: 30, elements: [element] }])
    ).not.toThrow()
  })
})

describe('geometry', () => {
  it('carries a viewBox that does not start at the origin', () => {
    const art = read(svg('<path d="M0,0L10,10"/>', '-20 -30 100 100'))
    expect(art.paths[0]!.transform).toBe('translate(20 30)')
  })

  it('composes a group transform onto the path inside it', () => {
    const art = read(svg('<g transform="translate(5 5)"><path d="M0,0L1,1" transform="scale(2)"/></g>'))
    expect(art.paths[0]!.transform).toBe('translate(5 5) scale(2)')
  })

  it('stops composing once the group closes', () => {
    const art = read(svg('<g transform="translate(5 5)"><path d="M0,0L1,1"/></g><path d="M2,2L3,3"/>'))
    expect(art.paths[0]!.transform).toBe('translate(5 5)')
    expect(art.paths[1]!.transform).toBeUndefined()
  })

  it('turns a rounded rectangle into arcs', () => {
    const d = read(svg('<rect x="0" y="0" width="40" height="20" rx="5"/>')).paths[0]!.d
    expect(d.startsWith('M5,0')).toBe(true)
    expect(d).toContain('A5,5')
  })

  it('clamps a corner radius to half the side', () => {
    const d = read(svg('<rect x="0" y="0" width="10" height="10" rx="99"/>')).paths[0]!.d
    expect(d).toContain('A5,5')
  })

  it('turns a circle into two arcs', () => {
    expect(read(svg('<circle cx="50" cy="50" r="10"/>')).paths[0]!.d).toBe(
      'M40,50A10,10 0 0 1 60,50A10,10 0 0 1 40,50Z'
    )
  })

  it('closes a polygon and leaves a polyline open', () => {
    expect(read(svg('<polygon points="0,0 10,0 10,10"/>')).paths[0]!.d.endsWith('Z')).toBe(true)
    expect(read(svg('<polyline points="0,0 10,0 10,10"/>')).paths[0]!.d.endsWith('Z')).toBe(false)
  })

  it('reads an even-odd rule from the attribute or the inline style', () => {
    expect(read(svg('<path d="M0,0L1,1" fill-rule="evenodd"/>')).paths[0]!.evenOdd).toBe(true)
    expect(read(svg('<path d="M0,0L1,1" style="fill-rule:evenodd"/>')).paths[0]!.evenOdd).toBe(true)
    expect(read(svg('<path d="M0,0L1,1"/>')).paths[0]!.evenOdd).toBeUndefined()
  })

  it('falls back to width and height when there is no viewBox', () => {
    const art = read('<svg xmlns="http://www.w3.org/2000/svg" width="64px" height="32px"><path d="M0,0L1,1"/></svg>')
    expect([art.width, art.height]).toEqual([64, 32])
  })
})

describe('what it refuses', () => {
  it('refuses live text, and says how to fix it', () => {
    expect(refusal(svg('<text x="0" y="0">SALE</text>'))).toContain('outlines')
  })

  it('refuses an embedded photo, and points at the other upload', () => {
    expect(refusal(svg('<image href="data:image/png;base64,AAAA"/>'))).toContain('Upload artwork')
  })

  it('refuses a referenced shape rather than drawing an empty one', () => {
    expect(refusal(svg('<defs><path id="a" d="M0,0L1,1"/></defs><use href="#a"/>'))).toContain(
      'expanded'
    )
  })

  /** Ignoring a clip draws the unclipped outline, which looks deliberate and is wrong. */
  it('refuses a clipping mask', () => {
    expect(refusal(svg('<path d="M0,0L1,1" clip-path="url(#c)"/>'))).toContain('clipping mask')
  })

  it('refuses a transform it cannot read', () => {
    expect(refusal(svg('<path d="M0,0L1,1" transform="url(#evil)"/>'))).toContain('positioned')
  })

  /**
   * **The alphabet is the boundary.** Path data is commands and numbers; a `d`
   * holding anything else is refused outright rather than sanitised, because
   * there is no version of "clean this up" that stays true as SVG grows.
   */
  it('refuses path data that is not path data', () => {
    expect(refusal(svg('<path d="M0,0 url(javascript:alert(1))"/>'))).toContain('outline')
  })

  it('refuses a file with nothing to draw', () => {
    expect(refusal(svg('<defs><path d="M0,0L1,1"/></defs>'))).toContain('nothing to draw')
  })

  it('refuses a file that is not an SVG', () => {
    expect(refusal('just some text')).toContain('not an SVG')
  })

  it('refuses a drawing that does not say its size', () => {
    expect(refusal('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0L1,1"/></svg>')).toContain(
      'what size'
    )
  })

  /** A comment can hold a whole element, and nothing in it is meant to be drawn. */
  it('does not read a path out of a comment', () => {
    expect(refusal(svg('<!-- <path d="M0,0L9,9"/> -->'))).toContain('nothing to draw')
  })

  it('refuses a file too big to be a shape', () => {
    expect(refusal(`<svg viewBox="0 0 1 1">${'x'.repeat(520_000)}</svg>`)).toContain('too big')
  })

  it('refuses a drawing with more detail than a card can carry', () => {
    const long = `M0,0${'L1,1'.repeat(5_000)}`
    expect(refusal(svg(`<path d="${long}"/>`))).toContain('too much detail')
  })
})
