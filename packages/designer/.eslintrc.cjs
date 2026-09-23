const design = require('@souqstudio/config/eslint.design.cjs')

module.exports = {
  ...design,
  settings: {
    ...design.settings,
    // A package has no pages directory; the rule it feeds is about Next's
    // pages router, which nothing here uses.
    next: { rootDir: '../../apps/web' },
  },
}
