/**
 * SouqStudio Stylelint config — the CSS half of design system enforcement.
 * ESLint covers className strings in TSX; this covers .css files.
 */
module.exports = {
  rules: {
    // Physical properties break RTL. The app ships in Arabic.
    'declaration-property-value-disallowed-list': {
      '/^(margin|padding)-(left|right)$/': [/.*/],
      '/^border-(left|right)/': [/.*/],
      '/^(left|right)$/': [/.*/],
      'text-align': ['left', 'right'],
      'float': ['left', 'right'],
      // No elevation anywhere. Separation is hairline borders and surface
      // tone. `none` stays legal — it is how shadcn defaults get stripped.
      'box-shadow': [/^(?!none$).+/],
    },
    // Tokens only — no literal colours outside the token file itself.
    'color-no-hex': true,
  },
  overrides: [
    {
      // The token file is where hex values are allowed to exist.
      files: ['**/souqstudio-tokens.css'],
      rules: {
        'color-no-hex': null,
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
}
