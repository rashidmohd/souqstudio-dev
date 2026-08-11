import { Section, Img } from '@react-email/components'

export function Header() {
  return (
    <Section style={wrapper}>
      <div style={topBorder} />
      <Section style={logoSection}>
        {/* Raster, absolute URL — email clients do not reliably render SVG.
            Source: apps/web/public/brand/email/logo-dark.png (560x97, @2x).
            Upload to R2 at this path before sending anything. */}
        <Img
          src="https://assets.souqstudio.com/email/logo-dark.png"
          width={280}
          height={49}
          alt="SouqStudio"
        />
      </Section>
    </Section>
  )
}

const wrapper: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
}

const topBorder: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#323232',
}

const logoSection: React.CSSProperties = {
  padding: '24px 40px',
}
