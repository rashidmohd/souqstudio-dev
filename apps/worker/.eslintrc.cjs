module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  extends: ['eslint:recommended'],
  rules: {
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Import { env } from ./lib/env instead of reading process.env directly.',
      },
    ],
  },
  overrides: [
    {
      // The one file allowed to read process.env — it is what everything else
      // imports instead.
      files: ['src/lib/env.ts'],
      rules: { 'no-restricted-properties': 'off' },
    },
    {
      // Both are eslint:recommended rules written for plain JS that misread
      // type-level syntax: no-undef does not know TS globals, and
      // no-unused-vars reads the parameter name in a function *type*
      // (`(props: never) => ReactElement`) as an unused binding.
      // TypeScript reports genuinely unused values itself.
      files: ['**/*.ts'],
      rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
    },
  ],
}
