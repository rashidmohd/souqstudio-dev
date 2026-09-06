import { describe, it, expect } from 'vitest'
import { textDirection } from './direction'

/**
 * The cases here are catalog rows, not invented strings. Every one in the first
 * two blocks came out of `catalog_products` or out of the demo seed — the bug
 * these guard was found by rendering them, not by reasoning about bidi.
 */
describe('textDirection', () => {
  describe('the pack label, which is what broke', () => {
    // The exact strings from the Arabic harness page. Each one rendered
    // reversed — `kg 2`, `l 1.5` — because the page is rtl and the string is
    // not. They are LTR strings and must be declared as such.
    it.each(['2 kg', '1.5 l', '900 g', '200 g', '12 × 1.5 L', '8 × 25 g'])(
      'reads %s left-to-right even on an Arabic page',
      (label) => {
        expect(textDirection(label, 'rtl')).toBe('ltr')
      }
    )

    it('leaves an Arabic pack label alone', () => {
      expect(textDirection('٥ كجم', 'rtl')).toBe('rtl')
      expect(textDirection('١٢ × ١٫٥ لتر', 'rtl')).toBe('rtl')
    })
  })

  describe('a name is decided by its first strong character, not by its contents', () => {
    it('calls a Latin name ltr on an Arabic page', () => {
      // 96% of the universal catalog. Until the enrich worker lands, this is
      // what an Arabic edition actually draws.
      expect(textDirection('Sella Basmati Rice', 'rtl')).toBe('ltr')
      expect(textDirection('Fırınlanmış Mısır Cipsi', 'rtl')).toBe('ltr')
      expect(textDirection('Pâtes Italiennes Penne Rigate', 'rtl')).toBe('ltr')
    })

    it('calls an Arabic name rtl on a Latin page', () => {
      // A real row: an Arabic-only name sitting in an English booklet.
      expect(textDirection('خردل', 'ltr')).toBe('rtl')
      expect(textDirection('مسحوق غسيل أوتوماتيك بالليمون', 'ltr')).toBe('rtl')
    })

    it('is decided by the first strong character when a string mixes scripts', () => {
      // The case `\p{Script=Arabic}` alone gets wrong: there is Arabic in it,
      // and it is still an LTR string.
      expect(textDirection('Nestlé العربية', 'rtl')).toBe('ltr')
      expect(textDirection('العربية Nestlé', 'ltr')).toBe('rtl')
    })

    it('ignores digits and punctuation before the first strong character', () => {
      // `7up zero 155` and `04 16 Hr Wear` are both real rows. The leading
      // digits are bidi-weak and decide nothing.
      expect(textDirection('7up zero 155', 'rtl')).toBe('ltr')
      expect(textDirection('04 16 Hr Wear Hydrate', 'rtl')).toBe('ltr')
      expect(textDirection('"٣ كجم"', 'ltr')).toBe('rtl')
    })
  })

  describe('a string with no letter in it follows the page', () => {
    // Nothing here can reorder, so the page's answer keeps a column of these
    // aligned with the text around them.
    it.each(['500', '12.75', '—', '', '  ', '12 × 1.5', '١٢ × ١٫٥'])(
      '%s follows the page',
      (content) => {
        expect(textDirection(content, 'rtl')).toBe('rtl')
        expect(textDirection(content, 'ltr')).toBe('ltr')
      }
    )

    // Both of these were decided by the wrong character before the rule was
    // narrowed to letters. See the note on RTL_SCRIPT.
    it('is not decided by the multiplication sign', () => {
      // U+00D7 sits between the accented Latin letters in Latin-1 Supplement.
      expect(textDirection('× kg', 'rtl')).toBe('ltr')
      expect(textDirection('× كجم', 'ltr')).toBe('rtl')
    })

    it('is not decided by an Arabic-Indic digit', () => {
      // U+0660-U+0669 sit inside the Arabic block but are numbers, not letters.
      expect(textDirection('١٢ لتر', 'ltr')).toBe('rtl')
      expect(textDirection('١٢ litre', 'rtl')).toBe('ltr')
    })
  })

  describe('the ranges', () => {
    it('treats Greek and Cyrillic as ltr', () => {
      expect(textDirection('Ελληνικά', 'rtl')).toBe('ltr')
      expect(textDirection('Кириллица', 'rtl')).toBe('ltr')
    })

    it('treats Hebrew and the Arabic presentation forms as rtl', () => {
      expect(textDirection('חלב', 'ltr')).toBe('rtl')
      // U+FEF5, an Arabic ligature in the presentation-forms block. A range that
      // stops at U+06FF misses these and silently calls them ltr.
      expect(textDirection('ﻵ', 'ltr')).toBe('rtl')
    })
  })
})
