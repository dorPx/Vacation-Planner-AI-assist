const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone/server.js) for the
  // Docker runner stage. outputFileTracingRoot is pinned to this dir so Next's
  // lockfile-based root detection doesn't latch onto the monorepo root and
  // nest server.js where the Dockerfile's COPY/CMD don't expect it.
  // NOTE: on Next 14.x this key lives under `experimental` (top-level only
  // from Next 15) — top-level here is silently ignored with a config warning.
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.booking.com' },
      { protocol: 'https', hostname: '**.bstatic.com' },
    ],
  },
};

module.exports = nextConfig;
