import { CatalogLanding } from "./page.client";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Catalogue public",
  description:
    "Parcourez les albums et les images partagés publiquement sur ShareX Manager.",
  path: "/catalog",
});


export default function CatalogPage() {
  return <CatalogLanding />;
}

