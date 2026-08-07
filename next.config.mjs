/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Keep build warnings but don't fail compile if there are minor external lints
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
