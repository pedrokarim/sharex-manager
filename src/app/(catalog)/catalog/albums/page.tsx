import { PageTransition } from "@/components/page-transition";
import { readCatalogOverviewSafely } from "@/lib/public-catalog";
import { publicPageMetadata } from "@/lib/seo";
import { CatalogAlbumsPage } from "./page.client";

export const metadata = publicPageMetadata({
  title: "Albums publics",
  description:
    "Tous les albums partagés publiquement, du plus récent au plus ancien.",
  path: "/catalog/albums",
});

export default function AlbumsPage() {
  // Lus côté serveur : la liste arrive avec la page, sans écran d'attente.
  const { albums } = readCatalogOverviewSafely({ limit: 200, includeImages: true });

  return (
    <PageTransition>
      <CatalogAlbumsPage albums={albums} />
    </PageTransition>
  );
}
