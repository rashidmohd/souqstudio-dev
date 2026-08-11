'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GoogleButton, AuthDivider } from '@/components/auth/GoogleButton'

/**
 * E1-01 signup. Creates the organization, its first shop and the owner in one
 * request, then goes straight to brand setup.
 *
 * Four fields, because every extra one costs signups and nothing here can be
 * collected later without blocking the flow.
 */

const MIN_PASSWORD_LENGTH = 10

// `| undefined` is explicit for exactOptionalPropertyTypes — clearing a field's
// error means assigning undefined, not omitting the key.
type Errors = {
  name?: string | undefined
  shopName?: string | undefined
  email?: string | undefined
  password?: string | undefined
}

export function SignupForm({ showGoogle }: { showGoogle: boolean }) {
  const router = useRouter()
  const [values, setValues] = React.useState({ name: '', shopName: '', email: '', password: '' })
  const [errors, setErrors] = React.useState<Errors>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const refs = {
    name: React.useRef<HTMLInputElement>(null),
    shopName: React.useRef<HTMLInputElement>(null),
    email: React.useRef<HTMLInputElement>(null),
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
    if (!v.shopName.trim()) found.shopName = 'Enter your shop name.'
    if (!v.email.trim()) found.email = 'Enter your email address.'
    else if (!v.email.includes('@')) found.email = 'That does not look like an email address.'
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
    const firstBad = (['name', 'shopName', 'email', 'password'] as const).find((f) => found[f])
    if (firstBad) {
      refs[firstBad].current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        if (result.error.code === 'email_taken') refs.email.current?.focus()
        return
      }

      // Signup signs them in, then verification comes before brand setup.
      // Verifying first means we never end up with a fully configured shop
      // behind an address that cannot receive mail — and the code is already
      // in their inbox at the moment they are most likely to be looking.
      // The verify screen sends them on to /onboarding.
      router.push('/verify-email')
      router.refresh()
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-card border-hairline border-border-subtle bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title text-primary">Create your account</h1>
        <p className="font-ui text-body text-secondary">
          Build your first offer book in minutes. No card needed.
        </p>
      </div>

      {showGoogle ? (
        <div className="flex flex-col gap-4">
          <GoogleButton label="Sign up with Google" />
          <AuthDivider />
        </div>
      ) : null}

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
          ref={refs.shopName}
          label="Shop name"
          name="shopName"
          autoComplete="organization"
          placeholder="Al Manara Supermarket"
          hint="This is the name shoppers will see on your offer books."
          required
          value={values.shopName}
          error={errors.shopName}
          onChange={(e) => set('shopName', e.target.value)}
          onBlur={() => setErrors((prev) => ({ ...prev, shopName: validate().shopName }))}
        />

        <Input
          size="lg"
          ref={refs.email}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="owner@yourshop.ae"
          required
          value={values.email}
          error={errors.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => setErrors((prev) => ({ ...prev, email: validate().email }))}
        />

        <Input
          size="lg"
          ref={refs.password}
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          required
          value={values.password}
          error={errors.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={() => setErrors((prev) => ({ ...prev, password: validate().password }))}
        />

        {/* The legend the asterisks refer to. An asterisk with no key means
            nothing to a screen reader user, or to someone reading in their
            third language. */}
        <p className="font-ui text-body-sm text-muted">
          <span className="text-critical-fg">*</span> Required
        </p>

        <Button type="submit" variant="primary" size="lg" loading={submitting}>
          Create account
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
