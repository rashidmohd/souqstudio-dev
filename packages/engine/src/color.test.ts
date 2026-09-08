import { describe, expect, it } from 'vitest'
import type { BrandColor, ColorValue } from '@souqstudio/types'
import { flatten, gradientVector, resolveColor, resolvePaint } from './color'

/**
 * Resolving a fill, and the reason this file exists is the gradient: it is the
 * one place a colour stops being a string, and both renderers read the numbers
 * from here rather than computing their own.
 */

const KIT: Record<string, string> = {
  primary: '#123456',
  secondary: '#222222',
  accent: '#abcdef',
  surface: '#ffffff',
  ink: '#111111',
  inkMuted: '#777777',
}

const token = (ref: string) => KIT[ref] ?? '#000000'
const PALETTE: BrandColor[] = [{ id: 'col_1', name: 'Ramadan gold', hex: '#d4af37' }] as BrandColor[]

describe('resolveColor', () => {
  it('reads a role through the kit', () => {
    expect(resolveColor({ from: 'role', ref: 'primary' }, token)).toBe('#123456')
  })

  it('passes a literal through', () => {
    expect(resolveColor({ from: 'hex', hex: '#d4af37' }, token)).toBe('#d4af37')
  })

  it('reads a palette entry by id', () => {
    expect(resolveColor({ from: 'palette', id: 'col_1' }, token, PALETTE)).toBe('#d4af37')
  })

  it('falls back to the ink when the shop deleted the palette entry', () => {
    expect(resolveColor({ from: 'palette', id: 'gone' }, token, PALETTE)).toBe('#111111')
  })
})

describe('gradientVector', () => {
  it('runs along the start edge at 0 degrees', () => {
    const v = gradientVector(0)
    expect(v).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 })
  })

  it('runs down the card at 90 degrees', () => {
    const v = gradientVector(90)
    expect(v.x1).toBeCloseTo(0.5)
    expect(v.y1).toBeCloseTo(0)
    expect(v.x2).toBeCloseTo(0.5)
    expect(v.y2).toBeCloseTo(1)
  })

  /**
   * The reason the half-length is `(|cos| + |sin|) / 2` and not `0.5`. At 45°
   * the run has to reach the corners, so it starts at 0,0 and ends at 1,1 —
   * with a naive 0.5 it would stop at 0.85 and the last stop would never land.
   */
  it('reaches the corners on a diagonal', () => {
    const v = gradientVector(45)
    expect(v.x1).toBeCloseTo(0)
    expect(v.y1).toBeCloseTo(0)
    expect(v.x2).toBeCloseTo(1)
    expect(v.y2).toBeCloseTo(1)
  })
})

describe('resolvePaint', () => {
  it('hands back a flat colour unchanged', () => {
    expect(resolvePaint({ from: 'role', ref: 'accent' }, token)).toEqual({
      kind: 'flat',
      css: '#abcdef',
    })
  })

  it('resolves every stop against the shop', () => {
    const value: ColorValue = {
      from: 'gradient',
      angle: 90,
      stops: [
        { at: 0, color: { from: 'role', ref: 'primary' } },
        { at: 1, color: { from: 'palette', id: 'col_1' } },
      ],
    }

    const paint = resolvePaint(value, token, PALETTE)
    expect(paint.kind).toBe('gradient')
    if (paint.kind !== 'gradient') return
    expect(paint.stops).toEqual([
      { at: 0, css: '#123456' },
      { at: 1, css: '#d4af37' },
    ])
  })

  /**
   * `<linearGradient>` renders stops in document order and ignores an offset
   * that goes backwards, so an unsorted document would draw differently in SVG
   * than anywhere that sorts. Sorting here is what keeps the two the same.
   */
  it('sorts stops, so a document written out of order still draws the same run', () => {
    const paint = resolvePaint(
      {
        from: 'gradient',
        angle: 0,
        stops: [
          { at: 1, color: { from: 'hex', hex: '#ffffff' } },
          { at: 0, color: { from: 'hex', hex: '#000000' } },
        ],
      },
      token
    )

    expect(paint.kind === 'gradient' && paint.stops.map((stop) => stop.css)).toEqual([
      '#000000',
      '#ffffff',
    ])
  })

  it('collapses a one-stop gradient to that colour rather than drawing nothing', () => {
    expect(
      resolvePaint(
        { from: 'gradient', angle: 0, stops: [{ at: 0, color: { from: 'hex', hex: '#d4af37' } }] },
        token
      )
    ).toEqual({ kind: 'flat', css: '#d4af37' })
  })

  it('falls back to the ink when a gradient has no stops at all', () => {
    expect(resolvePaint({ from: 'gradient', angle: 0, stops: [] }, token)).toEqual({
      kind: 'flat',
      css: '#111111',
    })
  })
})

describe('flatten', () => {
  it('is the colour itself for a flat fill', () => {
    expect(flatten({ from: 'hex', hex: '#d4af37' }, token)).toBe('#d4af37')
  })

  /** The first stop, not a blend: a swatch has to be findable on the card. */
  it('is the first stop of a gradient, in run order', () => {
    expect(
      flatten(
        {
          from: 'gradient',
          angle: 0,
          stops: [
            { at: 1, color: { from: 'hex', hex: '#ffffff' } },
            { at: 0, color: { from: 'hex', hex: '#000000' } },
          ],
        },
        token
      )
    ).toBe('#000000')
  })
})
