// Next 14 does not support next.config.ts — that landed in Next 15.
// Types come from the JSDoc annotation instead.

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required for Fabric.js and other canvas libs
    serverComponentsExternalPackages: ['fabric', 'canvas'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.souqstudio.com' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
}

export default nextConfig
