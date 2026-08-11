import { Section, Text, Link, Hr } from '@react-email/components'

interface FooterProps {
  showUnsubscribe?: boolean
  unsubscribeUrl?: string
}

export function Footer({ showUnsubscribe = false, unsubscribeUrl }: FooterProps) {
  return (
    <Section style={wrapper}>
      <Hr style={divider} />
      <Text style={address}>
        SouqStudio · Dubai, UAE
      </Text>
      <Text style={links}>
        <Link href="https://souqstudio.com/privacy" style={link}>Privacy Policy</Link>
        {showUnsubscribe && unsubscribeUrl && (
          <>
            {' · '}
            <Link href={unsubscribeUrl} style={link}>Unsubscribe</Link>
          </>
        )}
      </Text>
      <Text style={copyright}>© {new Date().getFullYear()} SouqStudio. All rights reserved.</Text>
    </Section>
  )
}

const wrapper: React.CSSProperties = {
  padding: '24px 40px 32px',
  backgroundColor: '#F8F7F3',
}

const divider: React.CSSProperties = {
  borderColor: 'rgba(50,50,50,0.14)',
  margin: '0 0 24px',
}

const address: React.CSSProperties = {
  fontSize: '12px',
  color: '#6E6C64',
  margin: '0 0 4px',
  textAlign: 'center',
}

const links: React.CSSProperties = {
  fontSize: '12px',
  color: '#6E6C64',
  margin: '0 0 4px',
  textAlign: 'center',
}

const link: React.CSSProperties = {
  color: '#143CD2',
  textDecoration: 'none',
}

const copyright: React.CSSProperties = {
  fontSize: '11px',
  color: '#A9A79C',
  margin: 0,
  textAlign: 'center',
}
