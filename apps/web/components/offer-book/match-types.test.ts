import { describe, expectTypeOf, it } from 'vitest'
import type { MatchedRow as FromRoute } from '@/app/api/v1/offer-books/match/route'
import type { MatchedRow as FromClient } from '@/components/offer-book/match-types'

/**
 * The two `MatchedRow` declarations, held to being one shape.
 *
 * **They are declared twice because they cannot be declared once.** The route
 * module imports `lib/catalog.ts`, which is `server-only`; a `'use client'`
 * component that imported the type from there would pull the module graph with
 * it, because a type import is erased but the module specifier is not always. So
 * the client keeps its own copy of the shape the route promises.
 *
 * Two copies of a wire format is exactly the drift this codebase keeps writing
 * comments about, and the cheapest fix is not a comment: assign each to the
 * other. A field added on one side, renamed, or made optional is then a
 * compile error in this file rather than `undefined` on a screen.
 *
 * Both directions, because one direction only catches removals.
 */
describe('MatchedRow', () => {
  it('is the same shape on both sides of the network', () => {
    expectTypeOf<FromRoute>().toEqualTypeOf<FromClient>()
  })

  it('is assignable each way, so neither side may quietly widen', () => {
    expectTypeOf<FromRoute>().toMatchTypeOf<FromClient>()
    expectTypeOf<FromClient>().toMatchTypeOf<FromRoute>()
  })
})
