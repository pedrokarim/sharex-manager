import { PageTransition } from "@/components/page-transition";
import { readCatalogOverviewSafely } from "@/lib/public-catalog";
import { publicPageMetadata } from "@/lib/seo";
import { CatalogLanding } from "./page.client";

export const metadata = publicPageMetadata({
  title: "Catalogue public",
  description:
    "Parcourez les albums et les images partagés publiquement sur ShareX Manager.",
  path: "/catalog",
});

export default function CatalogPage() {
  // Lu ici, côté serveur : la page arrive déjà remplie, sans écran d'attente.
  // 24 images suffisent à peupler la mosaïque, qui les recycle en boucle.
  const catalog = readCatalogOverviewSafely({ limit: 5, includeImages: true, randomImages: 24 });

  return (
    <PageTransition>
      <CatalogLanding catalog={catalog} />
    </PageTransition>
  );
}
