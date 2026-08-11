import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { pendingIdentifier, retryAfterSeconds } from '@/lib/verification'
import { VerifyEmailForm } from '@/components/auth/VerifyEmailForm'

export const metadata: Metadata = { title: 'Verify your email · SouqStudio' }

export default async function VerifyEmailPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  // Nothing to do here once verified — this page is a dead end otherwise.
  if (session.user.emailVerifiedAt) redirect('/')

  // Null when nothing is outstanding *in this browser* — which is the normal
  // case after logging in on a new device, since the paired token lives in a
  // cookie. The screen must not claim to have sent a code it did not send.
  const sentTo = await pendingIdentifier('email_verification')

  // Read on the server so a refresh cannot reset the countdown to zero and
  // offer a button the endpoint would immediately refuse.
  const wait = await retryAfterSeconds(session.user.email, 'email_verification')

  return (
    <div className="w-full max-w-md">
      <VerifyEmailForm
        sentTo={sentTo}
        accountEmail={session.user.email}
        initialRetryAfterSeconds={wait}
      />
    </div>
  )
}
