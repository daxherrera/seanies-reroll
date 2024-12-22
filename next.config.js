/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    REACT_APP_SOLANA_RPC_HOST: process.env.REACT_APP_SOLANA_RPC_HOST,
    REACT_APP_NETWORK: process.env.REACT_APP_NETWORK,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.ipfs.w3s.link', // Supports all subdomains under ipfs.w3s.link
      },
      {
        protocol: 'https',
        hostname: 'arweave.net', // Supports arweave.net
      },
    ],
  },
};

module.exports = nextConfig;
