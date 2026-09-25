import { describe, expect, it } from 'vitest'
import { mergeManifest } from './library-merge'
import type { LibraryManifest } from './library-source'

const repo = [
  { id: 'blk_a', category: 'panel' as const },
  { id: 'blk_b', category: 'header' as const },
]

const existing = (blocks: LibraryManifest['blocks']): LibraryManifest => ({
  version: '2026-09-25T00:00:00.000Z',
  count: blocks.length,
  blocks,
})

describe('mergeManifest', () => {
  it('is the repo alone when nothing has been published', () => {
    const merged = mergeManifest(repo, null)
    expect(merged.manifest.blocks.map((b) => b.id)).toEqual(['blk_a', 'blk_b'])
    expect(merged.manifest.count).toBe(2)
  })

  it('keeps a block the admin panel published', () => {
    const merged = mergeManifest(
      repo,
      existing([...repo, { id: 'blk_ramadan', category: 'header', origin: 'panel' }])
    )
    expect(merged.manifest.blocks.map((b) => b.id)).toEqual(['blk_a', 'blk_b', 'blk_ramadan'])
    expect(merged.keptFromPanel).toEqual(['blk_ramadan'])
    expect(merged.manifest.blocks.at(-1)?.origin).toBe('panel')
  })

  it("leaves a repo block the panel replaced as the panel published it", () => {
    const merged = mergeManifest(repo, existing([{ id: 'blk_b', category: 'header', origin: 'panel' }]))
    expect(merged.replacedByPanel).toEqual(['blk_b'])
    expect(merged.manifest.blocks).toContainEqual({ id: 'blk_b', category: 'header', origin: 'panel' })
    expect(merged.manifest.count).toBe(2)
  })

  it('drops a panel block only when told to', () => {
    const merged = mergeManifest(
      repo,
      existing([{ id: 'blk_ramadan', category: 'header', origin: 'panel' }]),
      new Set(['blk_ramadan'])
    )
    expect(merged.manifest.blocks.map((b) => b.id)).toEqual(['blk_a', 'blk_b'])
    expect(merged.dropped).toEqual(['blk_ramadan'])
  })

  it('still retires a repo block the repo no longer has', () => {
    const merged = mergeManifest(repo, existing([...repo, { id: 'blk_old', category: 'panel' }]))
    expect(merged.manifest.blocks.map((b) => b.id)).toEqual(['blk_a', 'blk_b'])
  })

  it('a dropped block the panel had replaced goes back to the repo version', () => {
    const merged = mergeManifest(
      repo,
      existing([{ id: 'blk_b', category: 'header', origin: 'panel' }]),
      new Set(['blk_b'])
    )
    expect(merged.replacedByPanel).toEqual([])
    expect(merged.manifest.blocks).toContainEqual({ id: 'blk_b', category: 'header' })
  })
})

describe('mergeManifest and unpublished blocks', () => {
  it('keeps a repo block the panel unpublished out of the library', () => {
    const merged = mergeManifest(repo, { ...existing([{ id: 'blk_a', category: 'panel' }]), retired: ['blk_b'] })
    expect(merged.manifest.blocks.map((b) => b.id)).toEqual(['blk_a'])
    expect(merged.keptRetired).toEqual(['blk_b'])
    expect(merged.manifest.retired).toEqual(['blk_b'])
  })

  it('lets it back in with restore, and forgets it was retired', () => {
    const merged = mergeManifest(
      repo,
      { ...existing([]), retired: ['blk_b'] },
      new Set(),
      new Set(['blk_b'])
    )
    expect(merged.manifest.blocks.map((b) => b.id)).toEqual(['blk_a', 'blk_b'])
    expect(merged.manifest.retired).toBeUndefined()
  })
})
