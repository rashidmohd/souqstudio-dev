import type { Arrangement } from '@souqstudio/types'

/**
 * Whether a document is one a **seeded** block may hold.
 *
 * Seeded blocks are the library every account composes with, and one of them
 * has to name a colour before it has ever met a shop — so it names a role the
 * kit fills, and never a palette entry (which is one shop's) or a literal
 * (which is nobody's). An owner's own block has met them and may use all three.
 *
 * **Here rather than in the web app, because there are now two writers.** It
 * used to live in `apps/web/lib/block-document.ts`, checked when an API request
 * carried a document; `library.test.ts` then re-implemented it inline to hold
 * the shipped blocks to the same bar, with a comment admitting as much. A
 * document loaded from a file is a third caller and the one furthest from that
 * route, so the rule moved to the package all three can reach. The web app
 * re-exports it, and every existing call site is unchanged.
 *
 * **A gradient fails this by construction**, and that is the intended answer
 * rather than an oversight: its `from` is `gradient`, never `role`, so no
 * seeded block can hold one however its stops are named. The shipped library
 * stays flat — the design system's "no gradients" is about our own surfaces,
 * and a card the owner designed is not one of them.
 */
export function usesOnlyRoles(arrangements: readonly Arrangement[]): boolean {
  const ok = (value: { from: string } | undefined) => value === undefined || value.from === 'role'

  return arrangements.every((arrangement) =>
    arrangement.elements.every((element) => {
      if (element.kind === 'shape') return ok(element.fill) && ok(element.stroke?.color)
      if (element.kind === 'text') return ok(element.color)
      if (element.kind === 'chip') return ok(element.fill)
      if (element.kind === 'image') return ok(element.stroke?.color)
      if (element.kind === 'priceMark') {
        const style = element.style
        return ok(style?.tint) && ok(style?.ink) && ok(style?.surface)
      }
      return true
    })
  )
}
