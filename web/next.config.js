/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    // Force new build ID every time to prevent aggressive caching
    return `build-${Date.now()}`
  },
  async rewrites() {
    // Proxy all /api/* calls to the FastAPI backend defined in NEXT_PUBLIC_API_URL
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    if (!apiBase) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
