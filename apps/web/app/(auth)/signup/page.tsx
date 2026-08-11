import type { Metadata } from 'next'
import { SignupForm } from '@/components/auth/SignupForm'
import { canSignInWithGoogle } from '@/lib/oauth'

export const metadata: Metadata = { title: 'Create your account · SouqStudio' }

export default function SignupPage() {
  return (
    <div className="w-full max-w-md">
      <SignupForm showGoogle={canSignInWithGoogle()} />
    </div>
  )
}
