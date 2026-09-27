import { CatalogAlbumsPage } from "./page.client";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Albums publics",
  description:
    "Tous les albums partagés publiquement, du plus récent au plus ancien.",
  path: "/catalog/albums",
});


export default function AlbumsPage() {
  return <CatalogAlbumsPage />;
}

