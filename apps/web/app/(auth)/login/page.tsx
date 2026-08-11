import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'
import { canSignInWithGoogle } from '@/lib/oauth'

export const metadata: Metadata = { title: 'Log in · SouqStudio' }

/**
 * `next` is read server-side and passed down, which keeps useSearchParams (and
 * its Suspense boundary) out of the form.
 *
 * Only a path is accepted. An absolute URL here would be an open redirect —
 * a login page that forwards to any site an attacker names.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const requested = searchParams.next ?? ''
  const safeNext = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  return (
    <div className="w-full max-w-md">
      <LoginForm next={safeNext} showGoogle={canSignInWithGoogle()} />
    </div>
  )
}
