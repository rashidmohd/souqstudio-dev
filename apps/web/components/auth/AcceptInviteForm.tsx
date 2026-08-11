'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * E2-03 — join an organization from an invitation link.
 *
 * Deliberately close to SignupForm, because it is the same act from the other
 * side and the person doing it has never seen this product. What it does not
 * do is ask for an email address: the invitation names one, changing it would
 * make the token meaningless, and it is shown read-only so they can see which
 * of their addresses this is for.
 */

const MIN_PASSWORD_LENGTH = 10

type Errors = {
  name?: string | undefined
  password?: string | undefined
}

export function AcceptInviteForm({
  token,
  email,
  organizationName,
  inviterName,
  role,
}: {
  token: string
  email: string
  organizationName: string
  inviterName: string
  role: string
}) {
  const router = useRouter()
  const [values, setValues] = React.useState({ name: '', password: '' })
  const [errors, setErrors] = React.useState<Errors>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const refs = {
    name: React.useRef<HTMLInputElement>(null),
    password: React.useRef<HTMLInputElement>(null),
  }

  function set(field: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: validate({ ...values, [field]: value })[field] }))
    }
  }

  function validate(v = values): Errors {
    const found: Errors = {}
    if (!v.name.trim()) found.name = 'Enter your name.'
    if (!v.password) found.password = 'Choose a password.'
    else if (v.password.length < MIN_PASSWORD_LENGTH) {
      found.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    return found
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const found = validate()
    setErrors(found)
    const firstBad = (['name', 'password'] as const).find((f) => found[f])
    if (firstBad) {
      refs[firstBad].current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: values.name.trim(), password: values.password }),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        return
      }

      // Accepting signs them in, so there is nowhere to go but in. No
      // verification detour — following the link already proved the address.
      router.push('/')
      router.refresh()
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">
          Join {organizationName}
        </h1>
        <p className="font-ui text-body text-secondary">
          {inviterName} invited you as a {role}. Choose a password to get started.
        </p>
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

        {/* Read-only rather than omitted: the invitation is bound to this
            address, and someone with several needs to see which one they are
            about to sign in with. */}
        <Input
          size="lg"
          label="Email"
          name="email"
          type="email"
          value={email}
          readOnly
          disabled
          hint="Your invitation was sent to this address."
          onChange={() => undefined}
        />

        <Input
          size="lg"
          ref={refs.name}
          label="Your name"
          name="name"
          autoComplete="name"
          placeholder="Fatima Al Mansouri"
          required
          value={values.name}
          error={errors.name}
          onChange={(e) => set('name', e.target.value)}
          onBlur={() => setErrors((prev) => ({ ...prev, name: validate().name }))}
        />

        <Input
          size="lg"
          ref={refs.password}
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={values.password}
          error={errors.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={() => setErrors((prev) => ({ ...prev, password: validate().password }))}
        />

        <p className="font-ui text-body-sm text-muted">
          <span className="text-critical-fg">*</span> Required
        </p>

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Join {organizationName}
        </Button>
      </form>

      <p className="font-ui text-body-sm text-secondary">
        Already have an account?{' '}
        <Link href="/login" className="text-link underline-offset-2 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
