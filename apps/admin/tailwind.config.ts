import base from '@souqstudio/config/tailwind.config'
import type { Config } from 'tailwindcss'

export default {
  ...base,
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
    // The shared designer. Without it every class the editor uses generates
    // no CSS, silently.
    '../../packages/designer/{components,lib,stores}/**/*.{ts,tsx}',
  ],
} satisfies Config
