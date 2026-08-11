import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

export interface LowCreditsWarningProps {
  creditsRemaining: number
  topUpUrl: string
}

export function LowCreditsWarningEmail({ creditsRemaining, topUpUrl }: LowCreditsWarningProps) {
  return (
    <Base preview={`${creditsRemaining} AI credits remaining`}>
      <Section style={section}>
        <Heading style={heading}>AI credits running low</Heading>
        <Text style={body}>
          You have <strong>{creditsRemaining} credits</strong> remaining this month. Top up to keep generating characters and covers.
        </Text>
        <Button href={topUpUrl}>Top up credits</Button>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 16px', fontWeight: '600' }
const body: React.CSSProperties = { fontSize: '14px', color: '#55534D', lineHeight: '22px', margin: '0 0 24px' }

export default LowCreditsWarningEmail
