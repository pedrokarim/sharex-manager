/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ignore typescript errors and linter errors
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
};

export default nextConfig;
