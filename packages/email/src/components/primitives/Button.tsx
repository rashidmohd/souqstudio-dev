import { Button as EmailButton } from '@react-email/components'

interface ButtonProps {
  href: string
  children: React.ReactNode
}

export function Button({ href, children }: ButtonProps) {
  return (
    <EmailButton href={href} style={button}>
      {children}
    </EmailButton>
  )
}

// --sq-blue. Literal because CSS variables do not resolve in email clients;
// keep it in step with --sq-ui-action-primary-bg in souqstudio-tokens.css.
const button: React.CSSProperties = {
  backgroundColor: '#143CD2',
  color: '#FFFFFF',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '500',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
