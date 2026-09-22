'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ApiResult } from '@souqstudio/types'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ErrorState } from '@/components/ui/states'

/**
 * Staff sign-in. E13-01.
 *
 * Submit is never disabled to enforce validation, and everything typed survives
 * a rejection. souqstudio-design → Forms.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = (await response.json()) as ApiResult<unknown>

      if (result.error !== null) {
        setError(result.error.message)
        // The address is kept and the password is not, which is what somebody
        // who mistyped one of the two actually wants.
        setPassword('')
        return
      }

      router.replace(next)
      router.refresh()
    } catch {
      setError('The server did not answer. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error === null ? null : <ErrorState title="Not signed in" body={error} />}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@souqstudio.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" variant="primary" loading={pending}>
        Sign in
      </Button>
    </form>
  )
}
