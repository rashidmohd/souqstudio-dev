/**
 * Structural checks on a page grid.
 *
 * Run this when a grid is edited, not on every flow. A grid that fails here is
 * a bug in the editor, not a state a book should ever reach — but the editor is
 * where merges happen, so it needs something to refuse them with.
 *
 * Uncovered cells are not a problem. A grid with a hole renders a hole; that is
 * a design, not an error.
 */

import type { PageGrid, Region } from '@souqstudio/types'
import { spansIntersect } from './geometry'

export type GridProblemCode =
  | 'empty-tracks'
  | 'track-size'
  | 'negative-gap'
  | 'duplicate-region-id'
  | 'inverted-span'
  | 'out-of-bounds'
  | 'overlapping-regions'
  | 'no-flow-region'

export interface GridProblem {
  code: GridProblemCode
  message: string
  regionId?: string | undefined
}

export function validateGrid(grid: PageGrid): GridProblem[] {
  const problems: GridProblem[] = []

  if (grid.cols.length === 0 || grid.rows.length === 0) {
    problems.push({ code: 'empty-tracks', message: 'A grid needs at least one column and one row' })
    return problems
  }
  if (grid.cols.some((size) => !(size > 0)) || grid.rows.some((size) => !(size > 0))) {
    problems.push({ code: 'track-size', message: 'Every track size must be greater than zero' })
  }
  if (grid.gap < 0) {
    problems.push({ code: 'negative-gap', message: 'Gap cannot be negative' })
  }

  const seen = new Set<string>()
  for (const region of grid.regions) {
    if (seen.has(region.id)) {
      problems.push({
        code: 'duplicate-region-id',
        message: `Two regions share the id "${region.id}"`,
        regionId: region.id,
      })
    }
    seen.add(region.id)
    problems.push(...spanProblems(region, grid))
  }

  // Merges are rectangular and disjoint, same as a spreadsheet. Overlap is
  // refused rather than resolved by z-order: a card silently under another card
  // is a product the shop paid to print and nobody can see.
  for (let i = 0; i < grid.regions.length; i += 1) {
    for (let j = i + 1; j < grid.regions.length; j += 1) {
      const a = grid.regions[i]
      const b = grid.regions[j]
      if (a === undefined || b === undefined) continue
      if (spansIntersect(a, b)) {
        problems.push({
          code: 'overlapping-regions',
          message: `Regions "${a.id}" and "${b.id}" cover the same cells`,
          regionId: a.id,
        })
      }
    }
  }

  if (!grid.regions.some((region) => region.fill === 'flow')) {
    problems.push({
      code: 'no-flow-region',
      message: 'A master grid needs at least one flow region, or no product can be placed',
    })
  }

  return problems
}

function spanProblems(region: Region, grid: PageGrid): GridProblem[] {
  const problems: GridProblem[] = []

  if (region.colStart > region.colEnd || region.rowStart > region.rowEnd) {
    problems.push({
      code: 'inverted-span',
      message: `Region "${region.id}" ends before it starts`,
      regionId: region.id,
    })
  }
  if (
    region.colStart < 0 ||
    region.rowStart < 0 ||
    region.colEnd >= grid.cols.length ||
    region.rowEnd >= grid.rows.length
  ) {
    problems.push({
      code: 'out-of-bounds',
      message:
        `Region "${region.id}" falls outside the ${grid.cols.length}×${grid.rows.length} grid`,
      regionId: region.id,
    })
  }

  return problems
}
