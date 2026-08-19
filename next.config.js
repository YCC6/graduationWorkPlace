/** @type {import('next').NextConfig} */
const nextConfig = {
  // 产出独立服务端，便于 Electron 内以子进程方式启动（对 next dev 无影响）
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

module.exports = nextConfig;
