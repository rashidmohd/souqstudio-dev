import { Section, Heading, Text } from '@react-email/components'
import { Base } from '../../layouts/Base'
import { Button } from '../../components/primitives/Button'

export interface PaymentSucceededProps {
  organizationName: string
  amount: string
  invoiceUrl: string
  period: string
}

export function PaymentSucceededEmail({ organizationName, amount, invoiceUrl, period }: PaymentSucceededProps) {
  return (
    <Base preview={`Payment confirmed — ${amount}`}>
      <Section style={section}>
        <Heading style={heading}>Payment confirmed</Heading>
        <Text style={body}>
          We received a payment of <strong>{amount}</strong> for {organizationName} ({period}).
        </Text>
        <Button href={invoiceUrl}>Download invoice</Button>
      </Section>
    </Base>
  )
}

const section: React.CSSProperties = { padding: '32px 40px' }
const heading: React.CSSProperties = { fontSize: '24px', color: '#323232', margin: '0 0 16px', fontWeight: '600' }
const body: React.CSSProperties = { fontSize: '14px', color: '#55534D', lineHeight: '22px', margin: '0 0 24px' }

export default PaymentSucceededEmail
