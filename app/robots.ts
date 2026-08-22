import type { MetadataRoute } from "next";

import { absoluteUrl, SITE_URL } from "@/lib/seo";

/**
 * Remplace l'ancien `public/robots.txt`, qui codait le domaine en dur et
 * laissait indexables la connexion, l'inscription, le compte et les modules.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/settings/",
          "/gallery/",
          "/albums/",
          "/uploads/",
          "/m/",
          "/login",
          "/register",
          "/forgot-password",
          "/account",
          "/dashboard",
          "/upgrade",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
