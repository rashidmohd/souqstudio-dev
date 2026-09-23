'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { UserRound } from 'lucide-react'
import { Button } from '@souqstudio/designer/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@souqstudio/designer/components/ui/input'
import { toast } from '@souqstudio/designer/components/ui/toast'

/**
 * Who you are, as distinct from how you sign in — the first card on
 * `/settings/account`, above `TwoFactorSettings`.
 *
 * **One editable field, and that is not an oversight.** `users` carries an
 * email, a name and a role, and only the name is the person's to set: the email
 * is the login identifier and the role is the organization's answer about them.
 * So the card is a name field and two statements of fact, rather than a form
 * with two thirds of its controls disabled for reasons a tooltip would have to
 * carry.
 *
 * **Email is rendered as a value, not a read-only field.** A field styled like
 * every other field, that silently refuses the caret, is worse than text that
 * never claimed to be editable — and the disabled treatment would owe a visible
 * reason under the design system's disabled rule. It is a labelled value with
 * the reason underneath it.
 *
 * **Save is secondary, not primary.** The screen already carries one blue
 * button — `Turn on two-factor`, for anyone who has not — and the rule is one
 * primary per screen region. Between naming yourself and securing the account,
 * the second is the one worth the weight.
 *
 * Success goes through `toast()` rather than the inline `Saved.` banner the
 * organization form uses. That banner was the compromise three screens shipped
 * while Toast had a signature and no mounting mechanism; `<Toaster />` now
 * mounts in the dashboard layout, so new work uses it. The form-level error
 * stays inline — it sits beside the control that failed and does not time out
 * while somebody is reading it.
 */
/** The route's `max(120)`, so the two cannot drift apart unnoticed. */
const MAX_NAME = 120

export function ProfileForm({
  name,
  email,
  role,
}: {
  name: string | null
  email: string
  role: string
}) {
  const router = useRouter()
  const [value, setValue] = React.useState(name ?? '')
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)

  /**
   * Mirrors the route's schema, so the answer is the same on both sides.
   *
   * Neither message names the limit. A bare numeral inside a sentence
   * visually reorders in an Arabic layout unless it is wrapped as a figure,
   * and a validation message is a plain string with nowhere to put the
   * wrapper — so the copy says what is wrong instead of counting.
   */
  function validate(candidate = value): string | undefined {
    const trimmed = candidate.trim()
    if (!trimmed) return 'Enter your name.'
    if (trimmed.length > MAX_NAME) return 'That name is too long.'
    return undefined
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const found = validate()
    setError(found)
    if (found) {
      field.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value.trim() }),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        return
      }

      toast({ message: 'Your name is saved.', tone: 'positive' })
      // The rail renders the avatar's initials from the session, and the
      // session is read by a server component — so the initials are stale
      // until this runs.
      router.refresh()
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <UserRound className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            {/* Not `Profile` — the page is already called that, and a card
                repeating its own page's title names nothing. */}
            <h2 className="font-display text-heading text-primary">Your details</h2>
            <p className="font-ui text-body-sm text-secondary">
              Your name is what teammates see beside the work you do.
            </p>
          </div>
        </div>

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
            ref={field}
            label="Your name"
            name="name"
            autoComplete="name"
            placeholder="Rashid Mohammed"
            required
            value={value}
            error={error}
            onChange={(event) => {
              setValue(event.target.value)
              if (error) setError(validate(event.target.value))
            }}
            onBlur={() => setError(validate())}
          />

          {/* Two facts, not two fields. See the note on this component. */}
          <div className="flex flex-col gap-1">
            <p className="font-ui text-label font-medium text-primary">Email address</p>
            <p className="font-ui text-body text-primary">{email}</p>
            <p className="font-ui text-body-sm text-muted">
              How you log in. Changing it needs a verification step that is not built yet.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="font-ui text-label font-medium text-primary">Your role</p>
            {/* Capitalized the way the team list does it, so one person's role
                is not spelled two ways in one product. */}
            <p className="font-ui text-body text-primary">
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </p>
            <p className="font-ui text-body-sm text-muted">
              Set by an owner of your organization, on the team screen.
            </p>
          </div>

          <p className="font-ui text-body-sm text-muted">
            <span className="text-critical-fg">*</span> Required
          </p>

          <div>
            <Button type="submit" variant="secondary" loading={submitting}>
              Save name
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}
