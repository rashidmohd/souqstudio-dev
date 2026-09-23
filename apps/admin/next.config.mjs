// Next 14 does not support next.config.ts — that landed in Next 15.
// Types come from the JSDoc annotation instead.

/**
 * The host catalog images are served from is **derived from `R2_PUBLIC_URL`**,
 * not listed.
 *
 * A hardcoded list is a second place the bucket's public host is written down,
 * and the two drift: this file said `assets.souqstudio.com` while the dev
 * bucket has always been served from `blocks-dev.souqstudio.com`, so every
 * product photo in the panel rendered as a broken image. The variable is the
 * only thing that knows, so the variable is what this reads.
 *
 * The fallbacks stay for a build with no environment — `next build` runs with
 * `SKIP_ENV_VALIDATION=1` and Railway injects variables at deploy rather than
 * at build, so this must not throw when the value is absent.
 */
function imageHosts() {
  const hosts = new Set(['assets.souqstudio.com'])

  const configured = process.env.R2_PUBLIC_URL
  if (configured !== undefined && configured !== '') {
    try {
      hosts.add(new URL(configured).hostname)
    } catch {
      // A malformed URL is the env module's problem to report at boot, not a
      // reason to fail the build.
    }
  }

  return [...hosts].map((hostname) => ({ protocol: 'https', hostname }))
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shipped as TypeScript source with 'use client' modules, like the other
  // workspace packages, but this one carries JSX and CSS classes.
  transpilePackages: ['@souqstudio/designer'],
  images: {
    remotePatterns: [
      ...imageHosts(),
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
}

export default nextConfig
