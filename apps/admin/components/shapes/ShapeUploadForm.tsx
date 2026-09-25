'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'

type Option = { value: string; label: string }

/**
 * Add a shape to the gallery, as a draft. E13-04.
 *
 * The file is read here and posted as text, the way the designer's own
 * "Upload a shape" does: the server is what decides whether it is a drawing, and
 * its refusals name the thing to fix ("convert the text to outlines"), so they
 * are shown as they come back.
 */
export function ShapeUploadForm({
  groups,
  occasions,
}: {
  groups: readonly Option[]
  occasions: readonly Option[]
}) {
  const router = useRouter()
  const file = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [group, setGroup] = useState(groups[0]?.value ?? '')
  const [occasion, setOccasion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const chosen = file.current?.files?.[0]
    if (chosen === undefined) {
      setError('Choose an SVG file first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/admin/shapes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          group,
          occasion: occasion === '' ? null : occasion,
          svg: await chosen.text(),
        }),
      })
      const result = (await response.json()) as ApiResult<{ id: string }>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      setName('')
      setOccasion('')
      if (file.current !== null) file.current.value = ''
      router.refresh()
    } catch {
      setError('The shape was not added. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-subhead text-primary">Add a shape</h2>
      <p className="text-body-sm text-secondary">
        A one-colour SVG outline. Its own colours are dropped: every shop draws it in theirs.
        Outline any text first. It starts as a draft.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="SVG file" htmlFor="shape-file" required>
          <input
            ref={file}
            id="shape-file"
            type="file"
            accept="image/svg+xml,.svg"
            required
            className="text-body-sm text-primary"
          />
        </Field>
        <Field label="Name" htmlFor="shape-name" required>
          <Input
            id="shape-name"
            value={name}
            maxLength={60}
            required
            placeholder="Crescent and star"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Group" htmlFor="shape-group" required>
          <Select id="shape-group" value={group} onChange={(event) => setGroup(event.target.value)}>
            {groups.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Occasion" htmlFor="shape-occasion" hint="For seasonal shapes. Shown all year.">
          <Select
            id="shape-occasion"
            value={occasion}
            onChange={(event) => setOccasion(event.target.value)}
          >
            <option value="">None</option>
            {occasions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim() === ''}>
            Add as draft
          </Button>
        </div>
      </form>
      {error === null ? null : <ErrorState title="Not added" body={error} />}
    </Card>
  )
}
