/**
 * The frame gate. `pnpm --filter @souqstudio/engine frames`
 *
 * E14 Phase 4: solve the five hand-built blocks, in both editions, and write
 * them where somebody can look at them. **The exit is "all five render, and
 * somebody looks at them"** — so this produces an HTML page, not a pass/fail.
 * If the nesting is unsurvivable this is where it is said, not in Phase 6.
 *
 * It does report the things a person should not have to spot by eye:
 * `validateFrame` problems, and any leaf that solved to a zero box. Those are
 * printed and also drawn, because a silently missing element is the defect a
 * gallery exists to surface.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  flattenSolved,
  solve,
  validateFrame,
  type LayoutLeaf,
  type SolvedNode,
} from '../src/index'
import { FRAME_BLOCKS, measurerFor, type FrameBlock } from './frame-blocks'
import { renderSolved } from './frame-svg'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(OUT, { recursive: true })

/**
 * Only text and frames can hug. `validateFrame` cannot know which leaves are
 * text — the solver never interprets a leaf — so the caller says, and here the
 * paint map is what knows.
 */
function canHugIn(block: FrameBlock) {
  return (leaf: LayoutLeaf): boolean =>
    leaf.ref !== undefined && block.paint[leaf.ref]?.kind === 'text'
}

interface Rendered {
  block: FrameBlock
  direction: 'ltr' | 'rtl'
  svg: string
  solved: SolvedNode
}

const problems: string[] = []
const rendered: Rendered[] = []

for (const block of FRAME_BLOCKS) {
  for (const problem of validateFrame(block.root, { canHug: canHugIn(block) })) {
    problems.push(`${block.id}: ${problem.code} — ${problem.message}`)
  }

  const measure = measurerFor(block.paint)
  const directions = block.bothDirections ? (['ltr', 'rtl'] as const) : (['ltr'] as const)

  for (const direction of directions) {
    const solved = solve(block.root, block.design, measure, { direction })

    /*
     * A leaf that solved to nothing is drawn as a dashed red box by the
     * renderer and named here. Both, deliberately: the drawing is what somebody
     * reviewing the page sees, and the line is what somebody reading the
     * terminal sees, and neither audience should have to consult the other.
     */
    for (const node of flattenSolved(solved)) {
      if (node.kind !== 'leaf') continue
      if (node.rect.width > 0.01 && node.rect.height > 0.01) continue
      problems.push(`${block.id} (${direction}): "${node.id}" solved to a zero box.`)
    }

    const svg = renderSolved(solved, block.design, { paint: block.paint, direction })
    writeFileSync(join(OUT, `frame-${block.id}-${direction}.svg`), svg)
    rendered.push({ block, direction, svg, solved })
  }
}

// ─── The page ─────────────────────────────────────────────────────────────────

const byBlock = new Map<string, Rendered[]>()
for (const entry of rendered) {
  const list = byBlock.get(entry.block.id) ?? []
  list.push(entry)
  byBlock.set(entry.block.id, list)
}

const sections = [...byBlock.values()]
  .map((entries) => {
    const block = entries[0]?.block
    if (block === undefined) return ''
    const pairs = entries
      .map(
        (entry) =>
          `<figure><figcaption>${entry.direction}</figcaption>${entry.svg}</figure>`
      )
      .join('')
    return (
      `<section><h2>${esc(block.name)}</h2>` +
      `<p class="note">${esc(block.note)}</p>` +
      `<div class="pair">${pairs}</div></section>`
    )
  })
  .join('\n')

const html = `<!doctype html>
<meta charset="utf-8">
<title>E14 frame gate</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; background: #F8F7F3;
         color: #1A1A1A; margin: 0; padding: 32px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .lede { color: #6E7480; margin: 0 0 24px; max-width: 70ch; }
  section { background: #fff; border: 1px solid #E4E1D8; border-radius: 12px;
            padding: 16px; margin-bottom: 16px; }
  h2 { font-size: 16px; margin: 0 0 4px; }
  .note { color: #6E7480; margin: 0 0 12px; font-size: 13px; }
  .pair { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  figure { margin: 0; }
  figcaption { font: 11px/1.4 ui-monospace, monospace; text-transform: uppercase;
               color: #6E7480; margin-bottom: 6px; }
  svg { border: 1px dashed #E4E1D8; display: block; }
  .problems { background: #FDECEC; border: 1px solid #D0021B; border-radius: 12px;
              padding: 16px; margin-bottom: 16px; }
  .problems ul { margin: 8px 0 0; padding-inline-start: 20px; }
  code { font: 12px ui-monospace, monospace; }
</style>
<h1>E14 Phase 4 — the frame gate</h1>
<p class="lede">Five blocks built by hand in the frame model, solved and drawn in both
editions. The question this page exists to answer is whether the model survives real
design rather than test fixtures. If the nesting is unsurvivable, it is said here.</p>
${
  problems.length === 0
    ? ''
    : `<div class="problems"><strong>${problems.length} problem(s)</strong><ul>` +
      problems.map((p) => `<li><code>${esc(p)}</code></li>`).join('') +
      `</ul></div>`
}
${sections}
`

writeFileSync(join(OUT, 'frames.html'), html)

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

console.log(`${rendered.length} renders from ${FRAME_BLOCKS.length} blocks`)
if (problems.length === 0) {
  console.log('no validation problems, no zero boxes')
} else {
  console.log(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.log(`  ${problem}`)
}
console.log(`\n  ${join(OUT, 'frames.html')}`)
