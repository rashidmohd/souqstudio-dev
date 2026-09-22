import { prisma } from '@souqstudio/db'
import { storePhotoKeysOf } from '@souqstudio/engine'
import { fail, ok } from '@/lib/api'
import { requireApiSession } from '@/lib/api-session'
import { getActiveShop } from '@/lib/active-shop'
import { keyFromPublicUrl, publicUrl } from '@/lib/r2'
import { readEffectiveBrand } from '@/lib/brand-kit'

/**
 * What a cover can be drawn from. E8-04.
 *
 * **The art direction comes from here too**, because it lives in `cover_prompts`
 * and is tuned without a deploy. A picker with the occasions compiled into it
 * would drift from the rows the moment somebody edited one.
 *
 * **The dialog cannot ask a question it does not know the answer to.** Offering
 * "put your character in it" to a shop that has no character is an option that
 * fails on click, and offering "use photos of your shop" to one that uploaded
 * none is worse — the owner ticks it, the cover comes back generic, and nothing
 * says why. So the screen reads this first and only offers what exists.
 *
 * **Keys never leave here; URLs do.** The generate route takes booleans and an
 * id and reads the keys itself, so a client that decided to send a different key
 * would have nowhere to send it. What comes back is what a thumbnail needs.
 *
 * Shop-scoped, like everything else on this path — `characters` has no
 * `organizationId` by design and every query against it goes by `shopId` from
 * the active shop. `E8-pending.md` §3a item 3.
 */

export async function GET() {
  const { session, response } = await requireApiSession()
  if (!session) return response

  const shop = await getActiveShop(session)
  if (!shop) return fail('no_shop', 'This account has no shop yet.', 409)

  const [prompts, characters, shopRow, brand] = await Promise.all([
    // Active only, in the order an admin put them in. The picker renders what
    // it is given and never decides what is offerable.
    prisma.coverPrompt.findMany({
      where: { isActive: true },
      select: { slug: true, label: true, hint: true, group: true, person: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    }),
    prisma.character.findMany({
      where: { shopId: shop.id },
      select: { id: true, baseImageUrl: true, style: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shop.findUnique({
      where: { id: shop.id },
      select: { storePhotoKeys: true },
    }),
    readEffectiveBrand({
      organizationId: shop.organizationId,
      shopId: shop.id,
      brandOverride: shop.brandOverride,
    }),
  ])

  /**
   * The logo, only when it is one a cover could actually be drawn from.
   *
   * **`keyFromPublicUrl` is the test, not a null check on the URL.** The
   * generate route resolves the same way and refuses a logo it cannot turn into
   * an R2 key — a kit pointing anywhere else is not fetched over HTTP by a
   * background job. Offering the option here and refusing it there is the
   * "fails on click" failure this file's header is about, so the two agree by
   * running the same function.
   */
  const logoUrl =
    brand.logoUrl !== null && keyFromPublicUrl(brand.logoUrl) !== null ? brand.logoUrl : null

  return ok({
    prompts,
    characters,
    // Read defensively: it is a JSON column, and `storePhotoKeysOf` is the one
    // function that decides what a usable value in it looks like.
    storePhotos: storePhotoKeysOf(shopRow?.storePhotoKeys).map((key) => ({
      key,
      url: publicUrl(key),
    })),
    // A URL, never the key — the generate route reads the key itself, so a
    // client that decided to send a different one has nowhere to send it.
    logoUrl,
  })
}
