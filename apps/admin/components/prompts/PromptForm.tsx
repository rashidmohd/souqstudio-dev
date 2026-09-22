'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldLegend } from '@/components/ui/field'
import { Input, NumberInput, Select, Textarea } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'
import { GROUPS, PERSON, clothingWords, promptSchema } from '@/lib/prompt-schema'

/**
 * Write or tune one cover prompt. E13, AI prompt management.
 *
 * **The scene field is the whole screen and is sized like it.** Everything else
 * here is a label on a picker; this is the paragraph that reaches the image
 * model, and it is what somebody comes to this page to change after looking at
 * four covers that came back wrong.
 *
 * The clothing warning is live rather than a validation rule, because it cannot
 * be one: "apron" is a legitimate word in a scene about a butcher's apron on a
 * rail, and wrong in a scene that dresses the person. A writer decides, and the
 * warning is there so they decide on purpose.
 */

export type PromptFormValues = {
  slug: string
  label: string
  hint: string
  scene: string
  person: string
  group: string
  sortOrder: string
  isActive: boolean
}

export function PromptForm({
  initial,
  promptId,
}: {
  initial: PromptFormValues
  promptId?: string
}) {
  const router = useRouter()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<keyof PromptFormValues, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function set<K extends keyof PromptFormValues>(key: K, value: PromptFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    if (errors[key] !== undefined) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const clothing = clothingWords(values.scene)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailure(null)

    const parsed = promptSchema.safeParse({
      ...values,
      sortOrder: values.sortOrder.trim() === '' ? Number.NaN : Number(values.sortOrder),
    })

    if (!parsed.success) {
      const next: Partial<Record<keyof PromptFormValues, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && next[key as keyof PromptFormValues] === undefined) {
          next[key as keyof PromptFormValues] = issue.message
        }
      }
      setErrors(next)
      const first = Object.keys(next)[0]
      if (first !== undefined) document.getElementById(first)?.focus()
      return
    }

    setPending(true)
    try {
      const response = await fetch(
        promptId === undefined ? '/api/v1/admin/prompts' : `/api/v1/admin/prompts/${promptId}`,
        {
          method: promptId === undefined ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        }
      )
      const result = (await response.json()) as ApiResult<{ id: string }>
      if (result.error !== null) {
        setFailure(result.error.message)
        return
      }
      router.push('/prompts')
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
        <div className="flex flex-col gap-1">
          <h2 className="text-subhead text-primary">The scene</h2>
          <p className="text-body-sm text-secondary">
            A photograph of this shop: a place, a person doing something, and a light. Not
            an occasion and not an adjective.
          </p>
        </div>

        <Field label="Scene" htmlFor="scene" required error={errors.scene}>
          <Textarea
            id="scene"
            rows={8}
            value={values.scene}
            onChange={(event) => set('scene', event.target.value)}
            placeholder="In the fresh produce section, at the vegetable beds. The person is setting a crate of tomatoes down onto the display, looking up at the camera. Bright cool overhead light."
          />
        </Field>

        {clothing.length === 0 ? null : (
          <div className="rounded-block bg-sand p-3">
            <p className="text-body text-charcoal">
              This scene mentions {clothing.join(', ')}.
            </p>
            <p className="text-body-sm text-secondary">
              The uniform comes from the character reference for that shop. A scene that dresses
              the person fights it, which is how a back-to-school prompt once put a school
              bag on the assistant. Leave it out unless the clothing is on a rail rather
              than on somebody.
            </p>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-subhead text-primary">How the picker shows it</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Slug"
            htmlFor="slug"
            required
            error={errors.slug}
            hint={
              promptId === undefined
                ? 'Permanent. A generated cover records the slug it came from.'
                : 'Permanent, so this cannot change. Switch it off and add a new one instead.'
            }
          >
            <Input
              id="slug"
              value={values.slug}
              onChange={(event) => set('slug', event.target.value)}
              placeholder="produce-aisle"
              readOnly={promptId !== undefined}
              disabled={promptId !== undefined}
            />
          </Field>

          <Field label="Label" htmlFor="label" required error={errors.label}>
            <Input
              id="label"
              value={values.label}
              onChange={(event) => set('label', event.target.value)}
              placeholder="In the vegetable section"
            />
          </Field>

          <Field
            label="Hint"
            htmlFor="hint"
            error={errors.hint}
            hint="One line under the label, so two shelf scenes are tellable apart."
          >
            <Input
              id="hint"
              value={values.hint}
              onChange={(event) => set('hint', event.target.value)}
              placeholder="Setting out crates of fresh produce"
            />
          </Field>

          <Field
            label="Who it wants"
            htmlFor="person"
            error={errors.person}
            hint="Staff is the only one that uses the shop's character reference."
          >
            <Select
              id="person"
              value={values.person}
              onChange={(event) => set('person', event.target.value)}
            >
              {PERSON.map((option) => (
                <option key={option} value={option}>
                  {option === 'staff' ? 'Staff' : option === 'customer' ? 'A customer' : 'Nobody'}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Group" htmlFor="group" error={errors.group}>
            <Select
              id="group"
              value={values.group}
              onChange={(event) => set('group', event.target.value)}
            >
              {GROUPS.map((option) => (
                <option key={option} value={option}>
                  {option === 'everyday' ? 'Everyday' : option === 'season' ? 'Season' : 'Occasion'}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Sort order"
            htmlFor="sortOrder"
            error={errors.sortOrder}
            hint="Ascending. Ties break on the label."
          >
            <NumberInput
              id="sortOrder"
              value={values.sortOrder}
              onChange={(event) => set('sortOrder', event.target.value)}
              placeholder="100"
            />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
            className="size-icon rounded-chip border border-border-strong accent-olive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          />
          <label htmlFor="isActive" className="text-body text-primary">
            Offer this prompt in the picker
          </label>
        </div>
        <p className="text-body-sm text-muted">
          Switching a prompt off is how one is retired. It is never deleted: covers record
          the slug they came from, and a prompt that produced bad covers is worth keeping
          to compare against its replacement.
        </p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FieldLegend />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {promptId === undefined ? 'Add prompt' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  )
}
