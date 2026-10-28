import type { NextConfig } from 'next';

// DEMO_EXPORT=1 builds a fully static bundle (catalog + media snapshot) that runs without a server.
const isDemoExport = process.env.DEMO_EXPORT === '1';

const config: NextConfig = {
  output: isDemoExport ? 'export' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default config;
