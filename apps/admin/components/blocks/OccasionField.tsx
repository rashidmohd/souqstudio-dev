'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Select } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'

/**
 * Which occasion a library draft is for. E13-04.
 *
 * **On the draft, not only in the publish form**, so it survives between
 * publishes: the next version of a Ramadan band is still for Ramadan. Publish
 * reads it from the row and writes it into the library document, and the sync
 * gives it to every shop's copy, which is what the picker's calendar reads.
 *
 * The window is never set here. Ramadan and both Eids move against the
 * Gregorian calendar, so the engine computes the dates from the occasion.
 */
export function OccasionField({
  blockId,
  occasion,
  options,
}: {
  blockId: string
  occasion: string | null
  options: readonly { value: string; label: string }[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(occasion ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/v1/admin/blocks/${blockId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ occasion: value === '' ? null : value }),
      })
      const result = (await response.json()) as ApiResult<unknown>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      router.refresh()
    } catch {
      setError('The occasion was not saved. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <Field
        label="Occasion"
        htmlFor="block-occasion"
        hint="Shops are offered a seasonal block in the weeks before its occasion. The dates are worked out every year."
      >
        <Select id="block-occasion" value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">None, not seasonal</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {error === null ? null : <ErrorState title="Not saved" body={error} />}
      <div>
        <Button type="submit" loading={busy} disabled={value === (occasion ?? '')}>
          Save occasion
        </Button>
      </div>
    </form>
  )
}
