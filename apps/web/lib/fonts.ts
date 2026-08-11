import { IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * Chrome typefaces. These are SouqStudio's own fonts for the application
 * interface — not the shop owner's brand kit fonts, which are a separate
 * system (see the souqstudio-design skill, references/brand-kit-fonts.md).
 *
 * next/font downloads and self-hosts these at build time. There is no
 * render-time request to fonts.googleapis.com.
 *
 * Weights are limited to what the type scale actually uses. Do not add more
 * without a corresponding entry in the scale — every weight is bytes on a
 * mid-range Android over a poor connection.
 *
 * No italic axis is loaded, deliberately. The design system forbids italics:
 * Plex Sans Arabic has no true italic, and mixed-script screens must not
 * emphasise differently by language. Emphasis is weight.
 */

// Display and title only. Never interface text — no Arabic coverage, and
// letterspacing is tight below ~24px.
//
// Self-hosted rather than pulled through next/font/google: Host Grotesk was
// added to Google Fonts after Next 14's font manifest was frozen, so
// `Host_Grotesk` does not exist in next/font/google on this major. The file is
// the latin subset of the variable face, axis-clipped to 500–600 — the only
// two weights the type scale uses. Re-download from Google Fonts if the scale
// ever needs a weight outside that range.
export const hostGrotesk = localFont({
  src: '../public/fonts/host-grotesk-latin-var.woff2',
  weight: '500 600', // title Medium, display SemiBold
  style: 'normal',
  variable: '--font-display',
  display: 'swap',
})

// Every interface surface. Carries both scripts.
export const plexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['latin', 'arabic'],
  weight: ['400', '500', '600'], // body, label, heading/subhead
  variable: '--font-ui',
  display: 'swap',
})

// Every figure in the chrome — prices, counts, percentages, dates.
export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'], // data/eyebrow, data-lg
  variable: '--font-figure',
  display: 'swap',
})

/** Apply to <html>. Exposes all three as CSS variables. */
export const fontVariables = [
  hostGrotesk.variable,
  plexSansArabic.variable,
  plexMono.variable,
].join(' ')
