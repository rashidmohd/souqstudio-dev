import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge resolves conflicts from its knowledge of *stock* Tailwind class
 * names. This project replaces the type, radius and height scales, so it has to
 * be told what they are.
 *
 * Without this it silently deleted the entire type scale: `text-body` is not a
 * font size it recognises, so it classified it as a text *colour* and dropped it
 * whenever a real colour followed — `cn('text-body text-primary')` returned just
 * `text-primary`, and every component rendered at the browser default size. It
 * fails silently, which is what makes it worth a config rather than a rule
 * people have to remember.
 *
 * Only the groups whose names were replaced are overridden. Everything else —
 * spacing, flex, borders — still merges on stock behaviour.
 */
const twMerge = extendTailwindMerge({
  override: {
    classGroups: {
      // The type scale from tailwind.config.ts. Anything else matching `text-*`
      // falls through to text-color, which is what we want.
      'font-size': [
        {
          text: [
            'display',
            'title',
            'heading',
            'subhead',
            'body',
            'body-sm',
            'label',
            'eyebrow',
            'data-lg',
            'data',
            'data-sm',
          ],
        },
      ],
      rounded: [
        { rounded: ['none', 'artboard', 'chip', 'control', 'card', 'block', 'pill', 'full'] },
      ],
      h: [{ h: ['control', 'control-lg', 'full', 'screen', 'auto', 'px', 'min', 'max', 'fit'] }],
    },
  },
})

/**
 * Class name merge. Every component takes a `className` passthrough and runs it
 * through this, so a caller's class wins over the component's default rather
 * than fighting it in the cascade.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Currency, per the design system: code first, thin space, two decimals —
 * `AED 1,842.00`. Always Latin numerals, including in Arabic layouts, so a price
 * never reorders inside a bidirectional line.
 *
 * Render the result through <Figure>, which supplies `data-figure`.
 */
export function formatCurrency(value: number, currency = 'AED') {
  const amount = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  // U+2009 THIN SPACE, written as an escape rather than the literal character:
  // the literal is invisible in review and trips no-irregular-whitespace.
  return `${currency}\u2009${amount}`
}
