/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ignore typescript errors and linter errors
    typescript: {
        ignoreBuildErrors: true,
    },
    // Configuration Turbopack pour Next.js 16
    turbopack: {},
    output: 'standalone',
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals = [...config.externals, 'bun:sqlite'];
        }

        // Configuration pour gérer les fichiers .node
        config.module.rules.push({
            test: /\.node$/,
            use: 'node-loader',
        });

        // Configuration pour node-canvas-webgl
        if (!isServer) {
            config.resolve.fallback = {
                ...config.resolve.fallback,
                canvas: false,
                'node-canvas-webgl': false,
            };
        }

        return config;
    },
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
                // Redirection pour le domaine images vers le handler
                source: '/:path*',
                has: [{ type: "host", value: "img.ascencia.re" }],
                destination: '/img-handler/:path*',
            },
        ];
    },
    async headers() {
        return [
            {
                // Headers CORS pour le domaine d'images
                source: '/img-handler/:path*',
                headers: [
                    {
                        key: 'Access-Control-Allow-Origin',
                        value: '*',
                    },
                    {
                        key: 'Access-Control-Allow-Methods',
                        value: 'GET, OPTIONS',
                    },
                    {
                        key: 'Access-Control-Allow-Headers',
                        value: 'Content-Type',
                    },
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                // Headers pour toutes les routes (utile pour le domaine principal)
                source: '/:path*',
                headers: [
                    {
                        key: 'Access-Control-Allow-Origin',
                        value: 'https://sxm.ascencia.re',
                    },
                    {
                        key: 'Access-Control-Allow-Credentials',
                        value: 'true',
                    },
                    {
                        key: 'Access-Control-Allow-Headers',
                        value: 'Authorization,Accept,Origin,DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range',
                    },
                    {
                        key: 'Access-Control-Allow-Methods',
                        value: 'GET,POST,OPTIONS,PUT,DELETE,PATCH',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
