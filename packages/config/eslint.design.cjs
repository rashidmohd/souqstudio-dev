/**
 * SouqStudio ESLint config.
 *
 * Three documents used to say "lint enforces this" while no lint config
 * existed. This file makes that claim true.
 *
 * Every rule below maps to a stated rule in the souqstudio-design skill.
 * If you disable one, you are disabling the design system, not a lint nag.
 */

// ── Patterns ─────────────────────────────────────────────────────────────────

// Physical direction utilities. The app ships in Arabic; these break RTL.
const PHYSICAL_CLASS =
  '(^|\\s)(-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|' +
  'float-left|float-right|text-left|text-right|origin-left|origin-right|' +
  'inset-l|inset-r|scroll-ml|scroll-mr|scroll-pl|scroll-pr)(-|$))'

// Raw hex anywhere in code. Tokens only.
const RAW_HEX = '#[0-9a-fA-F]{3,8}\\b'

// Tailwind arbitrary values — an escape hatch around the token scales.
const ARBITRARY = '\\[[0-9]+(px|rem|em|%)\\]'

// shadcn defaults that contradict the system.
const SHADCN_RADIUS = '(^|\\s)rounded-(sm|md|lg|xl|2xl|3xl)(\\s|$)'

// There is no elevation in this system.
const SHADOW = '(^|\\s)shadow(-|$)'

// Fill-only tier used as ink. Never text, never a border.
const FILL_ONLY_AS_INK =
  '(^|\\s)(text|border|fill|stroke|placeholder|decoration|ring|divide|outline|caret)-' +
  '(sand|sky|sand-tint|sky-tint|stone-300|stone-400)(\\s|$)'

// Plex Sans Arabic has no true italic. Emphasis is weight.
const ITALIC = '(^|\\s)italic(\\s|$)'

// Blue IS the primary action, but it must arrive through the semantic token.
const BLUE_FILL = '(^|\\s)bg-blue(\\s|$)'

const restrict = (pattern, message) => ({
  selector: `Literal[value=/${pattern}/]`,
  message,
})

const restrictTemplate = (pattern, message) => ({
  selector: `TemplateElement[value.raw=/${pattern}/]`,
  message,
})

const DESIGN_RULES = [
  [PHYSICAL_CLASS,
   'Physical direction utility. Use the logical equivalent (ms-/me-/ps-/pe-/start-/end-/border-s/border-e/text-start/text-end). The app ships in Arabic and this breaks RTL.'],

  [RAW_HEX,
   'Raw hex value. Use a design token from souqstudio-tokens.css — never a literal colour in component code.'],

  [ARBITRARY,
   'Tailwind arbitrary value. Use the token scale (spacing 1/2/3/4/6/8/12, radius chip/control/card/block/pill). If the scale lacks what you need, that is a token decision, not an inline one.'],

  [SHADCN_RADIUS,
   'shadcn default radius. Use rounded-chip (8), rounded-control (8), rounded-card (12), rounded-block (16) or rounded-pill. Every button is a pill.'],

  [SHADOW,
   'There is no elevation in this system. Separation is hairline borders (border-hairline border-border-subtle) and surface tone. Strip shadcn shadows.'],

  [FILL_ONLY_AS_INK,
   'Fill-only colour used as ink. sand/sky and stone-300/400 fail contrast as text or borders — they are backgrounds with charcoal on top. See the two tiers in the design skill.'],

  [ITALIC,
   'No italics. IBM Plex Sans Arabic has no true italic and mixed-script screens must not emphasise differently by language. Use font-medium.'],

  [BLUE_FILL,
   'Raw blue fill. The primary action is bg-action-primary, which resolves to the brand blue — going direct pins the light value and skips the dark-mode #8AA1F1. Blue is still never a page background, card fill or large tinted panel.'],
]

