// Next 14 does not support next.config.ts — that landed in Next 15.
// Types come from the JSDoc annotation instead.

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shipped as TypeScript source with 'use client' modules, like the other
  // workspace packages, but this one carries JSX and CSS classes.
  transpilePackages: ['@souqstudio/designer'],
  experimental: {
    // Required for Fabric.js and other canvas libs.
    //
    // **`sharp` is here because it is a native addon**, and bundling one into
    // a route handler produces a module that resolves at build time and throws
    // at request time — which Next renders as an HTML error page, so the
    // client's `response.json()` fails with "Unexpected token '<'" and the
    // real error never reaches anyone. Every route that reads an uploaded
    // image imports it through `lib/catalog-image.ts` and `lib/logo.ts`.
    serverComponentsExternalPackages: ['fabric', 'canvas', 'sharp'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'assets.souqstudio.com' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
}

export default nextConfig
