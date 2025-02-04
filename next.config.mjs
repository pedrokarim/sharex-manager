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
                source: '/:path*', // Capture toutes les requêtes
                has: [{ type: 'host', value: 'img.ascencia.io' }], // Vérifie le domaine
                destination: 'http://sxm.ascencia.io/img-handler/:path*', // Redirige vers la nouvelle URL
            },
        ];
    },
};

export default nextConfig;
