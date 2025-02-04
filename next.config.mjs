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
        const domaineImg = process.env.NEXT_PUBLIC_IMAGE_DOMAIN;
        const domaineApp = process.env.NEXT_PUBLIC_APP_DOMAIN;

        if (!domaineImg || !domaineApp) {
            console.error('NEXT_PUBLIC_IMAGE_DOMAIN et NEXT_PUBLIC_APP_DOMAIN doivent être définis');
            return [];
        }

        return [
            {
                source: '/:path*', // Capture toutes les requêtes
                has: [{ type: 'host', value: domaineImg }], // Vérifie le domaine
                destination: `http://${domaineApp}/img-handler/:path*`, // Redirige vers la nouvelle URL
            },
        ];
    },
};

export default nextConfig;
