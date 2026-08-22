import type { Metadata } from "next";

/**
 * URL publique du site.
 *
 * `NEXT_PUBLIC_API_URL` ne convient pas : elle vaut `http://localhost:3000` en
 * développement, et une image Open Graph doit être une URL absolue et publique
 * — sinon les aperçus partagés pointent sur la machine de l'auteur.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://sxm.ascencia.re"
).replace(/\/$/, "");

export const SITE_NAME = "ShareX Manager";

/** Le catalogue public a sa propre marque, affichée dans sa barre de navigation. */
export const CATALOG_NAME = "SXM Catalog";

/** Image Open Graph par défaut, servie par `app/og/route.tsx`. */
export const DEFAULT_OG_IMAGE = {
  url: `${SITE_URL}/og`,
  width: 1200,
  height: 630,
  alt: SITE_NAME,
};

export function absoluteUrl(path: string) {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Metadata d'une page publique : titre, description, canonical, Open Graph et
 * carte Twitter d'un seul tenant.
 */
export function publicPageMetadata(options: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = absoluteUrl(options.path);

  return {
    title: options.title,
    description: options.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "fr_FR",
      url,
      title: options.title,
      description: options.description,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: options.title,
      description: options.description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

/**
 * Metadata d'une page privée : un titre correct pour l'onglet du navigateur,
 * et une interdiction d'indexation. Ces pages n'ont rien à faire dans un moteur
 * de recherche, et la plupart redirigent vers la connexion de toute façon.
 */
export function privatePageMetadata(options: {
  title: string;
  description?: string;
}): Metadata {
  return {
    title: options.title,
    ...(options.description ? { description: options.description } : {}),
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}
