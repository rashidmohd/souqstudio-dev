import type { Metadata } from 'next'
import Link from 'next/link'
import { findInviteByToken, inviteStatus } from '@/lib/invites'
import { AcceptInviteForm } from '@/components/auth/AcceptInviteForm'

export const metadata: Metadata = { title: 'Join your team · SouqStudio' }

/**
 * E2-03 — the accept screen.
 *
 * Layout family 4: centred single column, no navigation, one decision. The
 * person here has no session and no account, which is also why `/invite/` is in
 * middleware's public list.
 *
 * The invitation is read on the server rather than fetched by the client, so
 * the screen arrives already knowing whether the link is good. A form that
 * renders and then tells you it was never valid is worse than a page that says
 * so immediately.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: { token: string }
}) {
  const invite = await findInviteByToken(params.token)
  const status = invite ? inviteStatus(invite) : null

  if (!invite || status !== 'pending') {
    // One screen for every unusable state, with copy that differs — the reason
    // matters to the reader, and each has a different next step.
    const { title, body } =
      status === 'accepted'
        ? {
            title: 'This invitation has been used',
            body: 'Someone has already joined with this link. Log in with your email and password.',
          }
        : status === 'expired'
          ? {
              title: 'This invitation has expired',
              body: 'Invitations last 48 hours. Ask whoever invited you to send a new one.',
            }
          : status === 'revoked'
            ? {
                title: 'This invitation was withdrawn',
                body: 'Ask whoever invited you if you should still have access.',
              }
            : {
                title: 'This link is not valid',
                body: 'Check that you copied the whole link from your email, or ask for a new invitation.',
              }

    return (
      <div className="flex w-full max-w-md flex-col gap-4 rounded-card border-hairline border-border-subtle bg-surface p-6">
        <h1 className="font-display text-title text-primary">{title}</h1>
        <p className="font-ui text-body text-secondary">{body}</p>
        <Link href="/login" className="font-ui text-body text-link underline-offset-2 hover:underline">
          Go to log in
        </Link>
      </div>
    )
  }

  return (
    <AcceptInviteForm
      token={params.token}
      email={invite.email}
      organizationName={invite.organization.name}
      inviterName={invite.invitedBy.name ?? invite.invitedBy.email}
      role={invite.role}
    />
  )
}
