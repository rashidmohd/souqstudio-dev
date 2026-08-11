import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'

export interface PasswordResetProps {
  /** Six digits. Passed as a string so leading zeros survive. */
  code: string
  expiresInMinutes: number
}

export function PasswordResetEmail({ code, expiresInMinutes }: PasswordResetProps) {
  return (
    <Base preview={`${code} is your SouqStudio password reset code`}>
      <Section style={section}>
        <Heading style={heading}>Reset your password</Heading>
        <Text style={body}>Enter this code in SouqStudio to choose a new password.</Text>
        <Text style={codeStyle}>{code}</Text>
        <Text style={body}>
          This code expires in {expiresInMinutes} minutes and can be used once.
        </Text>
        <Text style={small}>
          If you didn&apos;t ask to reset your password, you can ignore this email. Your
          password has not changed.
        </Text>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 16px', fontWeight: '600' }
const body: React.CSSProperties = { fontSize: '14px', color: '#55534D', lineHeight: '22px', margin: '0 0 24px' }
const codeStyle: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: '600',
  letterSpacing: '8px',
  color: '#323232',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  margin: '0 0 24px',
}
const small: React.CSSProperties = { fontSize: '12px', color: '#A9A79C', margin: '16px 0 0' }

export default PasswordResetEmail
