/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint and TypeScript ignore settings for deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Your existing experimental configuration
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '.app.github.dev',
        '.preview.app.github.dev'
      ]
    }
  },
  
  // Your existing webpack configuration
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      encoding: false,
    }
    return config
  },
  
  // Your existing images configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
        pathname: '/**',
      },
      // Adding a more permissive pattern for development
      {
        protocol: 'https',
        hostname: '**',
      }
    ],
  }
}

export default nextConfig