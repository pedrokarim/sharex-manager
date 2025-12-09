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
