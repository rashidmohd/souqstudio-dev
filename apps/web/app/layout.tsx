import type { Metadata } from 'next'
import { fontVariables } from '@/lib/fonts'
import '@/styles/globals.css'

export const viewport = {
  // Emitted as <meta name="theme-color">, which the browser reads to tint its
  // own chrome before any stylesheet is parsed — a CSS variable cannot resolve
  // there. The literal must track --sq-blue by hand.
  // eslint-disable-next-line no-restricted-syntax
  themeColor: '#143CD2',   // --sq-blue
}

export const metadata: Metadata = {
  title: 'SouqStudio',
  description: 'Create branded offer books in minutes.',
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon.ico', sizes: '48x48' },
    ],
    apple: '/brand/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    siteName: 'SouqStudio',
    images: ['/brand/og-default.png'],
  },
}

/**
 * `lang` and `dir` are set here from the user's interface language.
 *
 * Two things this must NOT do:
 *  - `dir` is scoped, never applied globally to canvas content. The artboard
 *    follows the offer book's own language, not the interface language. An
 *    owner working in an Arabic UI producing an English flyer must get an
 *    English flyer. See the design skill, Bilingual and RTL.
 *  - Fabric.js canvas coordinates stay LTR always, regardless of this value.
 *
 * TODO: read locale from the session rather than hardcoding.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const lang = 'en'
  const dir = lang === 'en' ? 'ltr' : 'rtl'

  return (
    <html lang={lang} dir={dir} className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
