import type { NextRequest } from 'next/server'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { requireOrgRole } from '@/lib/authz'
import { parseSvgShape } from '@/lib/svg-shape'

/**
 * An uploaded drawing, read as a shape. E7.
 *
 * **The one upload in the product that stores nothing at all.** Its two
 * siblings both end in the bucket: `artwork` presigns a PUT for a photograph,
 * and `artwork/vector` takes an SVG through the server, rasterises it and keeps
 * the PNG. This one reads the file, hands back its geometry and forgets it. The
 * outline rides on the block document from here, because the outline *is* the
 * element — and a drawing that is a few hundred bytes of path data does not
 * want an object, a key, a row and an orphan to collect later.
 *
 * **Which is also why the SVG rule is not being bent.** That rule is about what
 * we *serve*: an SVG on our own domain is script-bearing content, and every
 * shared link would deliver it. Nothing here is ever served. `parseSvgShape`
 * returns path commands and numbers, `shapeArtSchema` in the engine re-validates
 * them against the same two alphabets before a document may hold them, and
 * neither alphabet can spell a script. The file itself does not survive the
 * function call.
 *
 * Through the server rather than presigned, for the reason the vector route
 * gives: a drawing is tens of kilobytes and fits in a request body, and
 * something has to read it before anything else can happen.
 *
 * `Content-Type` is not trusted, here or there. It is a string the client
 * chose; what decides whether this is a drawing is whether the parser can find
 * an outline in it.
 */
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  // Designing a block changes what every future book in the organization looks
  // like, which is the bar the rest of this epic puts on it.
  const allowed = requireOrgRole(session, 'manager')
  if (!allowed.ok) return allowed.response

  const body = await request.text()
  if (body.length === 0) {
    return fail('invalid_input', 'Upload an SVG to use as a shape.', 422)
  }

  // **The parser's sentence, not ours.** Every refusal it returns names the
  // thing in the file and what to do about it — outline the text, flatten the
  // clip, export the shapes expanded — and replacing them all with one generic
  // message here would throw away the only part an owner can act on.
  const parsed = parseSvgShape(body)
  if (!parsed.ok) return fail('invalid_input', parsed.reason, 422)

  return ok({ art: parsed.art })
}
