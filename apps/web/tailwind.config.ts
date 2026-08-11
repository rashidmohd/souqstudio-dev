import base from '@souqstudio/config/tailwind.config'
import type { Config } from 'tailwindcss'

export default {
  ...base,
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
  ],
} satisfies Config
