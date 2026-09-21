/**
 * Where a universal catalog product's images live in R2, and what its stored
 * sizes are called.
 *
 * **Here rather than in either `lib/r2.ts` for the same reason `barcode.ts` and
 * `brand-slug.ts` are here**: more than one caller has to agree on the answer.
 * The worker's ingest writes these objects, the web app's catalog query builds
 * URLs from them, and a licensed replacement pass will one day overwrite them.
 * A second copy of a key derivation is a copy that eventually disagrees, and
 * the direction it disagrees in is an image that silently 404s on a printed
 * page. `packages/types` has no dependencies, so it is the only package the
 * browser bundle, the Next.js app and a CLI script can all import.
 *
 * Both `apps/web/lib/r2.ts` and `apps/worker/src/lib/r2.ts` re-export these, so
 * a call site keeps importing keys from the same module it always did.
 */

/**
 * Where a **universal** catalog product's images live.
 *
 * Every other key in this system starts with an organization id, because every
 * other asset belongs to one. A universal row belongs to nobody, so the prefix
 * is a literal instead — and it has to be, since the erasure-by-prefix property
 * the org-scoped keys exist for is exactly what must *not* apply here: deleting
 * a tenant cannot take the shared catalog with it.
 *
 * The product id is the directory. Two products can carry the same barcode
 * across collections and a name is not a key, so the row's own id is the only
 * thing guaranteed to be one per product.
 */
export function universalProductKey(productId: string, filename: string): string {
  return `catalog/universal/${productId}/${filename}`
}

/**
 * The sizes every catalog image is stored at.
 *
 * Two, not five. Each one exists because a surface asks for it and would
 * otherwise pull the full-size object:
 *
 * - **`sm` (320px)** — the catalog grid and search results, where forty
 *   products are on screen at once. At full size that screen is forty packshots
 *   and tens of megabytes on a phone connection, which is the shop owner in
 *   Dubai at 11pm this product is built for.
 * - **`md` (800px)** — the editor canvas and the card designer preview, which
 *   draw a product at a few hundred CSS pixels and need the retina headroom.
 *
 * **There is no `lg`.** The print path takes the full-size object, because the
 * PDF is vector output at press resolution and a downsampled rendition is
 * exactly the thing that would make it worse. `image_assets.r2Key` is that
 * object.
 */
export const IMAGE_VARIANTS = [
  { name: 'sm', width: 320 },
  { name: 'md', width: 800 },
] as const

export type ImageVariant = (typeof IMAGE_VARIANTS)[number]
export type ImageVariantName = ImageVariant['name']

/**
 * A stored size of an image, derived from its full-size key.
 *
 * **Derivatives are keyed, not rowed**, which is the decision worth writing
 * down. The obvious alternative is an `image_assets` row per size, and it is
 * worse in three ways: `ImageKind` is a Postgres enum, so every new size needs
 * a migration; `pickImage()` and the `kind <> 'THUMB'` filters in
 * `offer-book.ts` and `catalog.ts` would each have to learn which kinds are
 * sizes and which are renditions; and a card would carry three rows to choose
 * between. One row per *rendition* — the packshot, its cutout — with sizes
 * hanging off the key leaves every one of those readers untouched.
 *
 * The cost is that a variant URL is a promise rather than a lookup: nothing in
 * the database records that the object exists. The ingest writes the whole
 * ladder in one pass for exactly that reason, and a caller that cannot tolerate
 * a miss asks for the full-size key, which is the one `image_assets.r2Key`
 * holds.
 *
 * **Always WebP, and `@` is the separator.** WebP because these are screen
 * renditions and it carries the alpha a cutout's derivative needs; `@` because
 * `-` already means something in this namespace — `cutoutKey()` appends
 * `-cutout`, and `foo-cutout@sm.webp` has to stay readable as the small size of
 * the cutout rather than parse as a third thing.
 */
export function variantKey(fullKey: string, variant: ImageVariantName): string {
  return `${fullKey.replace(/\.[^./]+$/, '')}@${variant}.webp`
}

/**
 * Where a shadowed rendition of an image lives.
 *
 * **A derived key, not a row** — the same call `IMAGE_VARIANTS` makes above and
 * for the same reason. A shadow is one more rendition of a picture we already
 * have: `image_assets.shadowPresets` records *which* have been rendered so a
 * page never points at an object that is not there, and the key itself is
 * arithmetic rather than a lookup.
 *
 * **It sits beside the source rather than replacing it.** The unshadowed cutout
 * stays exactly where it was, which is what a card with no shadow draws and
 * what a different preset is re-rendered from. Re-rendering a shadow from a
 * shadow would compound the same way a blur does.
 */
export function shadowKey(r2Key: string, preset: string): string {
  const dot = r2Key.lastIndexOf('.')
  const stem = dot === -1 ? r2Key : r2Key.slice(0, dot)
  // Always PNG: a cast shadow is alpha by definition, and the source's own
  // extension says nothing about what the rendition needs.
  return `${stem}@shadow-${preset}.png`
}
