import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

export interface WelcomeEmailProps {
  shopOwnerName: string
  dashboardUrl: string
}

export function WelcomeEmail({ shopOwnerName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <Base preview={`Welcome to SouqStudio, ${shopOwnerName}`}>
      <Section style={section}>
        <Heading style={heading}>Welcome, {shopOwnerName}</Heading>
        <Text style={body}>
          Your account is ready. Set up your brand and create your first offer book in under 30 minutes.
        </Text>
        <Button href={dashboardUrl}>Set up your brand</Button>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 16px', fontWeight: '600' }
const body: React.CSSProperties = { fontSize: '14px', color: '#55534D', lineHeight: '22px', margin: '0 0 24px' }

export default WelcomeEmail
