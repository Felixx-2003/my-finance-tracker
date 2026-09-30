import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  env: { NEXT_PUBLIC_CLOUD_MODE: process.env.VERCEL === '1' || process.env.DEPLOYMENT_MODE === 'cloud' ? 'true' : 'false' },
};

export default nextConfig;
