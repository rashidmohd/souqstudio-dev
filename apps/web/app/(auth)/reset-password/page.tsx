import type { Metadata } from 'next'
import { pendingIdentifier } from '@/lib/verification'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export const metadata: Metadata = { title: 'Choose a new password · SouqStudio' }

export default async function ResetPasswordPage() {
  // Null when no code is outstanding — including when the address had no
  // account. The screen renders the same either way, so this page reveals no
  // more than the endpoint does.
  const sentTo = await pendingIdentifier('password_reset')

  return (
    <div className="w-full max-w-md">
      <ResetPasswordForm sentTo={sentTo} />
    </div>
  )
}
