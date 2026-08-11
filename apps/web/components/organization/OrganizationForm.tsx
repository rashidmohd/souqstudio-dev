'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

/**
 * E2-01 — organization settings.
 *
 * The billing contact email is `organizations.email`, seeded from whoever
 * signed up. It is deliberately not the same field as that person's login
 * address: an owner who leaves should not take the invoices with them.
 */

type Errors = {
  name?: string | undefined
  email?: string | undefined
  vatNumber?: string | undefined
}

/**
 * The GCC, plus the zones a UAE business actually operates across. Not the
 * whole IANA database: a dropdown of six hundred entries is a worse control
 * than a short list that covers the market, and the API accepts any valid zone
 * if this ever needs widening.
 */
const TIMEZONES = [
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Qatar',
  'Asia/Bahrain',
  'Asia/Kuwait',
  'Asia/Muscat',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Europe/London',
  'UTC',
]

const COUNTRIES = [
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'QA', label: 'Qatar' },
  { value: 'BH', label: 'Bahrain' },
  { value: 'KW', label: 'Kuwait' },
  { value: 'OM', label: 'Oman' },
]

export type OrganizationValues = {
  id: string
  name: string
  email: string
  vatNumber: string
  country: string
  timezone: string
}

export function OrganizationForm({
  organization,
  canEdit,
}: {
  organization: OrganizationValues
  canEdit: boolean
}) {
  const router = useRouter()
  const [values, setValues] = React.useState(organization)
  const [errors, setErrors] = React.useState<Errors>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const refs = {
    name: React.useRef<HTMLInputElement>(null),
    email: React.useRef<HTMLInputElement>(null),
    vatNumber: React.useRef<HTMLInputElement>(null),
  }

  function set(field: keyof OrganizationValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
    if (field in errors && errors[field as keyof Errors]) {
      setErrors((prev) => ({
        ...prev,
        [field]: validate({ ...values, [field]: value })[field as keyof Errors],
      }))
    }
  }

  function validate(v = values): Errors {
    const found: Errors = {}
    if (!v.name.trim()) found.name = 'Enter your organization name.'
    if (!v.email.trim()) found.email = 'Enter a billing contact email.'
    else if (!v.email.includes('@')) found.email = 'That does not look like an email address.'
    // Mirrors the server, which is where the rule is enforced. Checking here
    // too means they find out while looking at the field, not after a round trip.
    if (v.vatNumber.trim() && v.country === 'AE') {
      const digits = v.vatNumber.replace(/\s/g, '')
      if (!/^\d{15}$/.test(digits)) found.vatNumber = 'A UAE TRN is 15 digits.'
    }
    return found
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setSaved(false)

    const found = validate()
    setErrors(found)
    const firstBad = (['name', 'email', 'vatNumber'] as const).find((f) => found[f])
    if (firstBad) {
      refs[firstBad].current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/organizations/${organization.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          vatNumber: values.vatNumber.trim() || null,
          country: values.country,
          timezone: values.timezone,
        }),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        if (result.error.code === 'invalid_trn') refs.vatNumber.current?.focus()
        return
      }

      setSaved(true)
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

      {/* Saying so inline rather than with a toast: Toast has a signature in the
          inventory but no mounting mechanism, and inventing one would be a
          second API for the next session to find. */}
      {saved ? (
        <p
          role="status"
          className="rounded-control bg-positive-bg px-3 py-2 font-ui text-body-sm text-positive-fg"
        >
          Saved.
        </p>
      ) : null}

      <Input
        ref={refs.name}
        label="Organization name"
        name="name"
        placeholder="Al Madina Group"
        required
        disabled={!canEdit}
        value={values.name}
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, name: validate().name }))}
      />

      <Input
        ref={refs.email}
        label="Billing contact email"
        name="email"
        type="email"
        placeholder="accounts@almadina.ae"
        hint="Where invoices and payment notices go. Does not have to be your login."
        required
        disabled={!canEdit}
        value={values.email}
        error={errors.email}
        onChange={(e) => set('email', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, email: validate().email }))}
      />

      <Input
        ref={refs.vatNumber}
        label="VAT / TRN number"
        name="vatNumber"
        placeholder="100123456700003"
        hint="Printed on your invoices. Required for UAE business invoicing."
        figure
        disabled={!canEdit}
        value={values.vatNumber}
        error={errors.vatNumber}
        onChange={(e) => set('vatNumber', e.target.value)}
        onBlur={() => setErrors((prev) => ({ ...prev, vatNumber: validate().vatNumber }))}
      />

      <Select
        label="Country"
        name="country"
        required
        disabled={!canEdit}
        value={values.country}
        onChange={(e) => set('country', e.target.value)}
        options={COUNTRIES}
      />

      <Select
        label="Timezone"
        name="timezone"
        required
        disabled={!canEdit}
        hint="Used for scheduled offers and report dates."
        value={values.timezone}
        onChange={(e) => set('timezone', e.target.value)}
        options={TIMEZONES.map((zone) => ({ value: zone, label: zone.replace('_', ' ') }))}
      />

      {canEdit ? (
        <>
          <p className="font-ui text-body-sm text-muted">
            <span className="text-critical-fg">*</span> Required
          </p>
          <div>
            <Button type="submit" variant="primary" loading={submitting}>
              Save changes
            </Button>
          </div>
        </>
      ) : (
        // The reason a disabled control is disabled has to be on the screen,
        // never tooltip-only — it is unreachable on a tablet.
        <p className="font-ui text-body-sm text-muted">
          Only the organization owner can change these.
        </p>
      )}
    </form>
  )
}
