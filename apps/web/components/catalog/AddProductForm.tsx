'use client'

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { ApiResult, CatalogCategoryTile } from '@souqstudio/types'

/**
 * E5-04 — add a product the catalog does not have.
 *
 * Same shape as `ShopForm`: values plus per-field errors, validate on blur,
 * re-validate on change once a field has errored, submit never disabled, one
 * `role="alert"` banner for whatever the server says, and everything typed is
 * preserved when the server rejects it.
 *
 * **The photo uploads before the form is submitted**, on selection, so the wait
 * that a 4MB phone photo on 4G actually costs happens while the owner is still
 * typing the name rather than after they press the button. The form carries the
 * resulting key; the key is what the server validates against this shop's
 * prefix.
 *
 * `nameAr` is offered and never required. E5 §2 makes it a completeness warning
 * at publish time, not a gate at entry — an owner adding a product at 11pm to
 * get a flyer out does not also have the Arabic to hand, and blocking them here
 * is how a catalog stops being self-served.
 */

type Errors = {
  photo?: string | undefined
  nameEn?: string | undefined
  packSize?: string | undefined
  barcode?: string | undefined
}

type Values = {
  nameEn: string
  nameAr: string
  brandEn: string
  specEn: string
  category: string
  packSize: string
  packUnit: string
  packCount: string
  barcode: string
}

const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.'

const PACK_UNITS = [
  { value: 'G', label: 'Grams' },
  { value: 'KG', label: 'Kilograms' },
  { value: 'ML', label: 'Millilitres' },
  { value: 'L', label: 'Litres' },
  { value: 'PIECE', label: 'Pieces' },
]

/** Matches the catalog search box. Long enough to not fire per keystroke. */
const BRAND_DEBOUNCE_MS = 300

