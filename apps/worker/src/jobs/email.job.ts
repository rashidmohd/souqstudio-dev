import type { Job } from 'bullmq'
import { Resend } from 'resend'
import { prisma } from '@souqstudio/db'
import type { EmailJobPayload } from '@souqstudio/db'
import {
  render,
  WelcomeEmail,
  EmailVerificationEmail,
  PasswordResetEmail,
  UserInviteEmail,
  PaymentSucceededEmail,
  PaymentFailedEmail,
  WeeklyReportEmail,
  LowCreditsWarningEmail,
} from '@souqstudio/email'
import { env } from '../lib/env'

/**
 * Renders a React Email template and sends it through Resend.
 *
 * Every email in the product goes through this one path — nothing sends inline
 * from an API route, so a slow provider can never slow a request.
 */

const resend = new Resend(env.RESEND_API_KEY)

/**
 * Template name to component and subject.
 *
 * Subjects live here rather than inside the templates because the subject and
 * the preview text must differ — the inbox shows both, and repeating one is a
 * wasted line. Sentence case, under 60 characters.
 *
 * `props` arrives as JSON from the queue, so it is typed loosely and each
 * component is trusted to read what it needs. The typed enqueue helpers in
 * queue-client.ts are where shape is enforced.
 */
type Renderable = (props: never) => React.ReactElement

const TEMPLATES: Partial<
  Record<string, { component: Renderable; subject: (props: Record<string, unknown>) => string }>
> = {
  'email-verification': {
    component: EmailVerificationEmail as Renderable,
    subject: (p) => `${String(p.code)} is your verification code`,
  },
  'password-reset': {
    component: PasswordResetEmail as Renderable,
    subject: (p) => `${String(p.code)} is your password reset code`,
  },
  welcome: {
    component: WelcomeEmail as Renderable,
    subject: () => 'Welcome to SouqStudio',
  },
  'user-invite': {
    component: UserInviteEmail as Renderable,
    subject: () => 'You have been invited to SouqStudio',
  },
  'payment-succeeded': {
    component: PaymentSucceededEmail as Renderable,
    subject: () => 'Payment received',
  },
  'payment-failed': {
    component: PaymentFailedEmail as Renderable,
    subject: () => 'Payment failed',
  },
  'weekly-report': {
    component: WeeklyReportEmail as Renderable,
    subject: () => 'Your week on SouqStudio',
  },
  'low-credits-warning': {
    component: LowCreditsWarningEmail as Renderable,
    subject: () => 'You are running low on AI credits',
  },
}

/**
 * `skipped` means the job finished without sending. BullMQ marks a non-throwing
 * job as completed either way, so the outcome is returned rather than inferred —
 * logging "Sent" for an unknown template would be a lie in the one place an
 * operator goes to find out what happened.
 */
export type EmailJobResult = 'sent' | 'skipped'

export async function handleEmailJob(job: Job<EmailJobPayload>): Promise<EmailJobResult> {
  const { template, to, props } = job.data

  const entry = TEMPLATES[template]
  if (!entry) {
    // An unknown template is a coding error, not a transient fault. Record it
    // and return rather than throw — retrying cannot make it succeed, and three
    // more attempts only delays the queue.
    await logFailure(job, template, to, `Unknown template "${template}"`)
    return 'skipped'
  }

  const html = await render(entry.component(props as never))

  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: entry.subject(props),
    html,
  })

  if (result.error) {
    // Thrown so BullMQ retries with backoff — provider errors are usually
    // transient (rate limit, upstream blip).
    await logFailure(job, template, to, result.error.message)
    throw new Error(`Resend rejected the message: ${result.error.message}`)
  }

  await prisma.notificationLog.create({
    data: {
      template,
      recipient: to,
      status: 'sent',
      providerId: result.data?.id ?? null,
      attempts: job.attemptsMade + 1,
      sentAt: new Date(),
    },
  })

  return 'sent'
}

async function logFailure(
  job: Job<EmailJobPayload>,
  template: string,
  to: string,
  error: string
): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      template,
      recipient: to,
      status: 'failed',
      error,
      attempts: job.attemptsMade + 1,
    },
  })
}
