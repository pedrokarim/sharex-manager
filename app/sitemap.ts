import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";
import { albumsDb } from "@/lib/utils/albums-db";

/**
 * Le `robots.txt` annonçait déjà un sitemap à cette adresse, mais rien ne le
 * servait : les robots tombaient sur un 404.
 *
 * Les albums publics y figurent un par un — ce sont les seules pages de contenu
 * du site, et celles qui changent.
 */
export const revalidate = 3600;

const STATIC_ROUTES: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/catalog", priority: 0.9, changeFrequency: "daily" },
  { path: "/catalog/albums", priority: 0.8, changeFrequency: "daily" },
  { path: "/catalog/gallery", priority: 0.8, changeFrequency: "daily" },
  { path: "/tools", priority: 0.7, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "monthly" },
  { path: "/branding", priority: 0.3, changeFrequency: "yearly" },
  { path: "/legal", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/legal/terms", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    for (const album of albumsDb.getAlbums()) {
      if (!album.isPublic || !album.publicSlug) continue;

      entries.push({
        url: absoluteUrl(`/catalog/albums/${album.publicSlug}`),
        lastModified: new Date(album.updatedAt ?? album.createdAt ?? now),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch (error) {
    // Base indisponible (build, première installation) : le sitemap reste
    // servi avec ses pages statiques plutôt que de faire échouer la route.
    console.error("Albums publics indisponibles pour le sitemap:", error);
  }

  return entries;
}
