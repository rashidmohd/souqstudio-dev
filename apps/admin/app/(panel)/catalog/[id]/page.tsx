import { notFound } from 'next/navigation'
import { prisma } from '@souqstudio/db'
import { requireAdmin } from '@/lib/admin-auth'
import { listCategoryNames } from '@/lib/catalog-list'
import { toFormValues } from '@/lib/catalog-schema'
import { ProductForm } from '@/components/catalog/ProductForm'
import { ProductImages, type ProductImage } from '@/components/catalog/ProductImages'
import { ProductStateActions } from '@/components/catalog/ProductStateActions'
import { PageHeader } from '@/components/shared/PageHeader'
import { publicUrl, r2Config } from '@/lib/r2'
import { Card } from '@/components/ui/card'
import { Figure } from '@/components/ui/figure'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * One catalog product. E13-02.
 *
 * A support agent can read this and cannot change it: the form is only rendered
 * for a catalog manager, and the routes behind it check the role again. The
 * read is the point for support — "why is this shop seeing that" is answered
 * here.
 */
export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }: { params: { id: string } }) {
  const { admin } = await requireAdmin()

  const [product, categories] = await Promise.all([
    prisma.catalogProduct.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        brandEn: true,
        brandAr: true,
        specEn: true,
        specAr: true,
        originEn: true,
        originAr: true,
        category: true,
        subcategory: true,
        barcode: true,
        sku: true,
        supplier: true,
        packSize: true,
        packUnit: true,
        packCount: true,
        sellBy: true,
        source: true,
        organizationId: true,
        archivedAt: true,
        enrichedAt: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { name: true } },
        images: {
          select: {
            id: true,
            kind: true,
            reviewState: true,
            r2Key: true,
            width: true,
            height: true,
            quality: true,
            derivedFrom: true,
            createdAt: true,
          },
          // Cutouts first: it is the one a card actually draws, so it is the one
          // somebody opening this screen came to look at.
          orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
        },
        synonyms: { select: { id: true, synonym: true, language: true } },
      },
    }),
    listCategoryNames(),
  ])

  if (product === null) notFound()

  const mayEdit = admin.role !== 'support_agent'
  const upload = r2Config()

  /*
   * The URL is built here rather than stored. `image_assets.r2Key` is an object
   * key and always will be — the same rule `blocks` follows for artwork — so
   * that the bucket can move without rewriting every row.
   */
  const images: ProductImage[] = product.images.map((image) => ({
    id: image.id,
    kind: image.kind,
    reviewState: image.reviewState,
    url: publicUrl(image.r2Key),
    width: image.width,
    height: image.height,
    quality: image.quality,
    derivedFrom: image.derivedFrom,
    createdAt: image.createdAt.toISOString(),
  }))

  const values = toFormValues({
    ...product,
    // Decimal to number, so the form holds the same type the schema validates.
    packSize: product.packSize === null ? null : Number(product.packSize),
  })

  return (
    <>
      <PageHeader
        title={product.nameEn}
        description={
          product.organizationId === null
            ? 'Universal catalog, visible to every organization.'
            : `Private to ${product.organization?.name ?? product.organizationId}.`
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {product.archivedAt === null ? (
          <StatusPill tone="positive">Active</StatusPill>
        ) : (
          <StatusPill tone="quiet">Archived</StatusPill>
        )}
        {product.organizationId === null ? (
          <StatusPill tone="neutral">Universal</StatusPill>
        ) : (
          <StatusPill tone="neutral">Organization</StatusPill>
        )}
        {product.nameAr === null ? (
          <StatusPill tone="caution">No Arabic name</StatusPill>
        ) : null}
        {product.enrichedAt === null ? (
          <StatusPill tone="quiet">Not enriched</StatusPill>
        ) : (
          <StatusPill tone="machine">Enriched</StatusPill>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <h2 className="text-label font-medium text-secondary">Provenance</h2>
          <dl className="flex flex-col gap-1 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Source</dt>
              <dd className="text-primary">{product.source ?? 'unknown'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Added</dt>
              <dd>
                <Figure size="data-sm">{product.createdAt.toISOString().slice(0, 10)}</Figure>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Changed</dt>
              <dd>
                <Figure size="data-sm">{product.updatedAt.toISOString().slice(0, 10)}</Figure>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-label font-medium text-secondary">Synonyms</h2>
          {product.synonyms.length === 0 ? (
            <p className="text-body-sm text-muted">
              None. The enrich worker still throws, so nothing has generated any.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1">
              {product.synonyms.map((synonym) => (
                <li key={synonym.id}>
                  <StatusPill tone="quiet">
                    {synonym.synonym} ({synonym.language})
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ProductImages
        productId={product.id}
        images={images}
        canUpload={upload.ok}
        uploadOffReason={upload.ok ? null : upload.reason}
        mayEdit={mayEdit}
      />

      {mayEdit ? (
        <>
          <ProductForm initial={values} productId={product.id} categories={categories} />
          <Card className="flex flex-col gap-3">
            <h2 className="text-subhead text-primary">State</h2>
            <ProductStateActions
              productId={product.id}
              productName={product.nameEn}
              archived={product.archivedAt !== null}
              isPrivate={product.organizationId !== null}
            />
          </Card>
        </>
      ) : (
        <Card>
          <p className="text-body text-secondary">
            Your role can read the catalog. Changing a product needs the catalog manager
            role.
          </p>
        </Card>
      )}
    </>
  )
}
