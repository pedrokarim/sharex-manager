import { CatalogGalleryPage } from "./page.client";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Galerie publique",
  description:
    "Toutes les images des albums publics, réunies en une seule galerie.",
  path: "/catalog/gallery",
});


export default function GalleryPage() {
  return <CatalogGalleryPage />;
}

