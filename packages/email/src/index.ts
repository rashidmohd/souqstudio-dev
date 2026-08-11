import { render } from '@react-email/render'

// Auth
export { WelcomeEmail } from './templates/auth/Welcome'
export { EmailVerificationEmail } from './templates/auth/EmailVerification'
export { PasswordResetEmail } from './templates/auth/PasswordReset'
export { UserInviteEmail } from './templates/auth/UserInvite'

// Billing
export { PaymentSucceededEmail } from './templates/billing/PaymentSucceeded'
export { PaymentFailedEmail } from './templates/billing/PaymentFailed'

// Analytics
export { WeeklyReportEmail } from './templates/analytics/WeeklyReport'

// Notifications
export { LowCreditsWarningEmail } from './templates/notifications/LowCreditsWarning'

// Re-export types
export type { WelcomeEmailProps } from './templates/auth/Welcome'
export type { EmailVerificationProps } from './templates/auth/EmailVerification'
export type { PasswordResetProps } from './templates/auth/PasswordReset'
export type { UserInviteProps } from './templates/auth/UserInvite'
export type { PaymentSucceededProps } from './templates/billing/PaymentSucceeded'
export type { PaymentFailedProps } from './templates/billing/PaymentFailed'
export type { WeeklyReportProps } from './templates/analytics/WeeklyReport'
export type { LowCreditsWarningProps } from './templates/notifications/LowCreditsWarning'

// Render helper
export { render }
