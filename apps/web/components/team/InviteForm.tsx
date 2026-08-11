'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { Role } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

/**
 * E2-03 — invite a teammate.
 *
 * The role list comes from the server, already filtered by what the person
 * inviting is allowed to hand out. Rendering all four and letting the API
 * refuse would show a manager an "Owner" option that can never work.
 */

const ROLE_DESCRIPTION: Record<string, string> = {
  manager: 'Runs the shops you give them, and can invite editors.',
  editor: 'Creates and edits offer books. Cannot change the brand.',
  viewer: 'Can look at offer books and analytics. Cannot change anything.',
}

export function InviteForm({
  assignableRoles,
  shops,
  onDone,
  onCancel,
}: {
  assignableRoles: Role[]
  shops: Array<{ id: string; name: string }>
  onDone?: (() => void) | undefined
  onCancel?: (() => void) | undefined
}) {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<string>(assignableRoles[0] ?? 'viewer')
  const [shopIds, setShopIds] = React.useState<string[]>([])
  const [emailError, setEmailError] = React.useState<string | undefined>(undefined)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const emailRef = React.useRef<HTMLInputElement>(null)

  function validateEmail(value = email): string | undefined {
    if (!value.trim()) return 'Enter their email address.'
    if (!value.includes('@')) return 'That does not look like an email address.'
    return undefined
  }

  function toggleShop(id: string) {
    setShopIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const bad = validateEmail()
    setEmailError(bad)
    if (bad) {
      emailRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role, shopIds }),
      })
      const result = await res.json()

      if (result.error) {
        setFormError(result.error.message)
        if (result.error.code === 'already_member' || result.error.code === 'email_in_use') {
          emailRef.current?.focus()
        }
        return
      }

      // The row is written even when the email could not be queued, so say so
      // rather than claiming a send that did not happen.
      if (result.data?.sent === false) {
        setFormError(
          'They were added, but the invitation email could not be sent. Use Resend in a moment.'
        )
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
        ref={emailRef}
        label="Email address"
        name="email"
        type="email"
        placeholder="fatima@almadina.ae"
        required
        value={email}
        error={emailError}
        onChange={(e) => {
          setEmail(e.target.value)
          if (emailError) setEmailError(validateEmail(e.target.value))
        }}
        onBlur={() => setEmailError(validateEmail())}
      />

      <Select
        label="Role"
        name="role"
        required
        value={role}
        onChange={(e) => setRole(e.target.value)}
        hint={ROLE_DESCRIPTION[role]}
        options={assignableRoles.map((r) => ({
          value: r,
          // Sentence case everywhere. Title Case is for proper names only.
          label: r.charAt(0).toUpperCase() + r.slice(1),
        }))}
      />

      {shops.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="font-ui text-label font-medium text-primary">
            Which shops
          </legend>
          <p className="font-ui text-body-sm text-muted">
            They can only reach the shops you tick. You can change this later.
          </p>
          {/* Checkboxes are inline rather than a component: there is no checkbox
              in the component inventory, and adding one is an amendment to
              raise rather than a decision to make mid-screen. */}
          {shops.map((shop) => (
            <label key={shop.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 rounded-chip border-hairline border-border-strong"
                checked={shopIds.includes(shop.id)}
                onChange={() => toggleShop(shop.id)}
              />
              <span className="font-ui text-body text-primary">{shop.name}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <p className="font-ui text-body-sm text-muted">
        <span className="text-critical-fg">*</span> Required
      </p>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" loading={submitting}>
          Send invitation
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
