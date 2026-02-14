/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    // Force new build ID every time to prevent aggressive caching
    return `build-${Date.now()}`
  },
  // Removed rewrites - using explicit API route handlers instead
};

module.exports = nextConfig;
