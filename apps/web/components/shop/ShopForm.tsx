'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * E2-02 — add or edit a shop.
 *
 * Same shape as SignupForm: values plus per-field errors, validate on blur,
 * re-validate on change once a field has errored, submit never disabled, one
 * `role="alert"` banner for whatever the server says, and everything typed is
 * preserved when the server rejects it.
 */

// `| undefined` is explicit for exactOptionalPropertyTypes — clearing an error
// means assigning undefined, not omitting the key.
type Errors = {
  name?: string | undefined
  phone?: string | undefined
}

export type ShopFormValues = {
  name: string
  location: string
  phone: string
}

export function ShopForm({
  shopId,
  initial,
  onDone,
  onCancel,
}: {
  /** Absent means this is a new shop. */
  shopId?: string | undefined
  initial?: Partial<ShopFormValues> | undefined
  onDone?: (() => void) | undefined
  onCancel?: (() => void) | undefined
}) {
  const router = useRouter()
  const [values, setValues] = React.useState<ShopFormValues>({
    name: initial?.name ?? '',
    location: initial?.location ?? '',
    phone: initial?.phone ?? '',
  })
  const [errors, setErrors] = React.useState<Errors>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const refs = {
    name: React.useRef<HTMLInputElement>(null),
    phone: React.useRef<HTMLInputElement>(null),
  }

  function set(field: keyof ShopFormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (field !== 'location' && errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: validate({ ...values, [field]: value })[field] }))
    }
  }

  function validate(v = values): Errors {
    const found: Errors = {}
    if (!v.name.trim()) found.name = 'Enter a name for this shop.'
    // Deliberately loose. Numbers arrive as +971 50 123 4567, 050 123 4567 and
    // 00971501234567, and refusing a real number somebody can be reached on is
    // worse than storing one that is formatted oddly.
    if (v.phone.trim() && !/[0-9]/.test(v.phone)) {
      found.phone = 'That does not look like a phone number.'
    }
    return found
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const found = validate()
    setErrors(found)
    const firstBad = (['name', 'phone'] as const).find((f) => found[f])
    if (firstBad) {
      refs[firstBad].current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(shopId ? `/api/v1/shops/${shopId}` : '/api/v1/shops', {
        method: shopId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          location: values.location.trim() || null,
          phone: values.phone.trim() || null,
        }),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        if (result.error.code === 'invalid_input') refs.name.current?.focus()
        return
      }

      onDone?.()
      router.refresh()
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
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

      <Input
        ref={refs.name}
        label="Shop name"
        name="name"
        placeholder="Al Madina Hypermarket"
        required
        value={values.name}
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, name: validate().name }))}
      />

      <Input
        label="Branch or location"
        name="location"
        placeholder="Al Barsha"
        hint="Which branch this is, if you have more than one."
        value={values.location}
        onChange={(e) => set('location', e.target.value)}
      />

      <Input
        ref={refs.phone}
        label="Phone number"
        name="phone"
        type="tel"
        placeholder="+971 50 123 4567"
        figure
        value={values.phone}
        error={errors.phone}
        onChange={(e) => set('phone', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, phone: validate().phone }))}
      />

      <p className="font-ui text-body-sm text-muted">
        <span className="text-critical-fg">*</span> Required
      </p>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={submitting}>
          {shopId ? 'Save changes' : 'Add shop'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
