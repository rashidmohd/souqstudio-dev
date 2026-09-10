/**
 * The block document, validated at the edge. E7.
 *
 * **The schema moved into `@souqstudio/engine` and this is the door it kept.**
 * It guarded one boundary while a `PATCH` was the only way a document could
 * arrive. It now guards three — that route, a committed file, and an object
 * fetched from R2 — and the package all three can reach is the engine. See
 * `packages/engine/src/document.ts` for the reasoning and the rules.
 *
 * The re-export is not ceremony: `lib/` is where this app's routes look for the
 * rules they enforce, and a route reaching into the engine for a zod schema
 * would be reaching around that. Everything that imported this module before
 * imports it still.
 */

export {
  MAX_ARRANGEMENTS,
  MAX_ELEMENTS,
  MAX_GRADIENT_STOPS,
  arrangementsSchema,
  toArrangements,
  usesOnlyRoles,
} from '@souqstudio/engine'
