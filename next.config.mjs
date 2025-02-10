/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ignore typescript errors and linter errors
    typescript: {
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    output: 'standalone',
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: 'http',
                hostname: 'localhost',
                port: '3000',
                pathname: '/uploads/**',
            },
        ],
    },
    async rewrites() {
        return [
            {
                // Pour le dev
                source: "/:path*",
                has: [{ type: "host", value: "img.ascencia.io" }],
                destination: `http://sxm.ascencia.io/img-handler/:path*`,
            },
            {
                // Pour la prod
                source: "/:path*",
                has: [{ type: "host", value: "img.ascencia.re" }],
                destination: `https://sxm.ascencia.re/img-handler/:path*`,
            },
        ];
    },
};

export default nextConfig;
