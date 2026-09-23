'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLegend } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'

export type StartOption = { value: string; label: string }

/**
 * Start a library draft. E13-04.
 *
 * **One choice of where to start, not a blank canvas.** The same rule the shop
 * app's "new block" follows: an empty artboard produces something worse than a
 * copy of one that works. So the choice is either the smallest block of a kind,
 * or a copy of a library block, and the designer opens on it.
 *
 * The option value carries which of the two it is (`kind:` or `block:`), so the
 * form sends the shape the route expects without a second control.
 */
export function NewBlockForm({
  kinds,
  blocks,
}: {
  kinds: readonly StartOption[]
  blocks: readonly StartOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [start, setStart] = useState(kinds[0]?.value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const [type, value] = start.split(':', 2)
      const response = await fetch('/api/v1/admin/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          type === 'block' ? { name: name.trim(), fromId: value } : { name: name.trim(), kind: value }
        ),
      })
      const result = (await response.json()) as ApiResult<{ id: string }>
      if (result.error !== null) {
        setError(result.error.message)
        return
      }
      router.push(`/blocks/${result.data.id}/edit`)
    } catch {
      setError('The draft was not created. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex max-w-full flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <FieldLegend />

        <Field
          label="Name"
          htmlFor="block-name"
          required
          hint="What the team will call it. The library name and id are set when you publish."
        >
          <Input
            id="block-name"
            value={name}
            maxLength={80}
            required
            onChange={(event) => setName(event.target.value)}
            placeholder="Ramadan offer band"
          />
        </Field>

        <Field label="Start from" htmlFor="block-start" required>
          <Select id="block-start" value={start} onChange={(event) => setStart(event.target.value)}>
            <optgroup label="An empty block of a kind">
              {kinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
            {blocks.length === 0 ? null : (
              <optgroup label="A copy of a library block">
                {blocks.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>

        {error === null ? null : <ErrorState title="That did not work" body={error} />}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={name.trim() === ''}>
            Create and open designer
          </Button>
        </div>
      </form>
    </Card>
  )
}
