import { requireAdminRole } from '@/lib/admin-auth'
import { listCategoryNames } from '@/lib/catalog-list'
import { toFormValues } from '@/lib/catalog-schema'
import { ProductForm } from '@/components/catalog/ProductForm'
import { PageHeader } from '@/components/shared/PageHeader'

/**
 * Add a product to the universal catalog. E13-02.
 *
 * There is no collection picker. Everything created here is universal, for the
 * reason the route gives.
 */
export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  await requireAdminRole('catalog_manager')
  const categories = await listCategoryNames()

  return (
    <>
      <PageHeader
        title="Add product"
        description="It goes into the universal catalog, so every organization can find it."
      />
      <ProductForm initial={toFormValues({ sellBy: 'PACK' })} categories={categories} />
    </>
  )
}
