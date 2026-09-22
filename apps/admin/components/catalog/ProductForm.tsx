'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Field, FieldLegend } from '@/components/ui/field'
import { Input, NumberInput, Select } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/states'
import {
  PACK_UNITS,
  SELL_BY,
  fromFormValues,
  productSchema,
  type ProductFormValues,
} from '@/lib/catalog-schema'

/**
 * Add or edit a catalog product. E13-02.
 *
 * One form for both, because the fields are identical and two would drift. What
 * differs is the verb and the route, which are props.
 *
 * **Archiving is not here.** It is a separate control on the detail page with
 * its own confirmation, because "never delete, archive" is the rule that keeps
 * published offer books working and it should not be reachable by tabbing past
 * a spec field.
 */
export function ProductForm({
  initial,
  productId,
  categories,
}: {
  initial: ProductFormValues
  /** Absent when this is a new product. */
  productId?: string
  categories: readonly string[]
}) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormValues, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function set<K extends keyof ProductFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
    // Once a field has errored, re-validate as it changes so the message clears
    // as it is fixed rather than persisting until the next blur.
    if (errors[key] !== undefined) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailure(null)

    const parsed = productSchema.safeParse(fromFormValues(values))
    if (!parsed.success) {
      const next: Partial<Record<keyof ProductFormValues, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && next[key as keyof ProductFormValues] === undefined) {
          next[key as keyof ProductFormValues] = issue.message
        }
      }
      setErrors(next)
      // Move focus to the first field that failed, rather than leaving somebody
      // to hunt for it in a form this long.
      const first = Object.keys(next)[0]
      if (first !== undefined) document.getElementById(first)?.focus()
      return
    }

    setPending(true)
    try {
      const response = await fetch(
        productId === undefined
          ? '/api/v1/admin/catalog/products'
          : `/api/v1/admin/catalog/products/${productId}`,
        {
          method: productId === undefined ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        }
      )
      const result = (await response.json()) as ApiResult<{ id: string }>

      if (result.error !== null) {
        setFailure(result.error.message)
        return
      }

      router.push(`/catalog/${result.data.id}`)
      router.refresh()
    } catch {
      setFailure('The server did not answer. Nothing was saved, so try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {failure === null ? null : <ErrorState title="Not saved" body={failure} />}

      <Card className="flex flex-col gap-4">
        <h2 className="text-subhead text-primary">Name</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name (English)" htmlFor="nameEn" required error={errors.nameEn}>
            <Input
              id="nameEn"
              value={values.nameEn}
              onChange={(event) => set('nameEn', event.target.value)}
              placeholder="Almarai fresh laban"
            />
          </Field>
          <Field
            label="Name (Arabic)"
            htmlFor="nameAr"
            error={errors.nameAr}
            hint="An Arabic edition cannot publish without it."
          >
            <Input
              id="nameAr"
              dir="rtl"
              value={values.nameAr}
              onChange={(event) => set('nameAr', event.target.value)}
            />
          </Field>
          <Field label="Brand (English)" htmlFor="brandEn" error={errors.brandEn}>
            <Input
              id="brandEn"
              value={values.brandEn}
              onChange={(event) => set('brandEn', event.target.value)}
              placeholder="Almarai"
            />
          </Field>
          <Field label="Brand (Arabic)" htmlFor="brandAr" error={errors.brandAr}>
            <Input
              id="brandAr"
              dir="rtl"
              value={values.brandAr}
              onChange={(event) => set('brandAr', event.target.value)}
            />
          </Field>
          <Field
            label="Spec (English)"
            htmlFor="specEn"
            error={errors.specEn}
            hint="The variant line under the name."
          >
            <Input
              id="specEn"
              value={values.specEn}
              onChange={(event) => set('specEn', event.target.value)}
              placeholder="Assorted flavours, 200 ml cup"
            />
          </Field>
          <Field label="Spec (Arabic)" htmlFor="specAr" error={errors.specAr}>
            <Input
              id="specAr"
              dir="rtl"
              value={values.specAr}
              onChange={(event) => set('specAr', event.target.value)}
            />
          </Field>
          <Field label="Origin (English)" htmlFor="originEn" error={errors.originEn}>
            <Input
              id="originEn"
              value={values.originEn}
              onChange={(event) => set('originEn', event.target.value)}
              placeholder="Saudi Arabia"
            />
          </Field>
          <Field label="Origin (Arabic)" htmlFor="originAr" error={errors.originAr}>
            <Input
              id="originAr"
              dir="rtl"
              value={values.originAr}
              onChange={(event) => set('originAr', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-subhead text-primary">Where it sits</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Category" htmlFor="category" error={errors.category}>
            <Select
              id="category"
              value={values.category}
              onChange={(event) => set('category', event.target.value)}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory" htmlFor="subcategory" error={errors.subcategory}>
            <Input
              id="subcategory"
              value={values.subcategory}
              onChange={(event) => set('subcategory', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-subhead text-primary">Identity and pack</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Barcode"
            htmlFor="barcode"
            error={errors.barcode}
            hint="The world's identity for this product."
          >
            <Input
              id="barcode"
              inputMode="numeric"
              data-figure=""
              dir="ltr"
              className="font-figure text-data"
              value={values.barcode}
              onChange={(event) => set('barcode', event.target.value)}
              placeholder="6291001234567"
            />
          </Field>
          <Field
            label="SKU"
            htmlFor="sku"
            error={errors.sku}
            hint="The shop's own item code. Not interchangeable with a barcode."
          >
            <Input
              id="sku"
              value={values.sku}
              onChange={(event) => set('sku', event.target.value)}
            />
          </Field>
          <Field label="Supplier" htmlFor="supplier" error={errors.supplier}>
            <Input
              id="supplier"
              value={values.supplier}
              onChange={(event) => set('supplier', event.target.value)}
            />
          </Field>
          <Field
            label="Sold by"
            htmlFor="sellBy"
            error={errors.sellBy}
            hint="Loose means the price is already per unit."
          >
            <Select
              id="sellBy"
              value={values.sellBy}
              onChange={(event) => set('sellBy', event.target.value)}
            >
              {SELL_BY.map((option) => (
                <option key={option} value={option}>
                  {option === 'PACK' ? 'Pack' : 'Loose'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pack size" htmlFor="packSize" error={errors.packSize}>
            <NumberInput
              id="packSize"
              value={values.packSize}
              onChange={(event) => set('packSize', event.target.value)}
              placeholder="200"
            />
          </Field>
          <Field label="Pack unit" htmlFor="packUnit" error={errors.packUnit}>
            <Select
              id="packUnit"
              value={values.packUnit}
              onChange={(event) => set('packUnit', event.target.value)}
            >
              <option value="">No unit</option>
              {PACK_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Pack count"
            htmlFor="packCount"
            error={errors.packCount}
            hint="The multiplier on a multipack. 8 x 25 g is size 25, unit G, count 8."
          >
            <NumberInput
              id="packCount"
              value={values.packCount}
              onChange={(event) => set('packCount', event.target.value)}
              placeholder="8"
              disabled={values.sellBy === 'LOOSE'}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLegend />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {productId === undefined ? 'Add product' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  )
}