module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'eslint:recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: {
    'no-restricted-syntax': [
      'error',
      ...DESIGN_RULES.flatMap(([p, m]) => [restrict(p, m), restrictTemplate(p, m)]),
    ],

    // Import the validated env module, never process.env.
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message:
          'Import { env } from the validated env module instead of reading process.env directly. It crashes at startup on a missing variable rather than at the first request.',
      },
    ],

    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@prisma/client',
            message:
              'Import { prisma } from @souqstudio/db instead — it is a singleton with connection pooling handled.',
          },
        ],
        patterns: [
          {
            group: ['../../../packages/*', '../../packages/*'],
            message:
              'Use the workspace name (@souqstudio/db, @souqstudio/email, @souqstudio/types) rather than a relative path across package boundaries.',
          },
        ],
      },
    ],
  },

  overrides: [
    // ── Base rules that do not understand TypeScript ────────────────────────
    // Both are eslint:recommended rules written for plain JS, and both
    // false-positive on type-level syntax:
    //
    //   no-undef      — does not know TS globals (React, NodeJS.*, JSX.*)
    //   no-unused-vars — reads the parameter name in a function *type*
    //                    (`onSubmit: (code: string) => void`) as a binding
    //
    // TypeScript reports genuinely unused values itself, so nothing is lost.
    {
      files: ['**/*.{ts,tsx}'],
      rules: {
        'no-undef': 'off',
        'no-unused-vars': 'off',
      },
    },

    // ── The validated env module is where process.env is read ───────────────
    // Exactly one file per app may touch it — that is the point of the rule
    // everywhere else. Without this exemption the rule forbids its own fix.
    {
      files: ['**/lib/env.ts'],
      rules: {
        'no-restricted-properties': 'off',
      },
    },

    // ── Template tokens are content-only ────────────────────────────────────
    {
      files: ['**/*.{ts,tsx}'],
      excludedFiles: [
        'components/editor/**',
        'components/card-designer/**',
        'lib/canvas/**',
        // Renders offer book content in --sq-tpl-* tokens, same as the above.
        'components/brand/OfferPreview.tsx',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          ...DESIGN_RULES.flatMap(([p, m]) => [restrict(p, m), restrictTemplate(p, m)]),
          restrict(
            '--sq-tpl-',
            'Template token used in application chrome. --sq-tpl-* is offer book content only. If you want the error red, that is --sq-critical-fg; they look similar deliberately and mean different things.'
          ),
        ],
      },
    },

    // ── Tests assert on values; they do not style anything ──────────────────
    // A test that checks `toHex(...) === '#1f4fd8'` is not making a design
    // decision, and one whose name happens to end in the word "left" is not a
    // physical direction utility. The design system governs shipped UI; test
    // files ship nowhere.
    {
      files: ['**/*.test.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },

    // ── The shop owner's own typography and palette ─────────────────────────
    // The design system governs chrome and says so in its own scope note: "it
    // does not govern what a shop owner produces", and brand kit fonts are "the
    // one section about the owner's typography rather than ours — it constrains
    // the picker, never the aesthetic result".
    //
    // These two files are that picker. `italic` here is a field on the shop's
    // text style, not a class on our chrome; the hex values are the shop's own
    // palette resolved for a preview. The rule cannot tell those from a real
    // violation — the same blind spot the manual checklist calls out for an
    // icon on sky — so the distinction is drawn by path, narrowly, and nowhere
    // else. Chrome typography is still covered everywhere it lives.
    {
      files: ['**/lib/brand-typography.ts', '**/components/brand/TypographyFields.tsx'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },

    // ── The colour module is where literal colours live ─────────────────────
    // Same shape of exemption as lib/env.ts above: exactly one file may do the
    // thing the rule forbids everywhere else, because it is the file that
    // provides the alternative. lib/color.ts holds the WCAG reference white and
    // black that the contrast maths is defined against, and the neutral
    // fallbacks the preview uses before a shop has uploaded a logo. Those are
    // reference data, not styling decisions — there is no token to point at,
    // and a token would be the wrong answer anyway since this code runs over
    // colours the shop chose, not colours we did.
    {
      files: ['**/lib/color.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },

    // ── Email templates: inline styles and literal hex are required ─────────
    // CSS variables do not resolve in email clients.
    {
      files: ['packages/email/**/*.tsx'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },

    // ── Brand assets and generated files ────────────────────────────────────
    {
      files: ['**/tailwind.config.ts', '**/*.config.{js,ts}'],
      rules: {
        'no-restricted-syntax': 'off',
        'no-restricted-properties': 'off',
      },
    },

    // ── Worker: no browser, no design system ────────────────────────────────
    {
      files: ['apps/worker/**/*.ts'],
      rules: {
        'no-restricted-syntax': 'off',
      },
    },
  ],
}
