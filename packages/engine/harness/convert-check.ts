/**
 * Does the converted library draw where the old one did?
 * `pnpm --filter @souqstudio/engine convert:check`
 *
 * E14 Phase 5's exit, run as a measurement rather than asserted by eye.
 *
 * **Rects, not bytes.** The plan's exit is "the gallery harness renders all the
 * blocks before and after and the two are byte-identical". Byte-identical SVG is
 * a proxy for "the geometry did not change", and comparing the geometry itself
 * tests the same claim without coupling the answer to a renderer — which
 * matters here, because the converted tree cannot go through `harness/svg.ts`
 * at all until `LayoutFrame` joins `BlockElement` in a later phase.
 *
 * So this resolves every block through **both** paths and diffs the boxes:
 *
 *   old   `resolveBlock(block, container, direction)`
 *   new   `solve(convertBlock(block, design).arrangements[i].root, …)`
 *
 * Every arrangement, every block, both editions. Any element whose rect moves
 * by more than a rounding error is printed with the distance it moved.
 */

import { loadLibrary } from '../src/library-load'
import {
  convertBlock,
  findSolved,
  resolveBlock,
  solve,
  type MeasureLeaf,
  type Rect,
} from '../src/index'
import type { Block } from '@souqstudio/types'

/** The region the library is authored against, and what `designSize` becomes. */
const REFERENCE = { width: 400, height: 500 }

/** Floating-point noise, not a moved box. */
const EPSILON = 1e-9

/**
 * Nothing in a converted tree hugs, so nothing is ever measured. A measurer
 * that returned a number would be inventing one; this asserts the expectation
 * by failing loudly if the assumption ever stops holding.
 */
const NEVER_MEASURED: MeasureLeaf = (leaf) => {
  throw new Error(`convert-check: a converted leaf asked to be measured: ${leaf.id}`)
}

function drift(a: Rect, b: Rect): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height)
  )
}

async function main() {
  const seeds = await loadLibrary()

  let compared = 0
  let worst = 0
  const moved: string[] = []
  const missing: string[] = []

  for (const seed of seeds) {
    const block: Block = {
      id: seed.id,
      organizationId: null,
      name: seed.name,
      repeats: seed.repeats,
      arrangements: seed.arrangements,
      thumbnailUrl: null,
    }

    const converted = convertBlock(block, REFERENCE)

    for (const direction of ['ltr', 'rtl'] as const) {
      seed.arrangements.forEach((arrangement, index) => {
        /*
         * `resolveBlock` picks an arrangement from the container's aspect, and
         * this needs a named one — so the old path is called on a block holding
         * only the arrangement under test. Same function, same formula; it is
         * the selection that is bypassed, not the geometry.
         */
        const single: Block = { ...block, arrangements: [arrangement] }
        const container: Rect = { x: 0, y: 0, ...REFERENCE }
        const old = resolveBlock(single, container, direction)

        const root = converted.arrangements[index]?.root
        if (root === undefined) {
          missing.push(`${seed.id}#${index}: no converted arrangement`)
          return
        }

        const solved = solve(root, REFERENCE, NEVER_MEASURED, { direction })

        for (const entry of old.elements) {
          const after = findSolved(solved, entry.element.id)
          if (after === null) {
            missing.push(`${seed.id}#${index} ${direction}: "${entry.element.id}" is not in the converted tree`)
            continue
          }
          compared += 1
          const distance = drift(entry.rect, after.rect)
          worst = Math.max(worst, distance)
          if (distance > EPSILON) {
            moved.push(
              `${seed.id}#${index} ${direction} "${entry.element.id}" (${entry.element.kind}) moved ${distance.toFixed(6)}`
            )
          }
        }
      })
    }
  }

  console.log(`${seeds.length} blocks, ${compared} element rects compared in both editions`)
  console.log(`worst drift: ${worst.toExponential(2)}`)

  if (missing.length > 0) {
    console.log(`\n${missing.length} missing:`)
    for (const line of missing.slice(0, 20)) console.log(`  ${line}`)
  }

  if (moved.length > 0) {
    console.log(`\n${moved.length} moved:`)
    for (const line of moved.slice(0, 20)) console.log(`  ${line}`)
  }

  // The composite elements, which convert as leaves and still owe Phase 6 a
  // frame. Counted by kind, because the number is the size of that work.
  const byKind = new Map<string, number>()
  for (const seed of seeds) {
    const block: Block = {
      id: seed.id,
      organizationId: null,
      name: seed.name,
      repeats: seed.repeats,
      arrangements: seed.arrangements,
      thumbnailUrl: null,
    }
    for (const note of convertBlock(block, REFERENCE).notes) {
      byKind.set(note.kind, (byKind.get(note.kind) ?? 0) + 1)
    }
  }

  console.log('\nstill composite, and Phase 6 owes each one a frame:')
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(12)} ${count}`)
  }

  const ok = moved.length === 0 && missing.length === 0
  console.log(`\n${ok ? 'geometry is identical through both paths' : 'GEOMETRY CHANGED'}`)
  if (!ok) process.exitCode = 1
}

void main()
