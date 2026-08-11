import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

export interface UserInviteProps {
  inviterName: string
  organizationName: string
  role: string
  acceptUrl: string
  expiresInHours: number
}

export function UserInviteEmail({ inviterName, organizationName, role, acceptUrl, expiresInHours }: UserInviteProps) {
  return (
    <Base preview={`${inviterName} invited you to join ${organizationName} on SouqStudio`}>
      <Section style={section}>
        <Heading style={heading}>You've been invited</Heading>
        <Text style={body}>
          {inviterName} invited you to join <strong>{organizationName}</strong> on SouqStudio as a <strong>{role}</strong>.
        </Text>
        <Button href={acceptUrl}>Accept invitation</Button>
        <Text style={small}>This invitation expires in {expiresInHours} hours.</Text>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 16px', fontWeight: '600' }
const body: React.CSSProperties = { fontSize: '14px', color: '#55534D', lineHeight: '22px', margin: '0 0 24px' }
const small: React.CSSProperties = { fontSize: '12px', color: '#A9A79C', margin: '16px 0 0' }

export default UserInviteEmail
