#!/usr/bin/env node
/**
 * Find Tailwind utilities that resolve to nothing.
 *
 * **This design system REPLACES Tailwind's scales rather than extending them**,
 * which is deliberate — an off-system value should not silently work. The cost
 * is that an off-system class name is not an error either: it is a valid string
 * that generates no CSS, so the element is simply unstyled and the page looks
 * subtly, or catastrophically, wrong.
 *
 * Nothing else catches it. TypeScript has no opinion on a string. The design
 * lint rules test for *wrong* values, not absent ones. A component test asserts
 * the same class name the component already has. Only a rendered page shows it.
 *
 * It has now happened four times:
 *
 *   1. the rail — `w-16` and `lg:w-64`, sized by its own content instead
 *   2. the editor — `lg:w-72` / `lg:w-80`, artboard pushed off the screen
 *   3. the block designer — the same two, same result
 *   4. the designer's colour swatches — `size-7`, collapsed to dots
 *
 * Run it after a build, because the built CSS is the ground truth for what the
 * config actually generated:
 *
 *   pnpm build && pnpm --filter @souqstudio/web check:classes
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CSS_DIR = '.next/static/css'
const ROOTS = ['components', 'app']

/**
 * Utilities whose absence is invisible. Colour and font classes are excluded:
 * a missing colour usually shows up as an obviously unstyled element, while a
 * missing *size* leaves a box that is still there and still nearly right.
 */
const SIZED =
  /\b(size|gap|gap-x|gap-y|p|px|py|pt|pb|ps|pe|m|mt|mb|ms|me|w|h|min-h|min-w|max-w|max-h|inset|top|bottom|start|end|space-x|space-y|rounded|opacity|z)-[0-9]+(?:\.[0-9]+)?\b/g

function cssText() {
  const files = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'))
  if (files.length === 0) throw new Error(`no CSS in ${CSS_DIR} — run a build first`)
  return files.map((f) => readFileSync(join(CSS_DIR, f), 'utf8')).join('\n')
}

function sources() {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) found.push(full)
    }
  }
  for (const root of ROOTS) walk(root)
  return found
}

const css = cssText()
const used = new Map()

for (const file of sources()) {
  const src = readFileSync(file, 'utf8')
  for (const match of src.matchAll(SIZED)) {
    // A negative utility compiles as `.-me-2`; the match sees `me-2`. Checking
    // the character before the match is what tells the two apart.
    const negative = src[match.index - 1] === '-'
    const cls = negative ? `-${match[0]}` : match[0]
    if (!used.has(cls)) used.set(cls, new Set())
    used.get(cls).add(file)
  }
}

const escape = (cls) => cls.replace(/[.\\]/g, (c) => `\\${c}`)
const missing = [...used].filter(
  ([cls]) => !new RegExp(`\\.${escape(cls)}(?![a-zA-Z0-9_-])`).test(css)
)

for (const [cls, where] of missing.sort()) {
  console.error(`${cls.padEnd(16)} ${[...where].join(', ')}`)
}

if (missing.length > 0) {
  console.error(
    `\n${missing.length} class ${missing.length === 1 ? 'name' : 'names'} generate no CSS. ` +
      `The scale is replaced, not extended — pick a value that exists, or add a token.`
  )
  process.exit(1)
}

console.log(`${used.size} sized utilities, all of them resolve`)
