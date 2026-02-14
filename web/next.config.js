/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    // Force new build ID every time to prevent aggressive caching
    return `build-${Date.now()}`
  },
  experimental: {
    // Allow useSearchParams() in client components without Suspense boundary
    missingSuspenseWithCSRBailout: false,
  },
};

module.exports = nextConfig;
