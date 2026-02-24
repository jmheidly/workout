/** @type {import('next').NextConfig} */

const withPWA = require('next-pwa')({
  dest: 'public',
})

const nextConfig = withPWA({
  webpack(config, { isServer }) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    })

    if (isServer) {
      config.externals.push('better-sqlite3')
    }

    return config
  },
})

module.exports = {
  nextConfig,
  output: 'standalone',
}
