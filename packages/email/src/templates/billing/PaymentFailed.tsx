import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

export interface PaymentFailedProps {
  organizationName: string
  amount: string
  updateUrl: string
  gracePeriodDays: number
}

export function PaymentFailedEmail({ organizationName, amount, updateUrl, gracePeriodDays }: PaymentFailedProps) {
  return (
    <Base preview={`Action required: payment of ${amount} failed`}>
      <Section style={section}>
        <Section style={alertBanner}>
          <Text style={alertText}>Payment failed</Text>
        </Section>
        <Heading style={heading}>We couldn't process your payment</Heading>
        <Text style={body}>
          A payment of <strong>{amount}</strong> for {organizationName} failed. Update your payment method within {gracePeriodDays} days to keep your account active.
        </Text>
        <Button href={updateUrl}>Update payment method</Button>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const alertBanner: React.CSSProperties = { backgroundColor: '#FDECEA', borderRadius: '6px', padding: '12px 16px', marginBottom: '24px' }
const alertText: React.CSSProperties = { color: '#B3261E', fontSize: '13px', fontWeight: '500', margin: 0 }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 16px', fontWeight: '600' }
const body: React.CSSProperties = { fontSize: '14px', color: '#55534D', lineHeight: '22px', margin: '0 0 24px' }

export default PaymentFailedEmail
