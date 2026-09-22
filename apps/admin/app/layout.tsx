import type { Metadata } from 'next'
import { fontVariables } from '@/lib/fonts'
import '@/styles/globals.css'

/**
 * The root layout. Document, fonts, and nothing else.
 *
 * **The rail is not here**, it is in `app/(panel)/layout.tsx`. The login screen
 * has to render without it, and a root layout cannot know which route it is
 * wrapping. The route group also keeps the URLs unchanged: `(panel)/catalog`
 * still serves `/catalog`, which is the path `apps/admin/CLAUDE.md` documents.
 *
 * `lang="en"` and no direction switch. The shop owner product ships in English
 * and Arabic; this is an internal tool for the SouqStudio team and has one
 * language. Logical properties are still used throughout, because the
 * components are lint-checked for them and because an app that has to be
 * translated later should not need a rewrite to do it.
 */
export const metadata: Metadata = {
  title: 'SouqStudio admin',
  description: 'Internal platform tools.',
  // Nothing here should ever appear in a search result.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="min-h-screen bg-page text-primary antialiased">{children}</body>
    </html>
  )
}
