import { Html, Head, Body, Container, Preview } from '@react-email/components'
import { Header } from '../components/blocks/Header'
import { Footer } from '../components/blocks/Footer'

interface BaseProps {
  preview: string
  children: React.ReactNode
}

export function Base({ preview, children }: BaseProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Header />
          {children}
          <Footer />
        </Container>
      </Body>
    </Html>
  )
}

const body: React.CSSProperties = {
  backgroundColor: '#F8F7F3',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  margin: 0,
  padding: '40px 0',
}

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#FFFFFF',
  borderRadius: '8px',
  overflow: 'hidden',
}
