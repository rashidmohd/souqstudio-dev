import type { Config } from 'tailwindcss'

/**
 * SouqStudio Tailwind config.
 *
 * The point of this file is subtraction. Tailwind's default palette, spacing
 * scale and radius scale are REPLACED, not extended — so `bg-blue-500`,
 * `p-[13px]` and `rounded-md` do not resolve to anything. A violation fails
 * loudly at build instead of silently shipping an off-system value.
 *
 * Every value below traces to a token in souqstudio-tokens.css. If you need
 * something that is not here, the answer is a token, not an arbitrary value.
 */
const config: Config = {
  darkMode: ['class', '[data-mode="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
  ],
  theme: {
    // ── REPLACED, not extended ───────────────────────────────────────────────
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      // Chrome surfaces
      page: 'var(--sq-ui-page)',
      surface: 'var(--sq-ui-surface)',
      sunken: 'var(--sq-ui-surface-sunken)',
      'canvas-surround': 'var(--sq-ui-canvas-surround)',
      input: 'var(--sq-ui-input)',

      // Chrome text
      primary: 'var(--sq-ui-text-primary)',
      secondary: 'var(--sq-ui-text-secondary)',
      muted: 'var(--sq-ui-text-muted)',
      inverse: 'var(--sq-ui-text-inverse)',
      link: 'var(--sq-ui-text-link)',

      // Borders
      'border-subtle': 'var(--sq-ui-border-subtle)',
      'border-strong': 'var(--sq-ui-border-strong)',
      'border-focus': 'var(--sq-ui-border-focus)',

      // Actions
      'action-primary': 'var(--sq-ui-action-primary-bg)',
      'action-primary-fg': 'var(--sq-ui-action-primary-fg)',
      'action-primary-hover': 'var(--sq-ui-action-primary-hover)',
      'action-danger': 'var(--sq-ui-action-danger-fg)',

      // Selection
      'selected-bg': 'var(--sq-ui-selected-bg)',
      'selected-fg': 'var(--sq-ui-selected-fg)',

      // Status
      'positive-fg': 'var(--sq-positive-fg)',
      'positive-bg': 'var(--sq-positive-bg)',
      'critical-fg': 'var(--sq-critical-fg)',
      'critical-bg': 'var(--sq-critical-bg)',
      'critical-hover': 'var(--sq-critical-hover)',
      'caution-fg': 'var(--sq-caution-fg)',
      'caution-bg': 'var(--sq-caution-bg)',

      // Machine output — AI-generated content marker
      'machine-rule': 'var(--sq-machine-rule)',
      'machine-fill': 'var(--sq-machine-fill)',
      'machine-label': 'var(--sq-machine-label)',

      // Fill-only tier. Background ONLY — never text, never a border.
      // The eslint rule text-sand / text-lime / text-sky exists to catch misuse.
      sand: 'var(--sq-sand)',
      lime: 'var(--sq-lime)',
      sky: 'var(--sq-sky)',
      'lime-tint': 'var(--sq-lime-tint)',
      'sky-tint': 'var(--sq-sky-tint)',
      'sand-tint': 'var(--sq-sand-tint)',
      'illus-panel': 'var(--sq-illus-panel)',

      // Ink-safe brand
      blue: 'var(--sq-blue)',
      navy: 'var(--sq-navy)',
      charcoal: 'var(--sq-charcoal)',

      // Stone ramp
      'stone-0': 'var(--sq-stone-0)',
      'stone-50': 'var(--sq-stone-50)',
      'stone-100': 'var(--sq-stone-100)',
      'stone-200': 'var(--sq-stone-200)',
      'stone-300': 'var(--sq-stone-300)',
      'stone-400': 'var(--sq-stone-400)',
      'stone-500': 'var(--sq-stone-500)',
      'stone-600': 'var(--sq-stone-600)',
      'stone-700': 'var(--sq-stone-700)',
      'stone-800': 'var(--sq-stone-800)',
      'stone-900': 'var(--sq-stone-900)',

      // Charts
      'chart-1': 'var(--sq-chart-1)',
      'chart-2': 'var(--sq-chart-2)',
      'chart-3': 'var(--sq-chart-3)',
      'chart-4': 'var(--sq-chart-4)',
      'chart-5': 'var(--sq-chart-5)',
      'chart-6': 'var(--sq-chart-6)',
    },

    // 4 / 8 / 12 / 16 / 24 / 32 / 48 and nothing else.
    spacing: {
      0: '0px',
      1: 'var(--sq-space-1)',
      2: 'var(--sq-space-2)',
      3: 'var(--sq-space-3)',
      4: 'var(--sq-space-4)',
      6: 'var(--sq-space-6)',
      8: 'var(--sq-space-8)',
      12: 'var(--sq-space-12)',
      px: '1px',
      full: '100%',
    },

    borderRadius: {
      none: '0',
      artboard: 'var(--sq-radius-artboard)',
      chip: 'var(--sq-radius-chip)',
      control: 'var(--sq-radius-control)',
      card: 'var(--sq-radius-card)',
      block: 'var(--sq-radius-block)',
      pill: 'var(--sq-radius-pill)',
      full: '9999px',
    },

    // No `shadow-*` utilities exist. There is no elevation in this system.
    boxShadow: {
      none: 'none',
    },

    fontFamily: {
      display: 'var(--sq-font-display)',
      ui: 'var(--sq-font-ui)',
      figure: 'var(--sq-font-figure)',
    },

    fontSize: {
      display:  ['var(--sq-text-display)',  { lineHeight: 'var(--sq-leading-display)' }],
      title:    ['var(--sq-text-title)',    { lineHeight: 'var(--sq-leading-title)' }],
      heading:  ['var(--sq-text-heading)',  { lineHeight: 'var(--sq-leading-heading)' }],
      subhead:  ['var(--sq-text-subhead)',  { lineHeight: 'var(--sq-leading-subhead)' }],
      body:     ['var(--sq-text-body)',     { lineHeight: 'var(--sq-leading-body)' }],
      'body-sm':['var(--sq-text-body-sm)',  { lineHeight: 'var(--sq-leading-body-sm)' }],
      label:    ['var(--sq-text-label)',    { lineHeight: 'var(--sq-leading-label)' }],
      eyebrow:  ['var(--sq-text-eyebrow)',  { lineHeight: 'var(--sq-leading-eyebrow)' }],
      'data-lg':['var(--sq-text-data-lg)',  { lineHeight: 'var(--sq-leading-data-lg)' }],
      data:     ['var(--sq-text-data)',     { lineHeight: 'var(--sq-leading-data)' }],
      'data-sm':['var(--sq-text-data-sm)',  { lineHeight: 'var(--sq-leading-data-sm)' }],
    },

    extend: {
      height: {
        control: 'var(--sq-h-control)',
        'control-lg': 'var(--sq-h-control-lg)',
      },
      minHeight: {
        control: 'var(--sq-h-control)',
        'control-lg': 'var(--sq-h-control-lg)',
        row: '44px',       // minimum tappable table row
      },
      minWidth: {
        control: 'var(--sq-h-control)',
        'control-lg': 'var(--sq-h-control-lg)',
      },
      borderWidth: {
        hairline: '0.5px',
      },
      transitionDuration: {
        fast: 'var(--sq-dur-fast)',
        base: 'var(--sq-dur-base)',
      },
      transitionTimingFunction: {
        sq: 'var(--sq-ease)',
      },
      opacity: {
        disabled: '0.4',
      },
    },
  },
  plugins: [],
}

export default config
