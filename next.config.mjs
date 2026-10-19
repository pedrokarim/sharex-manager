import { imageHost, primaryAppOrigin } from './src/lib/security/cors-origins.mjs';

// Domaines lus dans l'environnement au moment du build (variables
// NEXT_PUBLIC_* passées en `args` dans docker-compose.yml) : un seul endroit,
// `src/lib/security/cors-origins.mjs`, partagé avec le proxy.
const appOrigin = primaryAppOrigin(process.env);
const imageDomainHost = imageHost(process.env);

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Les SDK Ascencia ID sont publiés en TypeScript source. Toute la chaîne
    // doit être transpilée, y compris les dépendances indirectes.
    transpilePackages: [
        '@ascencia/id-rbac',
        '@ascencia/id-core',
        '@ascencia/id-server',
    ],
    // Ignore typescript errors and linter errors
    typescript: {
        ignoreBuildErrors: true,
    },
    // Configuration Turbopack pour Next.js 16
    turbopack: {
        rules: {
            '*.svg': {
                loaders: [
                    {
                        loader: '@svgr/webpack',
                        options: {
                            icon: true,
                        },
                    },
                ],
                as: '*.js',
            },
        },
    },
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
    async redirects() {
        return [
            {
                // L'écran « Intelligence artificielle » est devenu « Services
                // externes » : il couvre aussi DeepL, les voix, SerpApi… Les
                // anciens liens et favoris y mènent, paramètres compris.
                source: '/admin/ai',
                destination: '/admin/services',
                permanent: true,
            },
            {
                source: '/admin/ai/:path*',
                destination: '/admin/services/:path*',
                permanent: true,
            },
        ];
    },
    async rewrites() {
        // Sans domaine d'images distinct, les images se servent par /img-handler.
        if (!imageDomainHost) return [];
        return [
            {
                // Redirection pour le domaine images vers le handler
                source: '/:path*',
                has: [{ type: "host", value: imageDomainHost }],
                destination: '/img-handler/:path*',
            },
        ];
    },
    async headers() {
        const securityHeaders = [
            {
                key: 'X-Content-Type-Options',
                value: 'nosniff',
            },
            {
                key: 'X-Frame-Options',
                value: 'DENY',
            },
            {
                key: 'Referrer-Policy',
                value: 'strict-origin-when-cross-origin',
            },
            {
                key: 'Strict-Transport-Security',
                value: 'max-age=31536000; includeSubDomains',
            },
            {
                key: 'Permissions-Policy',
                value: 'camera=(), microphone=(), geolocation=()',
            },
            {
                key: 'Content-Security-Policy',
                value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
            },
        ];

        return [
            {
                // Headers CORS pour le domaine d'images (public, lecture seule)
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
                    // Pas de Cache-Control ici : la route le fixe selon que
                    // la capture est publique ou privée (lib/file-handler.ts).
                    ...securityHeaders,
                ],
            },
            {
                // Security + CORS headers pour toutes les routes
                source: '/:path*',
                headers: [
                    // Pas d'Access-Control-Allow-Credentials : l'application ne
                    // s'appelle qu'elle-même. Avec, une page du domaine d'images
                    // ou d'une origine supplémentaire (admises par le proxy)
                    // pourrait lire les réponses d'une session connectée.
                    // Le proxy remplace cette valeur selon l'origine de la requête.
                    ...(appOrigin
                        ? [{ key: 'Access-Control-Allow-Origin', value: appOrigin }]
                        : []),
                    {
                        key: 'Access-Control-Allow-Headers',
                        value: 'Authorization,Accept,Origin,DNT,X-CustomHeader,Keep-Alive,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Content-Range,Range',
                    },
                    {
                        key: 'Access-Control-Allow-Methods',
                        value: 'GET,POST,OPTIONS,PUT,DELETE,PATCH',
                    },
                    ...securityHeaders,
                ],
            },
        ];
    },
};

export default nextConfig;