export function AddProductForm({
  categories,
  initialName,
  initialBarcode,
  onDone,
  onCancel,
}: {
  categories: CatalogCategoryTile[]
  /** What they searched for, so the form starts from the thing they wanted. */
  initialName?: string | undefined
  /** Set when they got here by scanning a code nothing matched. */
  initialBarcode?: string | undefined
  onDone: (productId: string) => void
  onCancel: () => void
}) {
  const brandListId = React.useId()
  const [brandSuggestions, setBrandSuggestions] = React.useState<string[]>([])

  const [values, setValues] = React.useState<Values>({
    nameEn: initialName ?? '',
    nameAr: '',
    brandEn: '',
    specEn: '',
    category: '',
    packSize: '',
    packUnit: '',
    packCount: '',
    barcode: initialBarcode ?? '',
  })
  const [errors, setErrors] = React.useState<Errors>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const [uploading, setUploading] = React.useState(false)
  const [imageKey, setImageKey] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)

  const nameRef = React.useRef<HTMLInputElement>(null)

  // The preview is an object URL over the local file, not the uploaded object:
  // R2 is not necessarily readable the instant the PUT returns, and a broken
  // image where the photo should be reads as a failed upload.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  /**
   * Brand completions, debounced on what has been typed.
   *
   * Failures are swallowed rather than surfaced. This is a convenience over a
   * field that already works without it, so a network blip should leave the
   * owner typing a brand — not reading an error about a suggestion list they
   * did not ask for. The form's `role="alert"` banner is for the submit.
   */
  React.useEffect(() => {
    const q = values.brandEn.trim()
    if (!q) {
      setBrandSuggestions([])
      return
    }

    let settled = false

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/v1/catalog/brands?q=${encodeURIComponent(q)}`)
          const result: ApiResult<{ brands: string[] }> = await res.json()
          if (settled || result.error) return
          setBrandSuggestions(result.data.brands)
        } catch {
          // Deliberately silent — see above.
        }
      })()
    }, BRAND_DEBOUNCE_MS)

    return () => {
      settled = true
      clearTimeout(timer)
    }
  }, [values.brandEn])

  function set(field: keyof Values, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (field in errors && errors[field as keyof Errors]) {
      setErrors((prev) => ({
        ...prev,
        ...validate({ ...values, [field]: value }, imageKey),
      }))
    }
  }

  function validate(v = values, key = imageKey): Errors {
    const found: Errors = {}
    if (!key) found.photo = 'Add a photo of the product.'
    if (!v.nameEn.trim()) found.nameEn = 'Enter the product name.'
    if (v.packSize.trim() && !/^\d{1,7}(\.\d{1,3})?$/.test(v.packSize.trim())) {
      found.packSize = 'Use digits, like 500 or 1.5.'
    }
    // Length only. The check digit is the server's answer, because it is the
    // same rule the barcode lookup applies and two copies would disagree.
    if (v.barcode.trim() && !/^[\d\s-]{8,20}$/.test(v.barcode.trim())) {
      found.barcode = 'A barcode is 8 to 14 digits.'
    }
    return found
  }

  async function onPickFile(file: File) {
    setUploading(true)
    setFormError(null)
    setErrors((prev) => ({ ...prev, photo: undefined }))

    try {
      const authRes = await fetch('/api/v1/catalog/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, contentLength: file.size }),
      })
      const auth = await authRes.json()
      if (auth.error) {
        setErrors((prev) => ({ ...prev, photo: auth.error.message }))
        return
      }

      const put = await fetch(auth.data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!put.ok) {
        setErrors((prev) => ({ ...prev, photo: 'That photo did not upload. Try again.' }))
        return
      }

      setImageKey(auth.data.key)
      setPreview(URL.createObjectURL(file))
    } catch {
      setFormError(NETWORK_ERROR)
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const found = validate()
    setErrors(found)
    // The photo error renders inside the dropzone with `role="alert"`, so it
    // announces itself; focus goes to the first field the owner can actually
    // type in rather than to a control they reach by pressing a button.
    if (found.photo || found.nameEn || found.packSize || found.barcode) {
      nameRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/catalog/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageKey,
          nameEn: values.nameEn.trim(),
          ...(values.nameAr.trim() ? { nameAr: values.nameAr.trim() } : {}),
          ...(values.brandEn.trim() ? { brandEn: values.brandEn.trim() } : {}),
          ...(values.specEn.trim() ? { specEn: values.specEn.trim() } : {}),
          ...(values.category ? { category: values.category } : {}),
          ...(values.packSize.trim() ? { packSize: values.packSize.trim() } : {}),
          ...(values.packUnit ? { packUnit: values.packUnit } : {}),
          ...(values.packCount.trim()
            ? { packCount: Number(values.packCount.trim()) }
            : {}),
          ...(values.barcode.trim() ? { barcode: values.barcode.trim() } : {}),
        }),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        if (result.error.code === 'invalid_barcode' || result.error.code === 'barcode_exists') {
          setErrors((prev) => ({ ...prev, barcode: result.error.message }))
        }
        return
      }

      onDone(result.data.productId)
    } catch {
      setFormError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-control bg-critical-bg px-3 py-2 font-ui text-body-sm text-critical-fg"
        >
          {formError}
        </p>
      ) : null}

      {/* No illustration here, deliberately. This zone sits inside a form the
          owner is halfway through, and the design system permits artwork only
          where nothing is in progress — the same rule that keeps it off
          zero-results and error states. */}
      <FileDropzone
        label="Photo of the product"
        accept="image/png,image/jpeg,image/webp"
        busy={uploading}
        buttonLabel={preview ? 'Choose a different photo' : 'Choose a photo'}
        onFile={(file) => void onPickFile(file)}
        {...(errors.photo ? { error: errors.photo } : {})}
        hint="PNG, JPG or WebP, at least 400 pixels on each side. We remove the background for you."
      >
        {preview ? (
          // A local object URL rather than the uploaded object: R2 is not
          // necessarily readable the instant the PUT returns, and a broken
          // image where the photo should be reads as a failed upload.
          <div className="relative h-preview w-full max-w-xs overflow-hidden rounded-control bg-sand-tint">
            <Image src={preview} alt="" aria-hidden="true" fill unoptimized className="object-contain" />
          </div>
        ) : null}
      </FileDropzone>

      <Input
        ref={nameRef}
        label="Product name"
        name="nameEn"
        placeholder="Basmati rice"
        required
        value={values.nameEn}
        error={errors.nameEn}
        onChange={(e) => set('nameEn', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, nameEn: validate().nameEn }))}
      />

      <Input
        label="Product name in Arabic"
        name="nameAr"
        lang="ar"
        dir="rtl"
        placeholder="أرز بسمتي"
        hint="Optional now. Needed before this product goes into an Arabic offer book."
        value={values.nameAr}
        onChange={(e) => set('nameAr', e.target.value)}
      />

      {/* **Suggested, never constrained.** A native `list` + `<datalist>` rather
          than a listbox built from divs — the same call `Select` and
          `ShopSwitcher` made, and for the same reason: on the phone a shop
          owner is actually holding, the platform picker brings its own scroll
          physics and accessibility tree.

          It also happens to be the only version that cannot become a closed
          vocabulary by accident. The input is an ordinary text field that
          happens to offer completions, so a brand nobody has typed before still
          goes in — which is E5's rule that nothing blocks an owner adding a
          product. */}
      <Input
        label="Brand"
        name="brandEn"
        placeholder="Al Wadi"
        list={brandListId}
        autoComplete="off"
        hint="Start typing to see brands already in the catalog, or enter a new one."
        value={values.brandEn}
        onChange={(e) => set('brandEn', e.target.value)}
      />
      <datalist id={brandListId}>
        {brandSuggestions.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>

      <Input
        label="Variant"
        name="specEn"
        placeholder="Assorted flavours, 200g tub"
        hint="The line that goes under the name on a card."
        value={values.specEn}
        onChange={(e) => set('specEn', e.target.value)}
      />

      <Select
        label="Category"
        name="category"
        placeholder="Choose a category"
        options={categories.map((c) => ({ value: c.name, label: c.name }))}
        value={values.category}
        onChange={(e) => set('category', e.target.value)}
      />

      <div className="flex flex-wrap items-start gap-3">
        <Input
          label="Pack size"
          name="packSize"
          figure
          placeholder="500"
          value={values.packSize}
          error={errors.packSize}
          onChange={(e) => set('packSize', e.target.value)}
          onBlur={() => setErrors((prev) => ({ ...prev, packSize: validate().packSize }))}
        />
        <Select
          label="Unit"
          name="packUnit"
          placeholder="Unit"
          options={PACK_UNITS}
          value={values.packUnit}
          onChange={(e) => set('packUnit', e.target.value)}
        />
        <Input
          label="Items per pack"
          name="packCount"
          figure
          placeholder="1"
          hint="8 for an 8 × 25 g multipack."
          value={values.packCount}
          onChange={(e) => set('packCount', e.target.value)}
        />
      </div>

      <Input
        label="Barcode"
        name="barcode"
        figure
        inputMode="numeric"
        placeholder="6291001234567"
        value={values.barcode}
        error={errors.barcode}
        onChange={(e) => set('barcode', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, barcode: validate().barcode }))}
      />

      <p className="font-ui text-body-sm text-muted">
        <span className="text-critical-fg">*</span> Required
      </p>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={submitting}>
          Add product
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <p className="font-ui text-body-sm text-muted">
        This product is yours to use straight away. We also send it for review, and if it
        is approved every shop gets it.
      </p>
    </form>
  )
}
