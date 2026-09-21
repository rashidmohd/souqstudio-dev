import { prisma } from '@souqstudio/db'
import { COVER_SHAPES, COVER_SHAPE_RATIO, POSE_COPY } from '@souqstudio/engine'
import { ok, fail } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { keyFromPublicUrl, publicUrl } from '@/lib/r2'

/**
 * Every picture this shop has generated, in one list. E8.
 *
 * **Because a generated image was only ever usable where it was made.** A cover
 * could be a page background and nothing else; a character and its poses could
 * be looked at in the brand kit and nowhere else at all. A shop that paid for a
 * mascot could not put it on a card it was designing — the card designer's
 * picker reads `block_assets`, which holds uploads, and no generated image has
 * ever had a row on it. So the artwork an owner paid the most for was the
 * artwork they could use least.
 *
 * **One route, read by both editors.** The card designer's artwork dialog and
 * the book editor's background picker each had their own idea of what was
 * available; two lists drifting apart is how one of them ends up missing a whole
 * kind of image, which is precisely what had already happened.
 *
 * **A key, not an id, is what a caller takes away.** Everything downstream — the
 * block document's `ImageSource`, `offer_book_pages.background`, `assetResolver`,
 * the export worker's painter — names artwork by R2 object key, and every
 * generated key is minted under `{organizationId}/…` by the worker that drew it.
 * That is what makes these usable without a single change to any of them, and
 * what makes the org-prefix tenancy check on the write routes cover them
 * already.
 *
 * **Logo marks are not here.** Only the mark a shop *adopted* is kept, as
 * `brandKit.logoUrl`, and it is already on every screen that wants it; the three
 * it did not adopt live in a job payload rather than in a table, and listing
 * them would mean reading `ai_jobs` as though it were a library. It is not one.
 */

/** What a caller gets per image. Keys, URLs and enough to label a tile. */
type GeneratedImage = {
  id: string
  /** Which library it came from, so a picker can group without parsing keys. */
  kind: 'cover' | 'character' | 'pose'
  key: string
  url: string
  /** Sentence case, shown under the tile. */
  label: string
  /** CSS `aspect-ratio`, so a tile can draw it at the shape it was made at. */
  ratio: string
  /**
   * Which of `COVER_SHAPES` it was drawn for. Covers only.
   *
   * **Sent alongside the ratio rather than instead of it**, because the two
   * answer different questions and a picker asks both: the ratio is what a tile
   * draws with, and the slug is what "this will be cropped on this page" is
   * decided from. A character has no answer to the second — it is artwork placed
   * on a page, not a picture of one — which is why the field is absent rather
   * than filled in with something plausible.
   */
  shape?: string
}

/**
 * A character is a full-length figure on a plain ground and a pose is the same
 * figure again — both drawn square, and both cropped by anything that assumes
 * otherwise.
 */
const SQUARE = '1 / 1'

export async function GET() {
  const { session, response } = await requireApiSession({ requireVerifiedEmail: true })
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  /*
   * Shop-scoped in all three queries, and the shop comes from the cookie
   * resolved against the session — never from the request. Poses reach their
   * shop through their character, which is why that one is a nested predicate
   * rather than a column.
   */
  const [covers, characters, poses] = await Promise.all([
    prisma.cover.findMany({
      where: { shopId: shop.id },
      select: { id: true, r2Key: true, campaign: true, shape: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.character.findMany({
      where: { shopId: shop.id },
      select: { id: true, baseImageUrl: true, style: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.characterPose.findMany({
      where: { character: { shopId: shop.id } },
      select: { id: true, imageUrl: true, poseType: true, customLabel: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const images: GeneratedImage[] = [
    ...covers.map((cover) => ({
      id: cover.id,
      kind: 'cover' as const,
      key: cover.r2Key,
      url: publicUrl(cover.r2Key),
      label: `${sentence(cover.campaign)} cover`,
      ratio: ratioOf(cover.shape),
      shape: cover.shape,
    })),
    /*
     * **Characters and poses store a URL where a cover stores a key**, which is
     * a difference in those tables and not one worth papering over here with a
     * second column. `keyFromPublicUrl` is the seam that already exists for it —
     * the pose worker reads a character back through the same function. A row
     * whose URL is not an R2 object of ours drops out rather than arriving as a
     * tile that cannot be used.
     */
    ...characters.flatMap((character) => {
      const key = keyFromPublicUrl(character.baseImageUrl)
      return key === null
        ? []
        : [
            {
              id: character.id,
              kind: 'character' as const,
              key,
              url: character.baseImageUrl,
              label: `${sentence(character.style)} character`,
              ratio: SQUARE,
            },
          ]
    }),
    ...poses.flatMap((pose) => {
      const key = keyFromPublicUrl(pose.imageUrl)
      return key === null
        ? []
        : [
            {
              id: pose.id,
              kind: 'pose' as const,
              key,
              url: pose.imageUrl,
              label: poseLabel(pose.poseType, pose.customLabel),
              ratio: SQUARE,
            },
          ]
    }),
  ]

  return ok({ images })
}

/**
 * The ratio for a stored cover shape.
 *
 * A plain string from a column, never a `CoverShape` — a row may name a shape we
 * have stopped offering, and a picker full of them must still render. The same
 * rule, and the same fallback, as `lib/cover-shape.ts` on the client.
 */
function ratioOf(shape: string): string {
  const found = COVER_SHAPES.find((known) => known === shape)
  return COVER_SHAPE_RATIO[found ?? 'portrait'].css
}

/** A pose's own name where it has one, the engine's copy otherwise. */
function poseLabel(poseType: string, customLabel: string | null): string {
  if (customLabel !== null && customLabel !== '') return customLabel
  // Asserted because `poseType` is a stored column and the map is keyed by the
  // poses we currently draw. A row naming an older one indexes to `undefined`,
  // which the fallback handles — the assertion is how the lookup is spelled.
  const copy = POSE_COPY[poseType as keyof typeof POSE_COPY]
  return copy === undefined ? sentence(poseType) : copy.label
}

/** Sentence case from a stored slug. Never an index into an engine map: a kept
 *  row may name a campaign or a style we no longer offer. */
function sentence(slug: string): string {
  const words = slug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
